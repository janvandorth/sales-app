import { describe, expect, it } from "vitest"
import type { Extraction } from "./form-schema"
import { toScanResult } from "./scan-result"

// What Claude might answer for a fully filled-in paper form.
const claudeAnswer: Extraction = {
  datum: "2026-10-14",
  klantnummer: "100234",
  geslacht: "Vrouw",
  naam: "M.A. de Vries",
  postcode: "1012JS",
  huisnummer: "1",
  toevoeging: "A",
  straat: "Dam",
  plaats: "Amsterdam",
  landcode: "+31",
  telefoon: "0612345678",
  landcode2: "+31",
  telefoon2: "201234567",
  email: "m.devries@voorbeeld.nl",
  iban: "nl91 abna 0417 1643 00",
  ibanTnv: "J. de Vries",
  contractType: "Service",
  betaalperiode: "Maand Machtiging",
}

describe("toScanResult", () => {
  it("leaves out name, phone numbers, straat and plaats by default", () => {
    expect(toScanResult(claudeAnswer, false)).toEqual({
      datum: "2026-10-14",
      klantnummer: "100234",
      geslacht: "Vrouw",
      postcode: "1012JS",
      huisnummer: "1",
      toevoeging: "A",
      landcode: "+31",
      email: "m.devries@voorbeeld.nl",
      iban: "NL91ABNA0417164300",
      ibanTnv: "J. de Vries",
      contractType: "Service",
      betaalperiode: "Maand Machtiging",
    })
  })

  it("returns name and phone numbers for a recruiter with scan_contact_fields on, never straat and plaats", () => {
    const fields = toScanResult(claudeAnswer, true)
    expect(fields).toMatchObject({
      naam: "M.A. de Vries",
      telefoon: "612345678",
      landcode2: "+31",
      telefoon2: "201234567",
    })
    expect(fields).not.toHaveProperty("straat")
    expect(fields).not.toHaveProperty("plaats")
  })

  it("drops fields Claude left empty or read as invalid", () => {
    const fields = toScanResult({ ...claudeAnswer, klantnummer: "", datum: "2026-06-31", landcode2: "31" }, true)
    expect(fields).not.toHaveProperty("klantnummer")
    expect(fields).not.toHaveProperty("datum")
    expect(fields).not.toHaveProperty("landcode2")
  })
})
