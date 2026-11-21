-- Serialize reference creation against media cleanup and visibility moves.
-- A shared transaction lock is taken by content writes; media state changes take
-- the corresponding exclusive lock before checking references and enqueuing work.
-- This closes the absent-row race that ordinary row locks cannot protect.

create or replace function public.prevent_referencing_pending_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_row jsonb := to_jsonb(new);
  v_conflict_id uuid;
begin
  -- Must use the same advisory key as the exclusive locks in the three
  -- media-operation RPCs below. The lock is held until this transaction ends.
  perform pg_advisory_xact_lock_shared(1479618616, 1);

  for v_conflict_id in
    select m.id
    from public.media_assets m
    where m.delete_pending
      and (
        v_new_row::text ilike '%' || m.storage_path || '%'
        or (m.public_url is not null and v_new_row::text ilike '%' || m.public_url || '%')
      )
    for share of m
  loop
    raise exception 'Media asset is pending deletion and cannot be attached to content'
      using errcode = '23503';
  end loop;

  for v_conflict_id in
    select j.id
    from public.media_cleanup_jobs j
    where j.status in ('pending', 'running', 'failed', 'blocked')
      and (
        v_new_row::text ilike '%' || j.storage_path || '%'
        or (j.reference_url is not null and v_new_row::text ilike '%' || j.reference_url || '%')
      )
    for share of j
  loop
    raise exception 'Media Storage object has a pending cleanup job'
      using errcode = '23503';
  end loop;

  return new;
end;
$$;

create or replace function public.enqueue_media_asset_delete(p_asset_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_job_id uuid;
begin
  if not public.is_hopealive_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  -- Exclude reference-writing transactions while we inspect references and
  -- atomically commit delete_pending plus the durable cleanup job.
  perform pg_advisory_xact_lock(1479618616, 1);

  select * into v_asset
  from public.media_assets
  where id = p_asset_id
  for update;

  if not found then
    raise exception 'Media record not found' using errcode = 'P0002';
  end if;

  if public.hopealive_media_content_references(v_asset.storage_bucket, v_asset.storage_path, v_asset.public_url) then
    raise exception 'Media is referenced by a post or public setting and cannot be deleted' using errcode = '23503';
  end if;

  select id into v_job_id
  from public.media_cleanup_jobs
  where operation = 'delete_asset'
    and media_asset_id = p_asset_id
    and status in ('pending', 'running', 'failed', 'blocked')
  order by created_at desc
  limit 1;

  if v_job_id is not null then
    update public.media_assets set delete_pending = true where id = p_asset_id;
    return v_job_id;
  end if;

  insert into public.media_cleanup_jobs(
    operation, media_asset_id, storage_bucket, storage_path, reference_url, requested_by
  ) values (
    'delete_asset', v_asset.id, v_asset.storage_bucket, v_asset.storage_path, v_asset.public_url, auth.uid()
  ) returning id into v_job_id;

  update public.media_assets
  set delete_pending = true, updated_at = now()
  where id = p_asset_id;

  return v_job_id;
end;
$$;
revoke all on function public.enqueue_media_asset_delete(uuid) from public, anon;
grant execute on function public.enqueue_media_asset_delete(uuid) to authenticated;

create or replace function public.enqueue_media_orphan_delete(p_bucket text, p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if not public.is_hopealive_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  -- Lock before the reference and registration checks, not after the insert.
  perform pg_advisory_xact_lock(1479618616, 1);

  if p_bucket not in ('hopealive-media', 'hopealive-private-media')
     or p_path is null or length(trim(p_path)) < 1 or length(p_path) > 1024 then
    raise exception 'Invalid media object' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.media_assets
    where storage_bucket = p_bucket and storage_path = p_path
  ) then
    raise exception 'Storage object is still registered in the media library' using errcode = '23503';
  end if;
  if public.hopealive_media_content_references(p_bucket, p_path, null) then
    raise exception 'Storage object is referenced by content and cannot be deleted' using errcode = '23503';
  end if;
  if not exists (
    select 1 from storage.objects where bucket_id = p_bucket and name = p_path
  ) then
    raise exception 'Storage object no longer exists' using errcode = 'P0002';
  end if;

  insert into public.media_cleanup_jobs(
    operation, storage_bucket, storage_path, requested_by
  ) values ('delete_orphan', p_bucket, p_path, auth.uid())
  on conflict (operation, storage_bucket, storage_path)
    where status in ('pending', 'running', 'failed', 'blocked')
  do update set updated_at = now()
  returning id into v_job_id;

  return v_job_id;
end;
$$;
revoke all on function public.enqueue_media_orphan_delete(text, text) from public, anon;
grant execute on function public.enqueue_media_orphan_delete(text, text) to authenticated;

create or replace function public.set_media_asset_visibility(
  p_asset_id uuid,
  p_target_bucket text,
  p_target_path text,
  p_target_public_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_job_id uuid;
begin
  -- This RPC is service-role-only and called after the Edge Function verifies
  -- the requesting administrator's signed-in JWT.
  perform pg_advisory_xact_lock(1479618616, 1);

  select * into v_asset
  from public.media_assets
  where id = p_asset_id
  for update;

  if not found then
    raise exception 'Media record not found' using errcode = 'P0002';
  end if;
  if v_asset.delete_pending then
    raise exception 'Media asset is pending deletion and cannot change visibility' using errcode = '23503';
  end if;
  if p_target_bucket not in ('hopealive-media', 'hopealive-private-media')
     or p_target_path is null or length(trim(p_target_path)) < 1
     or (p_target_bucket = 'hopealive-media' and p_target_public_url is null)
     or (p_target_bucket = 'hopealive-private-media' and p_target_public_url is not null) then
    raise exception 'Invalid target media location' using errcode = '22023';
  end if;
  if v_asset.storage_bucket = p_target_bucket and v_asset.storage_path = p_target_path then
    return null;
  end if;
  if public.hopealive_media_content_references(v_asset.storage_bucket, v_asset.storage_path, v_asset.public_url) then
    raise exception 'Media is referenced by a post or public setting; change the post/media publication state first' using errcode = '23503';
  end if;

  insert into public.media_cleanup_jobs(
    operation, storage_bucket, storage_path, reference_url, requested_by
  ) values (
    'delete_orphan', v_asset.storage_bucket, v_asset.storage_path, v_asset.public_url, auth.uid()
  )
  on conflict (operation, storage_bucket, storage_path)
    where status in ('pending', 'running', 'failed', 'blocked')
  do update set updated_at = now()
  returning id into v_job_id;

  update public.media_assets
  set storage_bucket = p_target_bucket,
      storage_path = p_target_path,
      public_url = p_target_public_url,
      is_published = (p_target_bucket = 'hopealive-media'),
      updated_at = now()
  where id = p_asset_id;

  return v_job_id;
end;
$$;
revoke all on function public.set_media_asset_visibility(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_media_asset_visibility(uuid, text, text, text) to service_role;
