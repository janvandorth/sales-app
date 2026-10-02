import { formatDutchDate, formatDutchDateTime } from "./format.ts"
import { PER_POST_EMAIL, type FormValues, type SheetRow } from "./form-schema.ts"

/** A row of the `submissions` table (columns written by submit-form). */
export type SubmissionRecord = {
  row_id: string
  user_id: string
  started: string
  received: string
  datum: string
  wervernaam: string
  wervernr: string
  klantnummer: string
  geslacht: string
  naam: string
  postcode: string
  huisnummer: string
  toevoeging: string
  straat: string
  plaats: string
  telefoon: string
  email: string
  iban: string
  contract_type: string
  betaalperiode: string
  opmerkingen: string
}

export type Recruiter = { wervernaam: string; wervernr: string }

/**
 * Turns validated form values into the stored record. The user id and recruiter details come from the
 * verified caller, never from the submitted form.
 */
export function toSubmissionRecord(
  values: FormValues,
  userId: string,
  recruiter: Recruiter,
  received: Date,
): SubmissionRecord {
  return {
    row_id: values.rowId,
    user_id: userId,
    started: values.started,
    received: received.toISOString(),
    datum: values.datum,
    wervernaam: recruiter.wervernaam,
    wervernr: recruiter.wervernr,
    klantnummer: values.klantnummer,
    geslacht: values.geslacht,
    naam: values.naam,
    postcode: values.postcode,
    huisnummer: values.huisnummer,
    toevoeging: values.toevoeging,
    straat: values.straat,
    plaats: values.plaats,
    telefoon: `${values.landcode}${values.telefoon}`,
    email: values.perPost ? PER_POST_EMAIL : values.email,
    iban: values.iban,
    contract_type: values.contractType,
    betaalperiode: values.betaalperiode,
    opmerkingen: values.opmerkingen,
  }
}

// The back-office sheet is shared with the previous app and uses its short codes; Supabase keeps full labels.
const GESLACHT_CODES: Record<string, string> = { Man: "M", Vrouw: "V" }
const CONTRACT_TYPE_CODES: Record<string, string> = { Service: "S", Zakelijk: "Z" }
const BETAALPERIODE_CODES: Record<string, string> = {
  "Maand Machtiging": "MM",
  "Jaar Machtiging": "JM",
  "Kwartaal Machtiging": "KM",
  "Jaar Acceptgiro": "JA",
  "Zakelijk Acceptgiro": "ZA",
}

/** Location is not recorded by this app; the previous app wrote GPS coordinates or "Unknown". */
const UNKNOWN_LOCATION = "Unknown"

/** "+31612345678" -> "612345678" (Dutch numbers without country code); others keep the code without "+". */
export function toSheetPhone(phone: string): string {
  return phone.startsWith("+31") ? phone.slice(3) : phone.replace(/^\+/, "")
}

/**
 * The Google Sheet row for a stored submission, in the format of the existing rows of the previous app:
 * short codes, Dutch dates without seconds, Completed = submit time, CompletedBy = the recruiter.
 */
export function toSheetRow(record: SubmissionRecord): SheetRow {
  const received = formatDutchDateTime(new Date(record.received))
  return {
    RowId: record.row_id,
    Completed: received,
    CompletedBy: record.wervernaam,
    Started: formatDutchDateTime(new Date(record.started)),
    Received: received,
    CompletedAt: UNKNOWN_LOCATION,
    Datum: formatDutchDate(record.datum),
    Wervernaam: record.wervernaam,
    Wervernr: record.wervernr,
    Klantnummer: record.klantnummer,
    Geslacht: GESLACHT_CODES[record.geslacht] ?? record.geslacht,
    Naam: record.naam,
    Postcode: record.postcode,
    Huisnummer: record.huisnummer,
    Toevoeging: record.toevoeging,
    Straat: record.straat,
    Plaats: record.plaats,
    Telefoon: toSheetPhone(record.telefoon),
    Email: record.email,
    IBAN: record.iban,
    ContractType: CONTRACT_TYPE_CODES[record.contract_type] ?? record.contract_type,
    Betaalperiode: BETAALPERIODE_CODES[record.betaalperiode] ?? record.betaalperiode,
    Opmerkingen: record.opmerkingen,
  }
}
