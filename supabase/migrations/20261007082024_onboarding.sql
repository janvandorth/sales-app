-- Every submission is also sent to the Zeker en Mobiel onboarding endpoint (Contracts API, Appeee/Paper), which
-- creates the customer in ZMAdmin. See _shared/onboarding.ts.
--   onboarding_status   null = not sent yet; 'accepted' (202, queued), 'refused' (422, the data needs fixing),
--                       'failed' (500, recorded in ZMAdmin's IntakeFailures), 'skipped' (submitted before this
--                       integration existed; the office already entered those from the sheet)
--   onboarding_response the endpoint's JSON answer (klantnummer, correlation id, problems)
alter table public.submissions
  add column onboarding_status text check (onboarding_status in ('accepted', 'refused', 'failed', 'skipped')),
  add column onboarding_sent_at timestamptz,
  add column onboarding_response jsonb;

create index submissions_onboarding_pending_idx on public.submissions (received) where onboarding_status is null;

-- The onboarding bookkeeping may change on otherwise immutable submissions.
create or replace function public.protect_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  mutable_columns constant text[] := array[
    'completed', 'completed_by', 'completed_at', 'sheet_synced_at',
    'onboarding_status', 'onboarding_sent_at', 'onboarding_response'
  ];
begin
  if tg_op = 'DELETE' then
    raise exception 'Submitted sales cannot be deleted';
  end if;
  if (to_jsonb(new) - mutable_columns) is distinct from (to_jsonb(old) - mutable_columns) then
    raise exception 'Submitted sales cannot be changed';
  end if;
  return new;
end;
$$;

-- Existing sales must not be sent: they would be onboarded a second time.
update public.submissions set onboarding_status = 'skipped';

-- Hourly, send submissions that did not reach the endpoint yet (see the sync-onboarding edge function).
-- Uses the same Vault secret as sync-sheet.
select cron.schedule(
  'sync-onboarding',
  '30 * * * *',
  $$
  select net.http_post(
    url := 'https://nrdpixagvynzexwzqtlf.supabase.co/functions/v1/sync-onboarding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_sheet_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
