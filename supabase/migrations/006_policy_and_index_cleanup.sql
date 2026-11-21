-- HopeAlive policy and index cleanup.
-- Removes redundant RLS evaluation while retaining admin-only access.

-- The admin helper is safe as an invoker function because each authenticated
-- caller can read only their own allow-list row under this table's RLS policy.
alter table public.admin_users enable row level security;
drop policy if exists "Users read own admin membership" on public.admin_users;
create policy "Users read own admin membership"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.admin_users to authenticated;
revoke insert, update, delete on public.admin_users from anon, authenticated;

create or replace function public.is_hopealive_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_hopealive_admin() from public, anon;
grant execute on function public.is_hopealive_admin() to authenticated;

-- Explicit false policies document that these internal tables are not exposed
-- to browser roles; service_role continues to bypass RLS as intended.
drop policy if exists "No browser access to contact rate limits" on public.contact_rate_limits;
create policy "No browser access to contact rate limits"
  on public.contact_rate_limits for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "No browser access to media cleanup jobs" on public.media_cleanup_jobs;
create policy "No browser access to media cleanup jobs"
  on public.media_cleanup_jobs for all to anon, authenticated
  using (false) with check (false);

-- Keep one SELECT policy per browser role. Authenticated readers see published
-- posts and allow-listed admins additionally see drafts; anonymous visitors only
-- see published posts.
drop policy if exists "Read published posts or admin posts" on public.posts;
drop policy if exists "Public can read published posts" on public.posts;
drop policy if exists "Admins read all posts" on public.posts;
drop policy if exists "Anon read published posts" on public.posts;
drop policy if exists "Authenticated read published or admin posts" on public.posts;

create policy "Anon read published posts"
  on public.posts for select to anon
  using (not is_draft);

create policy "Authenticated read published or admin posts"
  on public.posts for select to authenticated
  using (not is_draft or (select public.is_hopealive_admin()));

-- Cover the foreign keys used for joins and parent-row deletes.
create index if not exists admin_activity_logs_actor_id_idx
  on public.admin_activity_logs (actor_id)
  where actor_id is not null;

create index if not exists media_cleanup_jobs_media_asset_id_idx
  on public.media_cleanup_jobs (media_asset_id)
  where media_asset_id is not null;

create index if not exists media_cleanup_jobs_requested_by_idx
  on public.media_cleanup_jobs (requested_by)
  where requested_by is not null;
