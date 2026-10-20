import { requireEnv } from "../_shared/env.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isOnboardingConfigured, sendToOnboarding } from "../_shared/onboarding.ts"
import { SCAN_RETENTION_DAYS, SCANS_BUCKET } from "../_shared/storage.ts"
import type { SubmissionRecord } from "../_shared/submission-record.ts"
import { createAdminClient } from "../_shared/supabase.ts"

const BATCH_SIZE = 50

/** No new send starts after this, so the last one (at most a minute) still ends within the function's time limit. */
const SEND_BUDGET_MS = 60_000

/** Leaves fresh submissions to submit-form, which is still sending them, so a sale is not sent twice. */
const GRACE_MINUTES = 5

/**
 * Sends stored submissions that did not get an answer from the onboarding endpoint (onboarding_status is null),
 * oldest first. Called on a schedule (pg_cron) with the CRON_SECRET header; app users cannot call it.
 * Stops at the first failure: the endpoint is down or rejecting the key, and the rest would fail the same way.
 * Also deletes scans older than SCAN_RETENTION_DAYS: those of discarded or refused forms, which nothing else removes.
 */
serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== requireEnv("CRON_SECRET")) throw new HttpError(401, "Unauthorized")
  const admin = createAdminClient()
  const scansDeleted = await deleteExpiredScans(admin)
  if (!isOnboardingConfigured()) return json({ sent: 0, scansDeleted, reason: "onboarding not configured" })
  const { data: records, error } = await admin
    .from("submissions")
    .select("*")
    .is("onboarding_status", null)
    .lt("received", new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString())
    .order("received")
    .limit(BATCH_SIZE)
  if (error) throw error

  const start = Date.now()
  let sent = 0
  for (const record of records as SubmissionRecord[]) {
    if (Date.now() - start > SEND_BUDGET_MS) break
    await sendToOnboarding(admin, record)
    sent++
  }
  return json({ sent, scansDeleted })
})

/** Never fails the run: a scan left over until the next hour does no harm. */
async function deleteExpiredScans(admin: SupabaseClient): Promise<number> {
  const { data: paths, error } = await admin.rpc("expired_scans", { retention_days: SCAN_RETENTION_DAYS })
  if (error) {
    console.error("Could not list expired scans", error)
    return 0
  }
  if (paths.length === 0) return 0
  const { error: removeError } = await admin.storage.from(SCANS_BUCKET).remove(paths)
  if (removeError) {
    console.error("Could not delete expired scans", removeError)
    return 0
  }
  return paths.length
}
