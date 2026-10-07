import { optionalEnv, requireEnv } from "./env.ts"
import { toOnboardingRequest } from "./onboarding-request.ts"
import type { SubmissionRecord } from "./submission-record.ts"
import type { SupabaseClient } from "@supabase/supabase-js"

// Sends sales to the Zeker en Mobiel onboarding endpoint (Contracts API, POST .../Onboarding/2026.1/Appeee/Paper),
// which queues them to be written as customers in ZMAdmin.

/** True when the onboarding endpoint is configured. */
export function isOnboardingConfigured(): boolean {
  return Boolean(optionalEnv("ONBOARDING_API_URL") && optionalEnv("ONBOARDING_API_KEY"))
}

/**
 * The final answer for a submission. Anything else (network error, timeout, 401, a 5xx from IIS) throws and the
 * submission is retried by sync-onboarding.
 * - accepted (202): queued. Checks that need ZMAdmin's database (recruiter, bank, duplicates) happen later, and a
 *   refusal there goes to the office's IntakeFailures screen, not back to us.
 * - refused (422): the data needs correcting; sending it again gives the same answer.
 * - failed (500 with the endpoint's problem body): already recorded in IntakeFailures for the office, which
 *   re-enters it; resending would create a duplicate.
 */
export type OnboardingStatus = "accepted" | "refused" | "failed"

type OnboardingResponse = { correlationId?: string; regNr?: string; message?: string; problems?: unknown[] }

/** Sends one submission and stores the outcome on it. Throws when the outcome is unknown (retry later). */
export async function sendToOnboarding(admin: SupabaseClient, record: SubmissionRecord): Promise<OnboardingStatus> {
  const response = await fetch(requireEnv("ONBOARDING_API_URL"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Key": requireEnv("ONBOARDING_API_KEY"),
    },
    body: JSON.stringify(toOnboardingRequest(record)),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  const body = parseJson(text)

  const status = classify(response.status, body)
  if (!status)
    throw new Error(`Onboarding failed for ${record.row_id} (HTTP ${response.status}): ${text.slice(0, 500)}`)

  if (status === "accepted") {
    console.log(`Onboarding accepted ${record.row_id} as klantnummer ${body?.regNr} [${body?.correlationId}]`)
  } else {
    console.error(`Onboarding ${status} for ${record.row_id}: ${text.slice(0, 1000)}`)
  }

  const { error } = await admin
    .from("submissions")
    .update({ onboarding_status: status, onboarding_sent_at: new Date().toISOString(), onboarding_response: body })
    .eq("row_id", record.row_id)
  if (error) throw error
  return status
}

function classify(httpStatus: number, body: OnboardingResponse | null): OnboardingStatus | null {
  if (httpStatus === 202) return "accepted"
  if (httpStatus === 422 && body) return "refused"
  // Only the controller's own 500 carries a correlation id; it means the sale was recorded for the office.
  if (httpStatus === 500 && body?.correlationId) return "failed"
  return null
}

function parseJson(text: string): OnboardingResponse | null {
  try {
    const value = JSON.parse(text)
    return value && typeof value === "object" ? value : null
  } catch {
    return null
  }
}
