import { requireEnv } from "../_shared/env.ts"
import { appendSheetRow, isSheetsConfigured } from "../_shared/google-sheets.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { toSheetRow, type SubmissionRecord } from "../_shared/submission-record.ts"
import { createAdminClient } from "../_shared/supabase.ts"

const BATCH_SIZE = 50

/**
 * Appends stored submissions that are not in the Google Sheet yet (sheet_synced_at is null), oldest first.
 * Called on a schedule (pg_cron) with the CRON_SECRET header; app users cannot call it.
 */
serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== requireEnv("CRON_SECRET")) throw new HttpError(401, "Unauthorized")
  if (!isSheetsConfigured()) return json({ synced: 0, reason: "sheet not configured" })

  const admin = createAdminClient()
  const { data: records, error } = await admin
    .from("submissions")
    .select("*")
    .is("sheet_synced_at", null)
    .order("received")
    .limit(BATCH_SIZE)
  if (error) throw error

  let synced = 0
  for (const record of records as SubmissionRecord[]) {
    await appendSheetRow(toSheetRow(record))
    await admin.from("submissions").update({ sheet_synced_at: new Date().toISOString() }).eq("row_id", record.row_id)
    synced++
  }
  return json({ synced })
})
