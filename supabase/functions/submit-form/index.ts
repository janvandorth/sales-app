import type { SupabaseClient } from "@supabase/supabase-js"
import { requireUser } from "../_shared/auth.ts"
import { parseSubmittedForm } from "../_shared/form-schema.ts"
import { appendSheetRow, isSheetsConfigured } from "../_shared/google-sheets.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { isOnboardingConfigured, sendToOnboarding } from "../_shared/onboarding.ts"
import { isOwnScanPath } from "../_shared/storage.ts"
import { chooseRecruiter, toSheetRow, toSubmissionRecord } from "../_shared/submission-record.ts"
import { createAdminClient } from "../_shared/supabase.ts"
import { isTestRequest } from "../_shared/test-request.ts"

/** Supabase's edge runtime keeps the function alive for a promise passed here after the response has gone. */
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

serve(async (req) => {
  const { user } = await requireUser(req)

  const parsed = parseSubmittedForm(await req.json())
  if (!parsed.success) {
    return json({ error: "Formulier bevat fouten", issues: parsed.error.issues }, 400)
  }
  // Onboarding sends the scan to ZMAdmin with the service role, so it must be the caller's own photo.
  if (parsed.data.scanPath && !isOwnScanPath(parsed.data.scanPath, user.id)) {
    throw new HttpError(400, "Ongeldig bestandspad van de foto")
  }
  const admin = createAdminClient()

  // Recruiter details come from the caller's own profile; only an admin may book the sale on a werver they picked.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("wervernaam, wervernr, is_admin")
    .eq("id", user.id)
    .single()
  if (profileError || !profile) throw new HttpError(403, "Geen wervers-profiel gevonden")
  if (parsed.data.werver && !profile.is_admin) console.warn(`Ignored a picked werver from non-admin ${user.id}`)
  const recruiter = chooseRecruiter(profile, parsed.data.werver)

  const record = toSubmissionRecord(parsed.data, user.id, recruiter, new Date(), isTestRequest(req))

  // row_id is generated on the device, so retries from the offline outbox are idempotent.
  const { data: inserted, error: insertError } = await admin
    .from("submissions")
    .upsert(record, { onConflict: "row_id", ignoreDuplicates: true })
    .select("row_id")
  if (insertError) throw insertError

  const isNew = inserted.length > 0
  if (!isNew) await assertOwnedBy(admin, record.row_id, user.id)

  // The submission is safely stored; whatever fails here is retried by sync-sheet and sync-onboarding. It runs
  // after the response: with a photo, onboarding may take up to a minute, and the recruiter need not wait for it.
  if (isNew) {
    EdgeRuntime.waitUntil(
      Promise.all([
        isSheetsConfigured() &&
          !record.test &&
          appendSheetRow(toSheetRow(record))
            .then(() =>
              admin
                .from("submissions")
                .update({ sheet_synced_at: new Date().toISOString() })
                .eq("row_id", record.row_id),
            )
            .catch(console.error),
        isOnboardingConfigured() && sendToOnboarding(admin, record).catch(console.error),
      ]),
    )
  }

  return json({ ok: true, rowId: record.row_id, duplicate: !isNew })
})

/** A duplicate row_id is only a harmless retry if it is the caller's own earlier submission. */
async function assertOwnedBy(admin: SupabaseClient, rowId: string, userId: string) {
  const { data } = await admin.from("submissions").select("user_id").eq("row_id", rowId).single()
  if (data?.user_id !== userId) throw new HttpError(409, "Dit formulier-ID is al in gebruik")
}
