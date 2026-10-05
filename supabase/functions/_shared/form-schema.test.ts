import { describe, expect, it } from "vitest"
import { formSchema, isValidIbanChecksum, normalizeIban, normalizePostcode, type FormInput } from "./form-schema"

const validForm: FormInput = {
  rowId: "0b5a1a6e-8a2f-4f3c-9d7e-2d1f4c3b2a10",
  started: "2026-09-30T08:00:00.000Z",
  datum: "2026-09-30",
  klantnummer: "100234",
  geslacht: "Vrouw",
  naam: "M.A. de Vries",
  postcode: "1012 js",
  huisnummer: "1",
  toevoeging: "",
  straat: "Dam",
  plaats: "Amsterdam",
  landcode: "+31",
  telefoon: "612345678",
  perPost: false,
  email: "m.devries@voorbeeld.nl",
  iban: "nl91 abna 0417 1643 00",
  contractType: "Service",
  betaalperiode: "Maand Machtiging",
  opmerkingen: "",
}

const issuesFor = (overrides: Partial<FormInput>) => {
  const result = formSchema.safeParse({ ...validForm, ...overrides })
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."))
}

describe("formSchema", () => {
  it("accepts a complete form and normalizes postcode and IBAN", () => {
    const result = formSchema.parse(validForm)
    expect(result.postcode).toBe("1012JS")
    expect(result.iban).toBe("NL91ABNA0417164300")
  })

  it.each(["P.J. Jansen", "Th. van der Berg", "IJ. de Boer", "J.-P. Dupont", "M. Di Maio", "p.j. jansen", "Jansen"])(
    "accepts the name %s as typed",
    (naam) => expect(formSchema.parse({ ...validForm, naam }).naam).toBe(naam),
  )

  it.each(["", "   "])("rejects the empty name %j", (naam) => {
    expect(issuesFor({ naam })).toContain("naam")
  })

  it("requires a choice for the radio groups", () => {
    expect(issuesFor({ geslacht: "", contractType: "", betaalperiode: "" })).toEqual([
      "geslacht",
      "contractType",
      "betaalperiode",
    ])
  })

  it("requires a valid email unless the customer wants post", () => {
    expect(issuesFor({ email: "geen-email" })).toContain("email")
    expect(issuesFor({ email: "", perPost: true })).toEqual([])
  })

  it("requires an IBAN but accepts an invalid one (the app asks for confirmation instead)", () => {
    expect(issuesFor({ iban: "" })).toContain("iban")
    expect(issuesFor({ iban: "NL91ABNA0417164301" })).toEqual([])
  })

  it("rejects a phone number with a leading 0", () => {
    expect(issuesFor({ telefoon: "0612345678" })).toContain("telefoon")
  })
})

describe("IBAN helpers", () => {
  it.each([
    ["NL91ABNA0417164300", true],
    ["NL91 ABNA 0417 1643 00", true],
    ["GB33BUKB20201555555555", true],
    ["NL91ABNA0417164301", false],
    ["xx", false],
  ])("isValidIbanChecksum(%s) is %s", (iban, expected) => {
    expect(isValidIbanChecksum(iban)).toBe(expected)
  })

  it("normalizes spacing and case", () => {
    expect(normalizeIban(" nl91-abna 0417164300 ")).toBe("NL91ABNA0417164300")
    expect(normalizePostcode(" 1012 js")).toBe("1012JS")
  })
})

describe("formSchema error reporting", () => {
  it("reports an invalid email together with the other errors", () => {
    expect(issuesFor({ klantnummer: "", email: "" })).toEqual(expect.arrayContaining(["klantnummer", "email"]))
  })
})
