-- Run the sheet retry hourly instead of every 5 minutes (cron.schedule with an existing name updates the job).
select cron.schedule('sync-sheet', '0 * * * *', (select command from cron.job where jobname = 'sync-sheet'));
