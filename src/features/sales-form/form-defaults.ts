import { ADDED_FIELD_DEFAULTS, type FormInput } from "@shared/form-schema"

export function today(): string {
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
    // Radio groups start unselected ("" is a valid input that validation rejects on submit).
    geslacht: "",
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
    contractType: "",
    betaalperiode: "",
    opmerkingen: "",
    ...ADDED_FIELD_DEFAULTS,
  }
}

/** Set when a form is created; they say nothing about whether the user filled anything in. */
const AUTOMATIC_FIELDS = new Set<keyof FormInput>(["rowId", "started", "datum"])

/**
 * True when nothing was filled in yet. The date counts as automatic too: an untouched form from yesterday still
 * shows yesterday's date, and should simply start over.
 */
export function isEmptyForm(values: FormInput): boolean {
  const empty = createEmptyForm()
  return (Object.keys(empty) as (keyof FormInput)[]).every(
    (key) => AUTOMATIC_FIELDS.has(key) || values[key] === undefined || values[key] === empty[key],
  )
}
