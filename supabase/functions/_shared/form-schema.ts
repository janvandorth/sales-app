// Shared between the web app (via the `@shared` alias) and the edge functions (via deno.json import map).
import { getExampleNumber, isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js/max"
import mobileExamples from "libphonenumber-js/mobile/examples"
import { z } from "zod"

export const GESLACHT_OPTIONS = ["Man", "Vrouw"] as const

export const CONTRACT_TYPE_OPTIONS = ["Service", "Zakelijk"] as const

export const BETAALPERIODE_OPTIONS = [
  "Maand Machtiging",
  "Kwartaal Machtiging",
  "Jaar Machtiging",
  "Zakelijk Jaar Machtiging",
] as const

/**
 * No longer offered, but still accepted: a sale queued in the outbox, or sent by an app that has not reloaded
 * since, may carry one. Onboarding and the sheet still know their codes.
 */
export const LEGACY_BETAALPERIODE_OPTIONS = ["Jaar Acceptgiro", "Zakelijk Acceptgiro"] as const

export const PER_POST_EMAIL = "Per post"

export const PHONE_REGEX = /^[1-9]\d{5,13}$/
const PHONE_MESSAGE = "Alleen cijfers, zonder 0 of landcode"
const LANDCODE_REGEX = /^\+\d{1,4}$/

/**
 * Checks the number against the country's numbering plan (libphonenumber), which knows the right number of digits
 * per country and per kind of number (e.g. a Dutch mobile is 6 + 8 digits). Returns the error message, or
 * undefined when the number is valid. Only for numbers that already match PHONE_REGEX.
 */
export function phoneNumberError(landcode: string, telefoon: string): string | undefined {
  const international = `${landcode}${telefoon}`
  if (isValidPhoneNumber(international)) return undefined
  const parsed = parsePhoneNumber(international)
  const country = parsed.country ?? parsed.getPossibleCountries()[0]
  const example = country && getExampleNumber(country, mobileExamples)?.nationalNumber
  return example
    ? `Ongeldig nummer voor dit land; mobiel is bijv. ${example} (${example.length} cijfers)`
    : "Ongeldig nummer voor dit land"
}

/** Runs the phone check only when the number itself is filled in correctly, so it shows one message at a time. */
function checksPhone(landcode: "landcode" | "landcode2", telefoon: "telefoon" | "telefoon2") {
  return {
    path: [telefoon],
    error: (issue: { input: unknown }) => {
      const values = issue.input as Record<string, string>
      return phoneNumberError(values[landcode], values[telefoon].trim())
    },
    when: ({ value }: { value: unknown }) => {
      if (typeof value !== "object" || value === null) return false
      const values = value as Record<string, unknown>
      const number = values[telefoon]
      return (
        typeof values[landcode] === "string" &&
        LANDCODE_REGEX.test(values[landcode]) &&
        typeof number === "string" &&
        PHONE_REGEX.test(number.trim())
      )
    },
  }
}

export const POSTCODE_REGEX = /^[1-9]\d{3}\s?[A-Za-z]{2}$/

export function normalizePostcode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase()
}

export function normalizeIban(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase()
}

/** ISO 13616 mod-97 check. */
export function isValidIbanChecksum(value: string): boolean {
  const iban = normalizeIban(value)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let remainder = 0
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  return remainder === 1
}

/**
 * Radio groups start as "" (nothing picked). "" is accepted as input so empty forms type-check, but it is
 * rejected by validation, and the validated output type no longer contains it.
 */
function requireChoice(message: string) {
  return <V extends string>(value: V, ctx: z.RefinementCtx): Exclude<V, ""> => {
    if (value === "") {
      ctx.addIssue({ code: "custom", message })
      return z.NEVER
    }
    return value as Exclude<V, ""> // TypeScript cannot narrow a generic by comparison.
  }
}

