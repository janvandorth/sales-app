import { createClient } from "@supabase/supabase-js"
import { requireUser } from "../_shared/auth.ts"
import { formSchema, PER_POST_EMAIL, type FormValues, type SheetRow } from "../_shared/form-schema.ts"
import { appendSheetRow, isSheetsConfigured } from "../_shared/google-sheets.ts"
import { HttpError, json, serve } from "../_shared/http.ts"

serve(async (req) => {
  const { user } = await requireUser(req)

  const parsed = formSchema.safeParse(await req.json())
  if (!parsed.success) {
    return json({ error: "Formulier bevat fouten", issues: parsed.error.issues }, 400)
  }
  const values = parsed.data

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  })

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("wervernaam, wervernr")
    .eq("id", user.id)
    .single()
  if (profileError || !profile) throw new HttpError(403, "Geen wervers-profiel gevonden")

  const received = new Date()
  const row = toSheetRow(values, profile, received)

  // row_id is generated on the device, so retries from the offline outbox are idempotent.
  const { data: inserted, error: insertError } = await admin
    .from("submissions")
    .upsert(
      {
        row_id: values.rowId,
        user_id: user.id,
        started: values.started,
        received: received.toISOString(),
        datum: values.datum,
        wervernaam: profile.wervernaam,
        wervernr: profile.wervernr,
        klantnummer: values.klantnummer,
        geslacht: values.geslacht,
        naam: values.naam,
        postcode: values.postcode,
        huisnummer: values.huisnummer,
        toevoeging: values.toevoeging,
        straat: values.straat,
        plaats: values.plaats,
        telefoon: row.Telefoon,
        email: row.Email,
        iban: values.iban,
        contract_type: values.contractType,
        betaalperiode: values.betaalperiode,
        opmerkingen: values.opmerkingen,
      },
      { onConflict: "row_id", ignoreDuplicates: true },
    )
    .select("row_id")
  if (insertError) throw insertError

  const isNew = inserted.length > 0
  if (isNew && isSheetsConfigured()) {
    try {
      await appendSheetRow(row)
      await admin.from("submissions").update({ sheet_synced_at: new Date().toISOString() }).eq("row_id", values.rowId)
    } catch (error) {
      // The submission is safely stored; the sheet can be backfilled from rows where sheet_synced_at is null.
      console.error(error)
    }
  }

  return json({ ok: true, rowId: values.rowId, duplicate: !isNew })
})

function toSheetRow(
  values: FormValues,
  profile: { wervernaam: string; wervernr: string },
  received: Date,
): SheetRow {
  return {
    RowId: values.rowId,
    Completed: "",
    CompletedBy: "",
    Started: formatDateTime(new Date(values.started)),
    Received: formatDateTime(received),
    CompletedAt: "",
    Datum: values.datum.split("-").reverse().join("-"),
    Wervernaam: profile.wervernaam,
    Wervernr: profile.wervernr,
    Klantnummer: values.klantnummer,
    Geslacht: values.geslacht,
    Naam: values.naam,
    Postcode: values.postcode,
    Huisnummer: values.huisnummer,
    Toevoeging: values.toevoeging,
    Straat: values.straat,
    Plaats: values.plaats,
    Telefoon: `${values.landcode}${values.telefoon}`,
    Email: values.perPost ? PER_POST_EMAIL : values.email,
    IBAN: values.iban,
    ContractType: values.contractType,
    Betaalperiode: values.betaalperiode,
    Opmerkingen: values.opmerkingen,
  }
}

/** "29-09-2026 14:05:31" in Dutch local time. */
function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .format(date)
    .replace(",", "")
    .replace(/\s+/, " ")
}
