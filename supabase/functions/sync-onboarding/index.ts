import { requireEnv } from "../_shared/env.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { isOnboardingConfigured, sendToOnboarding } from "../_shared/onboarding.ts"
import type { SubmissionRecord } from "../_shared/submission-record.ts"
import { createAdminClient } from "../_shared/supabase.ts"

const BATCH_SIZE = 50

/** Leaves fresh submissions to submit-form, which is still sending them, so a sale is not sent twice. */
const GRACE_MINUTES = 5

/**
 * Sends stored submissions that did not get an answer from the onboarding endpoint (onboarding_status is null),
 * oldest first. Called on a schedule (pg_cron) with the CRON_SECRET header; app users cannot call it.
 * Stops at the first failure: the endpoint is down or rejecting the key, and the rest would fail the same way.
 */
serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== requireEnv("CRON_SECRET")) throw new HttpError(401, "Unauthorized")
  if (!isOnboardingConfigured()) return json({ sent: 0, reason: "onboarding not configured" })

  const admin = createAdminClient()
  const { data: records, error } = await admin
    .from("submissions")
    .select("*")
    .is("onboarding_status", null)
    .lt("received", new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString())
    .order("received")
    .limit(BATCH_SIZE)
  if (error) throw error

  let sent = 0
  for (const record of records as SubmissionRecord[]) {
    await sendToOnboarding(admin, record)
    sent++
  }
  return json({ sent })
})
