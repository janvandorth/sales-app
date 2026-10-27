import { describe, expect, it } from "vitest"
import {
  formSchema,
  isValidIbanChecksum,
  parseSubmittedForm,
  normalizeIban,
  normalizePostcode,
  type FormInput,
} from "./form-schema"

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
  landcode2: "+31",
  telefoon2: "",
  perPost: false,
  email: "m.devries@voorbeeld.nl",
  iban: "nl91 abna 0417 1643 00",
  ibanTnvZelfde: true,
  ibanTnv: "",
  contractType: "Service",
  betaalperiode: "Maand Machtiging",
  opmerkingen: "",
  scanPath: "",
  werver: null,
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

  it("accepts a form from an older app version without the second phone number, account holder and scan", () => {
    const { landcode2: _l, telefoon2: _t, ibanTnvZelfde: _z, ibanTnv: _n, scanPath: _s, ...older } = validForm
    expect(formSchema.safeParse(older).success).toBe(false)
    expect(parseSubmittedForm(older).data).toMatchObject({
      telefoon2: "",
      ibanTnvZelfde: true,
      ibanTnv: "",
      scanPath: "",
    })
  })

  it("books a form from an app without the werver picker on the caller", () => {
    const { werver: _w, ...older } = validForm
    expect(formSchema.safeParse(older).success).toBe(false)
    expect(parseSubmittedForm(older).data?.werver).toBeNull()
  })

  it("requires a picked werver to have a name and a recruiter code", () => {
    expect(issuesFor({ werver: { wervernaam: "Piet Pietersen", wervernr: "0212BB" } })).toEqual([])
    expect(issuesFor({ werver: { wervernaam: "Piet Pietersen", wervernr: " " } })).toEqual(["werver.wervernr"])
  })

  it("checks the second phone number only when one is filled in", () => {
    expect(issuesFor({ telefoon2: "0612345678" })).toEqual(["telefoon2"])
    expect(issuesFor({ telefoon2: "622222222" })).toEqual([])
  })

  it("requires the account holder once 'same as surname' is switched off", () => {
    expect(issuesFor({ ibanTnvZelfde: false, ibanTnv: " " })).toEqual(["ibanTnv"])
    expect(issuesFor({ ibanTnvZelfde: false, ibanTnv: "M. de Vries" })).toEqual([])
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

  it("checks the number of digits for the chosen country", () => {
    expect(issuesFor({ telefoon: "61234567" })).toEqual(["telefoon"])
    expect(issuesFor({ telefoon: "6123456789" })).toEqual(["telefoon"])
    expect(issuesFor({ telefoon: "201234567" })).toEqual([])
    expect(issuesFor({ landcode: "+32", telefoon: "470123456" })).toEqual([])
    expect(issuesFor({ landcode: "+49", telefoon: "15112345678" })).toEqual([])
    expect(issuesFor({ landcode: "+45", telefoon: "20123456" })).toEqual([])
    expect(issuesFor({ landcode2: "+44", telefoon2: "79111234" })).toEqual(["telefoon2"])
  })

  it("tells how many digits a mobile number has in that country", () => {
    const result = formSchema.safeParse({ ...validForm, telefoon: "61234567" })
    expect(result.error?.issues[0].message).toBe("Ongeldig nummer voor dit land; mobiel is bijv. 612345678 (9 cijfers)")
  })

  it("shows only the format message when the number has a leading 0", () => {
    const result = formSchema.safeParse({ ...validForm, telefoon: "0612345678" })
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Alleen cijfers, zonder 0 of landcode"])
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
