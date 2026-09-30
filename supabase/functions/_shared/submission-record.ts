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

/** The Google Sheet row for a stored submission. Back-office columns (Completed…) start empty. */
export function toSheetRow(record: SubmissionRecord): SheetRow {
  return {
    RowId: record.row_id,
    Completed: "",
    CompletedBy: "",
    Started: formatDutchDateTime(new Date(record.started)),
    Received: formatDutchDateTime(new Date(record.received)),
    CompletedAt: "",
    Datum: formatDutchDate(record.datum),
    Wervernaam: record.wervernaam,
    Wervernr: record.wervernr,
    Klantnummer: record.klantnummer,
    Geslacht: record.geslacht,
    Naam: record.naam,
    Postcode: record.postcode,
    Huisnummer: record.huisnummer,
    Toevoeging: record.toevoeging,
    Straat: record.straat,
    Plaats: record.plaats,
    Telefoon: record.telefoon,
    Email: record.email,
    IBAN: record.iban,
    ContractType: record.contract_type,
    Betaalperiode: record.betaalperiode,
    Opmerkingen: record.opmerkingen,
  }
}
