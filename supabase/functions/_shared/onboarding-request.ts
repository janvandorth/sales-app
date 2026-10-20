import { PER_POST_EMAIL } from "./form-schema.ts"
import type { SubmissionRecord } from "./submission-record.ts"

// The body of POST /Onboarding/2026.1/Appeee/Paper on the Zeker en Mobiel Contracts API: Appeee's REST connector
// envelope with the answers under Entry.AnswersJson.<page>. Defined in ZMSuite by AppeeePaperContractRequest and
// AppeeePaperContractForm (src/Common/ZMAdmin.Common.Domain/Onboarding/Appeee).

export type OnboardingForm = {
  Klantnummer: string
  Naam: string
  Geslacht: string
  Postcode: string
  Huisnummer: string
  Toevoeging: string
  Straat: string
  Plaats: string
  Telefoon: string
  Telefoon2: string
  Email: string
  Wervernr: string
  Wervernaam: string
  ContractType: string
  Betaalperiode: string
  IBAN: string
  IBANtnv: string
  Opmerkingen: string
  Datum: string
}

/** A photo of the signed paper contract; the endpoint files it with the customer in ZMAdmin. */
export type OnboardingPhoto = {
  /** image/jpeg, image/png or image/webp, at most 10 MB before encoding. */
  ContentType: string
  /** The image, base64-encoded. */
  Data: string
}

export type OnboardingRequest = {
  ProviderId: number
  IntegrationKey: string
  Entry: {
    Id: string
    DSRowId: string
    UserExternalId: string
    UserFirstName: string
    StartTime: string
    ReceivedTime: string
    CompleteTime: string
    AnswersJson: { page1: OnboardingForm }
  }
  /** In page order; at most 5. Empty when the sale was typed in without a scan. */
  Photos: OnboardingPhoto[]
}

const GESLACHT_CODES: Record<string, string> = { Man: "M", Vrouw: "V" }
const CONTRACT_TYPE_CODES: Record<string, string> = { Service: "S", Zakelijk: "Z" }
/**
 * First letter = JenK (period), second = AenM (machtiging or acceptgiro), as ZMAdmin's ContractType. These differ
 * from the sheet's codes: Zeker en Mobiel's quarterly product is "B - M * NIEUW Jaar/Kwartaal" (JenK "B"); "KM"
 * matches no contract type. See ContractTypeSelectorTests in ZMSuite for the periods the endpoint resolves.
 */
const BETAALPERIODE_CODES: Record<string, string> = {
  "Maand Machtiging": "MM",
  "Jaar Machtiging": "JM",
  "Kwartaal Machtiging": "BM",
  "Jaar Acceptgiro": "JA",
  "Zakelijk Acceptgiro": "ZA",
}

/**
 * Dutch numbers in national form ("0612345678"), which is what ZMAdmin stores; other countries keep their
 * international form, since a national number without its country would be ambiguous.
 */
export function toOnboardingPhone(telefoon: string): string {
  return telefoon.startsWith("+31") ? `0${telefoon.slice(3)}` : telefoon
}

/**
 * The onboarding request for a stored submission. The submission id is Appeee's entry id, so a resend of the
 * same sale carries the same id. `photos` are the scans of the paper contract, read from storage by the caller.
 */
export function toOnboardingRequest(record: SubmissionRecord, photos: OnboardingPhoto[] = []): OnboardingRequest {
  return {
    ProviderId: 0,
    IntegrationKey: "",
    Entry: {
      Id: record.row_id,
      DSRowId: record.row_id,
      UserExternalId: record.user_id,
      UserFirstName: record.wervernaam,
      StartTime: record.started,
      ReceivedTime: record.received,
      CompleteTime: record.received,
      AnswersJson: {
        page1: {
          Klantnummer: record.klantnummer,
          Naam: record.naam,
          Geslacht: GESLACHT_CODES[record.geslacht] ?? "",
          Postcode: record.postcode,
          Huisnummer: record.huisnummer,
          Toevoeging: record.toevoeging,
          Straat: record.straat,
          Plaats: record.plaats,
          Telefoon: toOnboardingPhone(record.telefoon),
          Telefoon2: toOnboardingPhone(record.telefoon2),
          // "Per post" is how the sheet marks a customer without email; the endpoint rejects it as an address.
          Email: record.email === PER_POST_EMAIL ? "" : record.email,
          Wervernr: record.wervernr,
          Wervernaam: record.wervernaam,
          ContractType: CONTRACT_TYPE_CODES[record.contract_type] ?? "",
          Betaalperiode: BETAALPERIODE_CODES[record.betaalperiode] ?? "",
          IBAN: record.iban,
          // Empty: ZMAdmin uses the customer's surname as the account holder.
          IBANtnv: record.iban_tnv,
          Opmerkingen: record.opmerkingen,
          Datum: record.datum,
        },
      },
    },
    Photos: photos,
  }
}
