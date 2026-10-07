import { describe, expect, it } from "vitest"
import { toOnboardingPhone, toOnboardingRequest } from "./onboarding-request"
import type { SubmissionRecord } from "./submission-record"

const record: SubmissionRecord = {
  row_id: "0b5a1a6e-8a2f-4f3c-9d7e-2d1f4c3b2a10",
  user_id: "user-a",
  started: "2026-09-30T08:00:00.000Z",
  received: "2026-09-30T08:10:00.000Z",
  datum: "2026-09-30",
  wervernaam: "Anna",
  wervernr: "W0001",
  klantnummer: "100234",
  geslacht: "Vrouw",
  naam: "P.J. Jansen",
  postcode: "1012JS",
  huisnummer: "1",
  toevoeging: "A",
  straat: "Dam",
  plaats: "Amsterdam",
  telefoon: "+31612345678",
  email: "pj@voorbeeld.nl",
  iban: "NL91ABNA0417164300",
  contract_type: "Service",
  betaalperiode: "Kwartaal Machtiging",
  opmerkingen: "Graag bellen",
}

describe("toOnboardingRequest", () => {
  it("wraps the answers in Appeee's envelope, keyed by the submission id", () => {
    const request = toOnboardingRequest(record)
    expect(request.Entry).toMatchObject({ Id: record.row_id, DSRowId: record.row_id, CompleteTime: record.received })
    expect(request.Entry.AnswersJson.page1).toEqual({
      Klantnummer: "100234",
      Naam: "P.J. Jansen",
      Geslacht: "V",
      Postcode: "1012JS",
      Huisnummer: "1",
      Toevoeging: "A",
      Straat: "Dam",
      Plaats: "Amsterdam",
      Telefoon: "0612345678",
      Email: "pj@voorbeeld.nl",
      Wervernr: "W0001",
      Wervernaam: "Anna",
      ContractType: "S",
      Betaalperiode: "BM", // ZMAdmin's quarterly code; the sheet says "KM"
      IBAN: "NL91ABNA0417164300",
      Opmerkingen: "Graag bellen",
      Datum: "2026-09-30",
    })
  })

  it("sends no email for a customer who gets their mail by post", () => {
    expect(toOnboardingRequest({ ...record, email: "Per post" }).Entry.AnswersJson.page1.Email).toBe("")
  })
})

describe("toOnboardingPhone", () => {
  it("writes Dutch numbers nationally and keeps foreign ones international", () => {
    expect(toOnboardingPhone("+31201234567")).toBe("0201234567")
    expect(toOnboardingPhone("+32470123456")).toBe("+32470123456")
  })
})
