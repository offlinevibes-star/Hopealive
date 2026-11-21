-- Tighten media/admin RPC exposure and preserve the verified actor on service-role work.
-- The Edge Function verifies the user's signed-in identity and allow-list membership;
-- these internal RPCs accept the verified UUID and are executable only by service_role.

-- Replace browser-callable media RPCs with service-role-only actor-scoped variants.
revoke all on function public.get_media_integrity_report() from public, anon, authenticated, service_role;
drop function if exists public.get_media_integrity_report();

revoke all on function public.enqueue_media_asset_delete(uuid) from public, anon, authenticated, service_role;
drop function if exists public.enqueue_media_asset_delete(uuid);

revoke all on function public.enqueue_media_orphan_delete(text, text) from public, anon, authenticated, service_role;
drop function if exists public.enqueue_media_orphan_delete(text, text);

revoke all on function public.set_media_asset_visibility(uuid, text, text, text) from public, anon, authenticated, service_role;
drop function if exists public.set_media_asset_visibility(uuid, text, text, text);

create or replace function public.get_media_integrity_report(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orphans jsonb;
  v_referenced jsonb;
  v_broken jsonb;
begin
  if p_actor_id is null or not exists (
    select 1 from public.admin_users where user_id = p_actor_id
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', o.bucket_id, 'path', o.name, 'created_at', o.created_at
  ) order by o.created_at), '[]'::jsonb)
  into v_orphans
  from storage.objects o
  where o.bucket_id in ('hopealive-media', 'hopealive-private-media')
    and not exists (
      select 1 from public.media_assets m
      where m.storage_bucket = o.bucket_id and m.storage_path = o.name
    )
    and not public.hopealive_media_content_references(o.bucket_id, o.name, null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', o.bucket_id, 'path', o.name, 'created_at', o.created_at
  ) order by o.created_at), '[]'::jsonb)
  into v_referenced
  from storage.objects o
  where o.bucket_id in ('hopealive-media', 'hopealive-private-media')
    and not exists (
      select 1 from public.media_assets m
      where m.storage_bucket = o.bucket_id and m.storage_path = o.name
    )
    and public.hopealive_media_content_references(o.bucket_id, o.name, null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'bucket', m.storage_bucket, 'path', m.storage_path,
    'display_name', m.display_name, 'delete_pending', m.delete_pending,
    'is_referenced', public.hopealive_media_content_references(m.storage_bucket, m.storage_path, m.public_url)
  ) order by m.created_at), '[]'::jsonb)
  into v_broken
  from public.media_assets m
  where not exists (
    select 1 from storage.objects o
    where o.bucket_id = m.storage_bucket and o.name = m.storage_path
  );

  return jsonb_build_object(
    'checked_at', now(),
    'orphaned_objects', v_orphans,
    'referenced_unregistered_objects', v_referenced,
    'broken_records', v_broken,
    'orphaned_object_count', jsonb_array_length(v_orphans),
    'referenced_unregistered_object_count', jsonb_array_length(v_referenced),
    'broken_record_count', jsonb_array_length(v_broken)
  );
end;
$$;
revoke all on function public.get_media_integrity_report(uuid) from public, anon, authenticated;
grant execute on function public.get_media_integrity_report(uuid) to service_role;

create or replace function public.enqueue_media_asset_delete(p_actor_id uuid, p_asset_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_job_id uuid;
begin
  if p_actor_id is null or not exists (
    select 1 from public.admin_users where user_id = p_actor_id
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
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
    'delete_asset', v_asset.id, v_asset.storage_bucket, v_asset.storage_path, v_asset.public_url, p_actor_id
  ) returning id into v_job_id;

  update public.media_assets
  set delete_pending = true, updated_at = now()
  where id = p_asset_id;

  return v_job_id;
end;
$$;
revoke all on function public.enqueue_media_asset_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_media_asset_delete(uuid, uuid) to service_role;

create or replace function public.enqueue_media_orphan_delete(p_actor_id uuid, p_bucket text, p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if p_actor_id is null or not exists (
    select 1 from public.admin_users where user_id = p_actor_id
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
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
  ) values ('delete_orphan', p_bucket, p_path, p_actor_id)
  on conflict (operation, storage_bucket, storage_path)
    where status in ('pending', 'running', 'failed', 'blocked')
  do update set updated_at = now()
  returning id into v_job_id;

  return v_job_id;
end;
$$;
revoke all on function public.enqueue_media_orphan_delete(uuid, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_media_orphan_delete(uuid, text, text) to service_role;

create or replace function public.set_media_asset_visibility(
  p_actor_id uuid,
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
  if p_actor_id is null or not exists (
    select 1 from public.admin_users where user_id = p_actor_id
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
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
    'delete_orphan', v_asset.storage_bucket, v_asset.storage_path, v_asset.public_url, p_actor_id
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
revoke all on function public.set_media_asset_visibility(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_media_asset_visibility(uuid, uuid, text, text, text) to service_role;

create or replace function public.finalize_media_asset_delete(p_job_id uuid, p_actor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset_id uuid;
begin
  if p_actor_id is null or not exists (
    select 1 from public.admin_users where user_id = p_actor_id
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);

  select media_asset_id into v_asset_id
  from public.media_cleanup_jobs
  where id = p_job_id
    and operation = 'delete_asset'
    and status = 'running'
  for update;

  if not found or v_asset_id is null then
    return false;
  end if;

  delete from public.media_assets
  where id = v_asset_id and delete_pending = true;
  if not found then
    raise exception 'Pending media metadata could not be finalized' using errcode = '23503';
  end if;

  update public.media_cleanup_jobs
  set status = 'completed', last_error = null,
      completed_at = now(), updated_at = now()
  where id = p_job_id;

  return true;
end;
$$;
revoke all on function public.finalize_media_asset_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_media_asset_delete(uuid, uuid) to service_role;

-- The auth-event RPC only inserts a caller-owned login/logout record. Make it
-- invoker-rights and enforce its scope with RLS instead of exposing a definer RPC.
revoke all on function public.record_admin_auth_event(text) from public, anon, authenticated;
drop function if exists public.record_admin_auth_event(text);

drop policy if exists "Admins insert own auth activity" on public.admin_activity_logs;
create policy "Admins insert own auth activity"
  on public.admin_activity_logs for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and action in ('login', 'logout')
    and table_name = 'auth'
    and (select public.is_hopealive_admin())
  );
grant insert on public.admin_activity_logs to authenticated;

create or replace function public.record_admin_auth_event(p_action text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_hopealive_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('login', 'logout') then
    raise exception 'Unsupported activity action' using errcode = '22023';
  end if;
  insert into public.admin_activity_logs(actor_id, action, table_name, summary)
  values (auth.uid(), p_action, 'auth',
    case when p_action = 'login' then 'Administrator signed in.' else 'Administrator signed out.' end);
end;
$$;
revoke all on function public.record_admin_auth_event(text) from public, anon;
grant execute on function public.record_admin_auth_event(text) to authenticated;
