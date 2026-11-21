-- HopeAlive media operations and layered contact abuse controls.
-- Additive: no existing Storage objects or application records are removed.

-- Keep the metadata columns present even if migration 004 was only partially applied.
alter table public.media_assets
  add column if not exists display_name text,
  add column if not exists alt_text text not null default '',
  add column if not exists delete_pending boolean not null default false;

update public.media_assets
set display_name = coalesce(nullif(trim(display_name), ''), filename)
where display_name is null or trim(display_name) = '';

alter table public.media_assets
  alter column display_name set default '',
  alter column display_name set not null;

create index if not exists media_assets_created_at_id_idx
  on public.media_assets (created_at desc, id desc);
create index if not exists media_assets_type_visibility_created_idx
  on public.media_assets (media_type, is_published, created_at desc);
create index if not exists media_assets_display_name_idx
  on public.media_assets (lower(display_name));

-- Jobs make Storage cleanup retryable after non-transactional Storage/DB operations.
create table if not exists public.media_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  operation text not null check (operation in ('delete_asset', 'delete_orphan')),
  media_asset_id uuid references public.media_assets(id) on delete set null,
  storage_bucket text not null check (storage_bucket in ('hopealive-media', 'hopealive-private-media')),
  storage_path text not null check (length(trim(storage_path)) between 1 and 1024),
  reference_url text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'failed', 'blocked', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.media_cleanup_jobs enable row level security;
revoke all on public.media_cleanup_jobs from public, anon, authenticated;
grant all on public.media_cleanup_jobs to service_role;

alter table public.media_cleanup_jobs
  add column if not exists reference_url text;

create unique index if not exists media_cleanup_jobs_active_path_uidx
  on public.media_cleanup_jobs (operation, storage_bucket, storage_path)
  where status in ('pending', 'running', 'failed', 'blocked');
create index if not exists media_cleanup_jobs_status_created_idx
  on public.media_cleanup_jobs (status, created_at);

-- Serialize new content references against the pending-delete/cleanup state.
-- The row locks mean a content write and a cleanup request cannot pass one another
-- without one side observing the other's committed state.
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
revoke all on function public.prevent_referencing_pending_media() from public, anon, authenticated;

drop trigger if exists prevent_pending_media_reference_on_posts on public.posts;
create trigger prevent_pending_media_reference_on_posts
  before insert or update of featured_image, body_html, media on public.posts
  for each row execute function public.prevent_referencing_pending_media();

drop trigger if exists prevent_pending_media_reference_on_settings on public.site_settings;
create trigger prevent_pending_media_reference_on_settings
  before insert or update of settings on public.site_settings
  for each row execute function public.prevent_referencing_pending_media();

-- Browser administrators must request deletions through the authenticated Edge Function.
revoke delete on public.media_assets from anon, authenticated;
grant select, insert, update on public.media_assets to authenticated;

-- Remove only the HopeAlive bucket delete policies. storage.objects is shared by
-- every bucket in the Supabase project, so do not revoke table-wide DELETE grants.
-- HopeAlive objects are now deleted only by the service-role cleanup function.
drop policy if exists "HopeAlive admins delete media files" on storage.objects;
drop policy if exists "HopeAlive admins delete private media files" on storage.objects;

-- Keep published reads public while avoiding the deprecated auth.role() policy expression.
drop policy if exists "Read published posts or admin posts" on public.posts;
drop policy if exists "Public can read published posts" on public.posts;
drop policy if exists "Admins read all posts" on public.posts;
create policy "Public can read published posts"
  on public.posts for select to anon, authenticated
  using (not is_draft);
create policy "Admins read all posts"
  on public.posts for select to authenticated
  using ((select public.is_hopealive_admin()));

create or replace function public.hopealive_media_content_references(
  p_storage_bucket text,
  p_storage_path text,
  p_public_url text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.posts p
      where (p_public_url is not null and to_jsonb(p)::text ilike '%' || p_public_url || '%')
         or p.featured_image ilike '%' || p_storage_path || '%'
         or p.body_html ilike '%' || p_storage_path || '%'
         or exists (
           select 1
           from jsonb_array_elements(
             case when jsonb_typeof(p.media) = 'array' then p.media else '[]'::jsonb end
           ) attachment
           where attachment->>'path' = p_storage_path
             and coalesce(attachment->>'bucket', 'hopealive-media') = p_storage_bucket
         )
    )
    or exists (
      select 1
      from public.site_settings s
      where s.settings::text ilike '%' || p_storage_path || '%'
         or (p_public_url is not null and s.settings::text ilike '%' || p_public_url || '%')
    );
$$;
revoke all on function public.hopealive_media_content_references(text, text, text) from public, anon, authenticated;
grant execute on function public.hopealive_media_content_references(text, text, text) to service_role;

create or replace function public.get_media_integrity_report()
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
  if not public.is_hopealive_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

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
revoke all on function public.get_media_integrity_report() from public, anon;
grant execute on function public.get_media_integrity_report() to authenticated;

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

-- Called only by the admin-media Edge Function after it has verified the administrator JWT.
-- The old object is queued inside the same DB transaction as the metadata switch.
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
  select * into v_asset
  from public.media_assets
  where id = p_asset_id
  for update;

  if not found then
    raise exception 'Media record not found' using errcode = 'P0002';
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

-- Atomic fixed-window rate limiter for global, email and trusted-IP keys.
create or replace function public.consume_contact_rate_limit_v2(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_key_hash is null or length(p_key_hash) <> 64
     or p_limit is null or p_limit < 1 or p_limit > 10000
     or p_window_seconds is null or p_window_seconds < 30 or p_window_seconds > 86400 then
    return false;
  end if;

  insert into public.contact_rate_limits(ip_hash, window_started_at, submission_count, updated_at)
  values (p_key_hash, now(), 1, now())
  on conflict (ip_hash) do update
    set window_started_at = case
          when public.contact_rate_limits.window_started_at
            <= now() - make_interval(secs => p_window_seconds) then now()
          else public.contact_rate_limits.window_started_at
        end,
        submission_count = case
          when public.contact_rate_limits.window_started_at
            <= now() - make_interval(secs => p_window_seconds) then 1
          else public.contact_rate_limits.submission_count + 1
        end,
        updated_at = now()
  returning submission_count into v_count;

  return v_count <= p_limit;
end;
$$;
revoke all on function public.consume_contact_rate_limit_v2(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_contact_rate_limit_v2(text, integer, integer) to service_role;

create or replace function public.cleanup_contact_rate_limits()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.contact_rate_limits
  where updated_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.cleanup_contact_rate_limits() from public, anon, authenticated;
grant execute on function public.cleanup_contact_rate_limits() to service_role;
