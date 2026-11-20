-- Atomically claim cleanup work so concurrent admin requests cannot process the same job.
create or replace function public.claim_media_cleanup_job(
  p_job_id uuid,
  p_stale_before timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.media_cleanup_jobs%rowtype;
begin
  update public.media_cleanup_jobs
  set status = 'running',
      attempts = attempts + 1,
      last_error = null,
      updated_at = now()
  where id = p_job_id
    and (
      status in ('pending', 'failed', 'blocked')
      or (status = 'running' and updated_at < p_stale_before)
    )
  returning * into v_job;

  if not found then
    return null;
  end if;

  return to_jsonb(v_job);
end;
$$;

revoke all on function public.claim_media_cleanup_job(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_media_cleanup_job(uuid, timestamptz)
  to service_role;
