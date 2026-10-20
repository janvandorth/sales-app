import { describe, expect, it } from "vitest"
import { formSchema, SHEET_COLUMNS, type FormInput } from "./form-schema"
import { toSheetRow, toSubmissionRecord } from "./submission-record"

const values = formSchema.parse({
  rowId: "0b5a1a6e-8a2f-4f3c-9d7e-2d1f4c3b2a10",
  started: "2026-09-30T08:00:00.000Z",
  datum: "2026-09-30",
  klantnummer: "100234",
  geslacht: "Man",
  naam: "P.J. Jansen",
  postcode: "1012JS",
  huisnummer: "1",
  toevoeging: "A",
  straat: "Dam",
  plaats: "Amsterdam",
  landcode: "+31",
  telefoon: "612345678",
  landcode2: "+31",
  telefoon2: "",
  perPost: false,
  email: "pj@voorbeeld.nl",
  iban: "NL91ABNA0417164300",
  ibanTnvZelfde: true,
  ibanTnv: "",
  contractType: "Zakelijk",
  betaalperiode: "Jaar Acceptgiro",
  opmerkingen: "Graag bellen",
  scanPath: "",
} satisfies FormInput)

const recruiter = { wervernaam: "Anna", wervernr: "W0001" }
const received = new Date("2026-09-30T08:10:00.000Z")

describe("toSubmissionRecord", () => {
  it("takes the user and recruiter from the verified caller, not from the form", () => {
    const record = toSubmissionRecord(values, "user-a", recruiter, received)
    expect(record).toMatchObject({ user_id: "user-a", wervernaam: "Anna", wervernr: "W0001" })
  })

  it("combines the phone number and stores 'Per post' when the customer has no email", () => {
    const record = toSubmissionRecord({ ...values, perPost: true, email: "" }, "user-a", recruiter, received)
    expect(record.telefoon).toBe("+31612345678")
    expect(record.email).toBe("Per post")
  })

  it("keeps the scan of the paper contract for onboarding", () => {
    const scanPath = "user-a/0b5a1a6e-8a2f-4f3c-9d7e-2d1f4c3b2a10.jpg"
    expect(toSubmissionRecord({ ...values, scanPath }, "user-a", recruiter, received).scan_path).toBe(scanPath)
  })

  it("stores no second phone number or account holder by default", () => {
    const record = toSubmissionRecord(values, "user-a", recruiter, received)
    expect(record).toMatchObject({ telefoon2: "", iban_tnv: "" })
  })

  it("combines the second phone number and keeps a different account holder", () => {
    const record = toSubmissionRecord(
      { ...values, landcode2: "+32", telefoon2: "470123456", ibanTnvZelfde: false, ibanTnv: "M. de Vries" },
      "user-a",
      recruiter,
      received,
    )
    expect(record).toMatchObject({ telefoon2: "+32470123456", iban_tnv: "M. de Vries" })
  })

  it("ignores a typed account holder while 'same as surname' is on", () => {
    const record = toSubmissionRecord({ ...values, ibanTnv: "M. de Vries" }, "user-a", recruiter, received)
    expect(record.iban_tnv).toBe("")
  })
})

describe("toSheetRow", () => {
  it("fills every sheet column, in the sheet's order and the previous app's format", () => {
    const row = toSheetRow(toSubmissionRecord(values, "user-a", recruiter, received))
    expect(Object.keys(row).sort()).toEqual([...SHEET_COLUMNS].sort())
    expect(SHEET_COLUMNS.map((column) => row[column])).toEqual([
      values.rowId,
      "30-09-2026 10:10",
      "Anna",
      "30-09-2026 10:00",
      "30-09-2026 10:10",
      "Unknown",
      "30-09-2026",
      "Anna",
      "W0001",
      "100234",
      "M",
      "P.J. Jansen",
      "1012JS",
      "1",
      "A",
      "Dam",
      "Amsterdam",
      "+31612345678",
      "pj@voorbeeld.nl",
      "NL91ABNA0417164300",
      "Z",
      "JA",
      "Graag bellen",
    ])
  })
})
