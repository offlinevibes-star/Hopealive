-- HopeAlive media library and post attachments.
-- Run this migration in the existing Supabase project's SQL Editor.

alter table public.posts
  add column if not exists media jsonb not null default '[]'::jsonb;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null unique,
  public_url text not null,
  caption text not null default '',
  category text not null default 'Events & activities',
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_assets enable row level security;

drop policy if exists "Public read published media" on public.media_assets;
create policy "Public read published media"
  on public.media_assets for select to anon, authenticated
  using (is_published = true or public.is_hopealive_admin());

drop policy if exists "Admins insert media metadata" on public.media_assets;
create policy "Admins insert media metadata"
  on public.media_assets for insert to authenticated
  with check (public.is_hopealive_admin());

drop policy if exists "Admins update media metadata" on public.media_assets;
create policy "Admins update media metadata"
  on public.media_assets for update to authenticated
  using (public.is_hopealive_admin())
  with check (public.is_hopealive_admin());

drop policy if exists "Admins delete media metadata" on public.media_assets;
create policy "Admins delete media metadata"
  on public.media_assets for delete to authenticated
  using (public.is_hopealive_admin());

grant select on public.media_assets to anon, authenticated;
grant select, insert, update, delete on public.media_assets to authenticated;

-- Public URLs allow visitors to view published content. File mutations remain admin-only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hopealive-media',
  'hopealive-media',
  true,
  52428800,
  array['image/*', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "HopeAlive admins list media files" on storage.objects;
create policy "HopeAlive admins list media files"
  on storage.objects for select to authenticated
  using (bucket_id = 'hopealive-media' and public.is_hopealive_admin());

drop policy if exists "HopeAlive admins upload media files" on storage.objects;
create policy "HopeAlive admins upload media files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'hopealive-media' and public.is_hopealive_admin());

drop policy if exists "HopeAlive admins update media files" on storage.objects;
create policy "HopeAlive admins update media files"
  on storage.objects for update to authenticated
  using (bucket_id = 'hopealive-media' and public.is_hopealive_admin())
  with check (bucket_id = 'hopealive-media' and public.is_hopealive_admin());

drop policy if exists "HopeAlive admins delete media files" on storage.objects;
create policy "HopeAlive admins delete media files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'hopealive-media' and public.is_hopealive_admin());