export const formSchema = z
  .object({
    rowId: z.uuid(),
    started: z.iso.datetime(),
    datum: z.iso.date({ error: "Kies een datum" }),
    klantnummer: z.string().trim().min(1, "Vul het klantnummer in"),
    geslacht: z
      .enum([...GESLACHT_OPTIONS, ""], { error: "Kies man of vrouw" })
      .transform(requireChoice("Kies man of vrouw")),
    // Free-form: no rule fits every name worldwide. The app suggests capitals and initials, but never enforces them.
    naam: z.string().trim().min(1, "Vul de naam in").max(200, "Maximaal 200 tekens"),
    postcode: z.string().trim().regex(POSTCODE_REGEX, "Ongeldige postcode, bijv. 1234 AB").transform(normalizePostcode),
    huisnummer: z
      .string()
      .trim()
      .regex(/^\d{1,5}$/, "Alleen cijfers"),
    toevoeging: z.string().trim().max(10, "Maximaal 10 tekens"),
    straat: z.string().trim().min(1, "Vul de straat in"),
    plaats: z.string().trim().min(1, "Vul de plaats in"),
    landcode: z.string().regex(LANDCODE_REGEX, "Kies een landcode"),
    telefoon: z.string().trim().regex(PHONE_REGEX, PHONE_MESSAGE),
    // Optional second number; "" means none.
    landcode2: z.string().regex(LANDCODE_REGEX, "Kies een landcode"),
    telefoon2: z
      .string()
      .trim()
      .refine((value) => value === "" || PHONE_REGEX.test(value), PHONE_MESSAGE),
    perPost: z.boolean(),
    email: z.string().trim(),
    // Required, but an invalid IBAN may still be submitted; the app warns the user when online.
    iban: z.string().transform(normalizeIban).pipe(z.string().min(1, "Vul het IBAN in")),
    // "Ten name van": the account holder. Same as the customer's surname unless switched off.
    ibanTnvZelfde: z.boolean(),
    ibanTnv: z.string().trim().max(200, "Maximaal 200 tekens"),
    contractType: z
      .enum([...CONTRACT_TYPE_OPTIONS, ""], { error: "Kies een contracttype" })
      .transform(requireChoice("Kies een contracttype")),
    betaalperiode: z
      .enum([...BETAALPERIODE_OPTIONS, ...LEGACY_BETAALPERIODE_OPTIONS, ""], { error: "Kies een betaaltermijn" })
      .transform(requireChoice("Kies een betaaltermijn")),
    opmerkingen: z.string().trim().max(2000),
    // The scanned photo of the paper contract in the scans bucket, "" when the form was typed in. Sent along to
    // onboarding, which files it with the customer. submit-form checks that it is in the caller's own folder.
    scanPath: z.string().max(200),
    // Admins only: the recruiter the sale is booked on, picked from ZMAdmin's list; null means the caller. submit-form
    // ignores it for everyone else.
    werver: z
      .object({
        wervernaam: z.string().trim().min(1).max(100),
        wervernr: z.string().trim().min(1).max(50),
      })
      .nullable(),
  })
  .refine((values) => values.perPost || z.email().safeParse(values.email).success, {
    path: ["email"],
    message: "Ongeldig e-mailadres",
    // Also check while other fields are still invalid, so every error shows at once.
    when: ({ value }) => typeof value === "object" && value !== null && "perPost" in value && "email" in value,
  })
  .refine((values) => values.ibanTnvZelfde || values.ibanTnv !== "", {
    path: ["ibanTnv"],
    message: "Vul in op wiens naam de rekening staat",
    when: ({ value }) => typeof value === "object" && value !== null && "ibanTnvZelfde" in value && "ibanTnv" in value,
  })
  .refine((values) => !phoneNumberError(values.landcode, values.telefoon), checksPhone("landcode", "telefoon"))
  // telefoon2 "" fails PHONE_REGEX, so an empty second number is never checked.
  .refine((values) => !phoneNumberError(values.landcode2, values.telefoon2), checksPhone("landcode2", "telefoon2"))

export type FormInput = z.input<typeof formSchema>

/**
 * Fields added after the first release, with their empty values. The server fills them in when missing, so a
 * sale from an app that has not updated yet (or waited in its offline outbox) is still accepted.
 */
export const ADDED_FIELD_DEFAULTS = {
  landcode2: "+31",
  telefoon2: "",
  ibanTnvZelfde: true,
  ibanTnv: "",
  scanPath: "",
  werver: null,
} satisfies Partial<FormInput>

/** Parses a submitted form body, filling in fields an older app version does not send. */
export function parseSubmittedForm(body: unknown) {
  const withDefaults = typeof body === "object" && body !== null ? { ...ADDED_FIELD_DEFAULTS, ...body } : body
  return formSchema.safeParse(withDefaults)
}
export type FormValues = z.output<typeof formSchema>

/**
 * What Claude reads from a photographed paper form. This is the single definition: the JSON schema sent to
 * Claude, the validation of its answer and the order of the fill animation are all derived from it.
 * Keys are in form order. Every key is always present; "" means "not on the paper form".
 * Opmerkingen is digital-only, so it is not part of the paper form.
 */
export const extractionSchema = z.strictObject({
  datum: z.string(),
  klantnummer: z.string(),
  geslacht: z.enum([...GESLACHT_OPTIONS, ""]),
  naam: z.string(),
  postcode: z.string(),
  huisnummer: z.string(),
  toevoeging: z.string(),
  straat: z.string(),
  plaats: z.string(),
  landcode: z.string(),
  telefoon: z.string(),
  landcode2: z.string(),
  telefoon2: z.string(),
  email: z.string(),
  iban: z.string(),
  ibanTnv: z.string(),
  contractType: z.enum([...CONTRACT_TYPE_OPTIONS, ""]),
  betaalperiode: z.enum([...BETAALPERIODE_OPTIONS, ""]),
})

export type Extraction = z.infer<typeof extractionSchema>

/** Extractable form fields, in form order. */
export const EXTRACTABLE_FIELDS = extractionSchema.keyof().options satisfies readonly (keyof FormInput)[]

export type ExtractableField = (typeof EXTRACTABLE_FIELDS)[number]

/** Extraction result as sent to the app: only the fields that were found, already normalized. */
export type ExtractedFields = { [K in ExtractableField]?: Exclude<Extraction[K], ""> }

/** One row in the Google Sheet, keyed by the sheet's column headers. */
export type SheetRow = {
  RowId: string
  Completed: string
  CompletedBy: string
  Started: string
  Received: string
  CompletedAt: string
  Datum: string
  Wervernaam: string
  Wervernr: string
  Klantnummer: string
  Geslacht: string
  Naam: string
  Postcode: string
  Huisnummer: string
  Toevoeging: string
  Straat: string
  Plaats: string
  Telefoon: string
  Email: string
  IBAN: string
  ContractType: string
  Betaalperiode: string
  Opmerkingen: string
}

export const SHEET_COLUMNS: (keyof SheetRow)[] = [
  "RowId",
  "Completed",
  "CompletedBy",
  "Started",
  "Received",
  "CompletedAt",
  "Datum",
  "Wervernaam",
  "Wervernr",
  "Klantnummer",
  "Geslacht",
  "Naam",
  "Postcode",
  "Huisnummer",
  "Toevoeging",
  "Straat",
  "Plaats",
  "Telefoon",
  "Email",
  "IBAN",
  "ContractType",
  "Betaalperiode",
  "Opmerkingen",
]
