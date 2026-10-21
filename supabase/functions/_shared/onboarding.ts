import { encodeBase64 } from "./base64.ts"
import { onboardingUrl } from "./contracts-api.ts"
import { optionalEnv, requireEnv } from "./env.ts"
import { type OnboardingPhoto, toOnboardingRequest } from "./onboarding-request.ts"
import { SCANS_BUCKET } from "./storage.ts"
import type { SubmissionRecord } from "./submission-record.ts"
import type { SupabaseClient } from "@supabase/supabase-js"

// Sends sales to the Zeker en Mobiel onboarding endpoint (Contracts API, POST .../Onboarding/2026.1/Appeee/Paper),
// which queues them to be written as customers in ZMAdmin.

/** True when the onboarding endpoint has a key; the URL comes from contracts-api.ts. */
export function isOnboardingConfigured(): boolean {
  return Boolean(optionalEnv("ONBOARDING_API_KEY"))
}

/**
 * The final answer for a submission. Anything else (network error, timeout, 401, a 5xx from IIS) throws and the
 * submission is retried by sync-onboarding.
 * - accepted (202): queued. Checks that need ZMAdmin's database (recruiter, bank, duplicates) happen later, and a
 *   refusal there goes to the office's IntakeFailures screen, not back to us.
 * - refused (422): the data needs correcting; sending it again gives the same answer.
 * - failed (500 with the endpoint's problem body): already recorded in IntakeFailures for the office, which
 *   re-enters it; resending would create a duplicate.
 * - unconfirmed: no answer within the timeout. With a photo the endpoint first uploads it to the document share, so
 *   the sale may well have arrived; it is not resent automatically (a resend is refused as a duplicate and leaves
 *   the office an item to clear). Someone checks ZMAdmin and resends it by setting the status back to null.
 */
export type OnboardingStatus = "accepted" | "refused" | "failed" | "unconfirmed"

type OnboardingResponse = {
  correlationId?: string
  regNr?: string
  photosReceived?: number
  message?: string
  problems?: unknown[]
}

/** The endpoint uploads the photos to the document share before it answers; that alone may take 30 seconds. */
const TIMEOUT_MS = 60_000

/** Sends one submission and stores the outcome on it. Throws when the outcome is unknown (retry later). */
export async function sendToOnboarding(admin: SupabaseClient, record: SubmissionRecord): Promise<OnboardingStatus> {
  const photos = await loadPhotos(admin, record)
  let response: Response
  try {
    response = await fetch(onboardingUrl(record.test), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": onboardingKey(record.test),
      },
      body: JSON.stringify(toOnboardingRequest(record, photos)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "TimeoutError")) throw error
    console.error(`Onboarding did not answer within ${TIMEOUT_MS / 1000} s for ${record.row_id}; check ZMAdmin`)
    await storeOutcome(admin, record, "unconfirmed", null)
    return "unconfirmed"
  }
  const text = await response.text()
  const body = parseJson(text)

  const status = classify(response.status, body)
  if (!status)
    throw new Error(`Onboarding failed for ${record.row_id} (HTTP ${response.status}): ${text.slice(0, 500)}`)

  if (status === "accepted") {
    console.log(
      `Onboarding accepted ${record.row_id} as klantnummer ${body?.regNr} with ${body?.photosReceived ?? 0} of ` +
        `${photos.length} photos [${body?.correlationId}]`,
    )
  } else {
    console.error(`Onboarding ${status} for ${record.row_id}: ${text.slice(0, 1000)}`)
  }

  await storeOutcome(admin, record, status, body)
  // ZMAdmin has the photo now (or never will, when it left it out); it holds personal data, so it goes.
  if (status === "accepted" && record.scan_path) {
    const { error } = await admin.storage.from(SCANS_BUCKET).remove([record.scan_path])
    if (error) console.error(`Could not delete scan ${record.scan_path}`, error)
  }
  return status
}

async function storeOutcome(
  admin: SupabaseClient,
  record: SubmissionRecord,
  status: OnboardingStatus,
  body: OnboardingResponse | null,
) {
  const { error } = await admin
    .from("submissions")
    .update({ onboarding_status: status, onboarding_sent_at: new Date().toISOString(), onboarding_response: body })
    .eq("row_id", record.row_id)
  if (error) throw error
}

/**
 * The scan of the sale, if it has one. A scan that is gone (cleaned up after 30 days) is left out and the sale
 * goes without it; any other storage error throws, so the sale is retried with its photo later.
 */
async function loadPhotos(admin: SupabaseClient, record: SubmissionRecord): Promise<OnboardingPhoto[]> {
  if (!record.scan_path) return []
  const { data: file, error } = await admin.storage.from(SCANS_BUCKET).download(record.scan_path)
  if (error) {
    if (isNotFound(error)) {
      console.error(`Scan ${record.scan_path} of ${record.row_id} is gone; sending the sale without it`)
      return []
    }
    throw error
  }
  const contentType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg"
  return [{ ContentType: contentType, Data: encodeBase64(new Uint8Array(await file.arrayBuffer())) }]
}

function isNotFound(error: unknown): boolean {
  const { status, statusCode } = error as { status?: number; statusCode?: string }
  return status === 404 || statusCode === "404" || (error instanceof Error && /not found/i.test(error.message))
}

/** A test sale may need TEST's key when ONBOARDING_API_KEY holds the production key. */
export function onboardingKey(test: boolean): string {
  return (test && optionalEnv("ONBOARDING_TEST_API_KEY")) || requireEnv("ONBOARDING_API_KEY")
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
