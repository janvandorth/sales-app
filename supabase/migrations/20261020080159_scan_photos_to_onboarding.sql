-- The scanned photo of a paper contract goes with the sale to onboarding, which files it with the customer in
-- ZMAdmin (ZMSuite docs/paper-contract-photo.md). See _shared/onboarding.ts.
--   scan_path          the photo in the scans bucket, '' when the form was typed in. Deleted from the bucket once
--                      onboarding accepted the sale; the path stays as a record of what was sent.
--   'unconfirmed'      onboarding did not answer in time. The sale may have arrived, so it is not resent by
--                      sync-onboarding; check ZMAdmin, then set onboarding_status back to null to resend it.
alter table public.submissions add column scan_path text not null default '';

alter table public.submissions drop constraint submissions_onboarding_status_check;
alter table public.submissions add constraint submissions_onboarding_status_check
  check (onboarding_status in ('accepted', 'refused', 'failed', 'skipped', 'unconfirmed'));

-- Scans older than the retention period, for sync-onboarding to delete through the storage API (storage.objects
-- may not be deleted from SQL). At most 1000 per call; the rest go on the next run.
create function public.expired_scans(retention_days integer)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select name from storage.objects
  where bucket_id = 'scans' and created_at < now() - make_interval(days => retention_days)
  order by created_at
  limit 1000
$$;

revoke execute on function public.expired_scans(integer) from public, anon, authenticated;
grant execute on function public.expired_scans(integer) to service_role;
