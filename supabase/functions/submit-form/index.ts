import type { SupabaseClient } from "@supabase/supabase-js"
import { requireUser } from "../_shared/auth.ts"
import { formSchema } from "../_shared/form-schema.ts"
import { appendSheetRow, isSheetsConfigured } from "../_shared/google-sheets.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { isOnboardingConfigured, sendToOnboarding } from "../_shared/onboarding.ts"
import { toSheetRow, toSubmissionRecord } from "../_shared/submission-record.ts"
import { createAdminClient } from "../_shared/supabase.ts"

serve(async (req) => {
  const { user } = await requireUser(req)

  const parsed = formSchema.safeParse(await req.json())
  if (!parsed.success) {
    return json({ error: "Formulier bevat fouten", issues: parsed.error.issues }, 400)
  }
  const admin = createAdminClient()

  // Recruiter details come from the caller's own profile, never from the request body.
  const { data: recruiter, error: profileError } = await admin
    .from("profiles")
    .select("wervernaam, wervernr")
    .eq("id", user.id)
    .single()
  if (profileError || !recruiter) throw new HttpError(403, "Geen wervers-profiel gevonden")

  const record = toSubmissionRecord(parsed.data, user.id, recruiter, new Date())

  // row_id is generated on the device, so retries from the offline outbox are idempotent.
  const { data: inserted, error: insertError } = await admin
    .from("submissions")
    .upsert(record, { onConflict: "row_id", ignoreDuplicates: true })
    .select("row_id")
  if (insertError) throw insertError

  const isNew = inserted.length > 0
  if (!isNew) await assertOwnedBy(admin, record.row_id, user.id)

  // The submission is safely stored; whatever fails here is retried by sync-sheet and sync-onboarding.
  if (isNew) {
    await Promise.all([
      isSheetsConfigured() &&
        appendSheetRow(toSheetRow(record))
          .then(() =>
            admin.from("submissions").update({ sheet_synced_at: new Date().toISOString() }).eq("row_id", record.row_id),
          )
          .catch(console.error),
      isOnboardingConfigured() && sendToOnboarding(admin, record).catch(console.error),
    ])
  }

  return json({ ok: true, rowId: record.row_id, duplicate: !isNew })
})

/** A duplicate row_id is only a harmless retry if it is the caller's own earlier submission. */
async function assertOwnedBy(admin: SupabaseClient, rowId: string, userId: string) {
  const { data } = await admin.from("submissions").select("user_id").eq("row_id", rowId).single()
  if (data?.user_id !== userId) throw new HttpError(409, "Dit formulier-ID is al in gebruik")
}
