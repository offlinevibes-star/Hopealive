-- HopeAlive media metadata, audit trail and rate-limit retention.
-- Additive only: existing records and Storage objects are preserved.
alter table public.media_assets
  add column if not exists display_name text,
  add column if not exists alt_text text not null default '';
update public.media_assets set display_name = filename
where display_name is null or length(trim(display_name)) = 0;
alter table public.media_assets alter column display_name set default '';
alter table public.media_assets alter column display_name set not null;

create table if not exists public.admin_activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('insert','update','delete')),
  table_name text not null,
  record_id text,
  summary text not null default 'Administrator changed a record.',
  created_at timestamptz not null default now()
);
alter table public.admin_activity_logs enable row level security;
drop policy if exists "Admins read activity logs" on public.admin_activity_logs;
create policy "Admins read activity logs" on public.admin_activity_logs
  for select to authenticated using (public.is_hopealive_admin());
revoke all on public.admin_activity_logs from anon, authenticated;
grant select on public.admin_activity_logs to authenticated;
grant usage, select on sequence public.admin_activity_logs_id_seq to authenticated;

create or replace function public.log_hopealive_admin_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_record jsonb; v_id text;
begin
  if TG_OP = 'DELETE' then v_record := to_jsonb(OLD); else v_record := to_jsonb(NEW); end if;
  v_id := coalesce(v_record->>'id', v_record->>'slug');
  insert into public.admin_activity_logs(actor_id, action, table_name, record_id, summary)
  values (auth.uid(), lower(TG_OP), TG_TABLE_NAME, v_id,
    'Administrator ' || lower(TG_OP) || ' a ' || replace(TG_TABLE_NAME, '_', ' ') || ' record.');
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.log_hopealive_admin_change() from public, anon, authenticated;
drop trigger if exists hopealive_audit_posts on public.posts;
create trigger hopealive_audit_posts after insert or update or delete on public.posts
for each row execute function public.log_hopealive_admin_change();
drop trigger if exists hopealive_audit_media_assets on public.media_assets;
create trigger hopealive_audit_media_assets after insert or update or delete on public.media_assets
for each row execute function public.log_hopealive_admin_change();
drop trigger if exists hopealive_audit_site_settings on public.site_settings;
create trigger hopealive_audit_site_settings after insert or update or delete on public.site_settings
for each row execute function public.log_hopealive_admin_change();
drop trigger if exists hopealive_audit_donations on public.donations;
create trigger hopealive_audit_donations after insert or update or delete on public.donations
for each row execute function public.log_hopealive_admin_change();

create or replace function public.cleanup_contact_rate_limits()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_deleted bigint;
begin
  delete from public.contact_rate_limits where updated_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.cleanup_contact_rate_limits() from public, anon, authenticated;
grant execute on function public.cleanup_contact_rate_limits() to service_role;
