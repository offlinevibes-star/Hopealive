-- HopeAlive CMS: run this in Supabase SQL Editor.
-- Admins are explicitly allow-listed in public.admin_users. Never expose service_role keys.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

create or replace function public.is_hopealive_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_hopealive_admin() from public;
grant execute on function public.is_hopealive_admin() to authenticated;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 180),
  excerpt text not null default '',
  body_html text not null default '',
  category text not null default 'News',
  tags text[] not null default '{}',
  author text not null default 'HopeAlive Foundation',
  featured_image text not null default '',
  published_at date,
  is_draft boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.posts enable row level security;
create policy "Public can read published posts" on public.posts
  for select to anon, authenticated using (not is_draft);
create policy "Admins manage posts" on public.posts
  for all to authenticated using (public.is_hopealive_admin())
  with check (public.is_hopealive_admin());

create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create policy "Public can read site settings" on public.site_settings
  for select to anon, authenticated using (true);
create policy "Admins manage site settings" on public.site_settings
  for all to authenticated using (public.is_hopealive_admin())
  with check (public.is_hopealive_admin());

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor text not null default '',
  amount numeric(14,2) not null check (amount > 0),
  donation_date date not null,
  method text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.donations enable row level security;
create policy "Admins manage donations" on public.donations
  for all to authenticated using (public.is_hopealive_admin())
  with check (public.is_hopealive_admin());

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null check (length(trim(sender_name)) between 1 and 120),
  sender_email text not null check (length(sender_email) between 3 and 254),
  message text not null check (length(trim(message)) between 1 and 5000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
-- Visitors may submit a message, but cannot select, update, or delete any message.
create policy "Visitors may submit contact messages" on public.contact_messages
  for insert to anon, authenticated
  with check (
    length(trim(sender_name)) between 1 and 120
    and length(sender_email) between 3 and 254
    and length(trim(message)) between 1 and 5000
  );
create policy "Admins read contact messages" on public.contact_messages
  for select to authenticated using (public.is_hopealive_admin());
create policy "Admins update contact messages" on public.contact_messages
  for update to authenticated using (public.is_hopealive_admin())
  with check (public.is_hopealive_admin());
create policy "Admins delete contact messages" on public.contact_messages
  for delete to authenticated using (public.is_hopealive_admin());

grant select on public.posts, public.site_settings to anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant select, insert, update, delete on public.posts, public.site_settings, public.donations, public.contact_messages to authenticated;

insert into public.site_settings (id, settings)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
