-- Every 5 minutes, append submissions that are not in the Google Sheet yet (see the sync-sheet edge function).
-- The shared secret lives in Vault as 'sync_sheet_cron_secret' (created once, outside migrations):
--   select vault.create_secret('<CRON_SECRET>', 'sync_sheet_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-sheet',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://nrdpixagvynzexwzqtlf.supabase.co/functions/v1/sync-sheet',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_sheet_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
