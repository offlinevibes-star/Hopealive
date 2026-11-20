-- HopeAlive security and reliability hardening.
-- Safe additive migration: existing public media remains where it is; no objects or donations are deleted.

-- Store import provenance so the legacy importer can upsert stable source rows.
alter table public.donations add column if not exists source_key text;
create unique index if not exists donations_source_key_uidx
  on public.donations(source_key);

-- Private bucket for media that has not been approved for public display.
-- Existing public assets are intentionally not moved by this migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hopealive-private-media', 'hopealive-private-media', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Restrict future public-bucket uploads to formats approved by the admin UI.
-- Existing public objects remain accessible and are not modified.
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
where id = 'hopealive-media';

alter table public.media_assets add column if not exists storage_bucket text not null default 'hopealive-media';
alter table public.media_assets alter column public_url drop not null;
alter table public.media_assets add constraint media_assets_storage_bucket_check
  check (storage_bucket in ('hopealive-media','hopealive-private-media'));

drop policy if exists "HopeAlive admins list private media files" on storage.objects;
create policy "HopeAlive admins list private media files"
  on storage.objects for select to authenticated
  using (bucket_id = 'hopealive-private-media' and public.is_hopealive_admin());
drop policy if exists "HopeAlive admins upload private media files" on storage.objects;
create policy "HopeAlive admins upload private media files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'hopealive-private-media' and public.is_hopealive_admin());
drop policy if exists "HopeAlive admins update private media files" on storage.objects;
create policy "HopeAlive admins update private media files"
  on storage.objects for update to authenticated
  using (bucket_id = 'hopealive-private-media' and public.is_hopealive_admin())
  with check (bucket_id = 'hopealive-private-media' and public.is_hopealive_admin());
drop policy if exists "HopeAlive admins delete private media files" on storage.objects;
create policy "HopeAlive admins delete private media files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'hopealive-private-media' and public.is_hopealive_admin());

-- Rate-limit state is inaccessible to browser roles. Edge Function uses service_role.
create table if not exists public.contact_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  submission_count integer not null default 0 check (submission_count >= 0),
  updated_at timestamptz not null default now()
);
alter table public.contact_rate_limits enable row level security;
revoke all on public.contact_rate_limits from anon, authenticated;
grant all on public.contact_rate_limits to service_role;

create or replace function public.consume_contact_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_ip_hash is null or length(p_ip_hash) < 32 or length(p_ip_hash) > 128 then
    return false;
  end if;
  insert into public.contact_rate_limits(ip_hash, window_started_at, submission_count, updated_at)
  values (p_ip_hash, now(), 1, now())
  on conflict (ip_hash) do update
    set window_started_at = case
          when public.contact_rate_limits.window_started_at < now() - interval '15 minutes' then now()
          else public.contact_rate_limits.window_started_at end,
        submission_count = case
          when public.contact_rate_limits.window_started_at < now() - interval '15 minutes' then 1
          else public.contact_rate_limits.submission_count + 1 end,
        updated_at = now()
  returning submission_count into v_count;
  return v_count <= 5;
end;
$$;
revoke all on function public.consume_contact_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_contact_rate_limit(text) to service_role;

-- Public messages must go through the rate-limited Edge Function, not direct table inserts.
drop policy if exists "Visitors may submit contact messages" on public.contact_messages;
revoke insert on public.contact_messages from anon, authenticated;
grant insert on public.contact_messages to service_role;

-- Remove overlapping permissive SELECT policies while preserving public published reads and admin access.
drop policy if exists "Public can read published posts" on public.posts;
drop policy if exists "Admins manage posts" on public.posts;
create policy "Read published posts or admin posts"
  on public.posts for select to anon, authenticated
  using (not is_draft or (auth.role() = 'authenticated' and public.is_hopealive_admin()));
create policy "Admins insert posts"
  on public.posts for insert to authenticated with check (public.is_hopealive_admin());
create policy "Admins update posts"
  on public.posts for update to authenticated using (public.is_hopealive_admin())
  with check (public.is_hopealive_admin());
create policy "Admins delete posts"
  on public.posts for delete to authenticated using (public.is_hopealive_admin());

drop policy if exists "Public can read site settings" on public.site_settings;
drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Public read site settings"
  on public.site_settings for select to anon, authenticated using (true);
create policy "Admins insert site settings"
  on public.site_settings for insert to authenticated with check (public.is_hopealive_admin());
create policy "Admins update site settings"
  on public.site_settings for update to authenticated using (public.is_hopealive_admin())
  with check (public.is_hopealive_admin());
create policy "Admins delete site settings"
  on public.site_settings for delete to authenticated using (public.is_hopealive_admin());

grant select on public.posts, public.site_settings to anon, authenticated;
grant select, insert, update, delete on public.posts, public.site_settings to authenticated;
