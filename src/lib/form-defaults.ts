import type { FormInput } from "@shared/form-schema"

function today(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function createEmptyForm(): FormInput {
  return {
    rowId: crypto.randomUUID(),
    started: new Date().toISOString(),
    datum: today(),
    klantnummer: "",
    // Radio groups start unselected; the schema rejects the empty value on submit.
    geslacht: "" as FormInput["geslacht"],
    naam: "",
    postcode: "",
    huisnummer: "",
    toevoeging: "",
    straat: "",
    plaats: "",
    landcode: "+31",
    telefoon: "",
    perPost: false,
    email: "",
    iban: "",
    contractType: "" as FormInput["contractType"],
    betaalperiode: "" as FormInput["betaalperiode"],
    opmerkingen: "",
  }
}
