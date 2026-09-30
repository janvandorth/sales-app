// Shared between the web app (via the `@shared` alias) and the edge functions (via deno.json import map).
import { z } from "zod"

export const GESLACHT_OPTIONS = ["Man", "Vrouw"] as const

export const CONTRACT_TYPE_OPTIONS = ["Service", "Zakelijk"] as const

export const BETAALPERIODE_OPTIONS = [
  "Maand Machtiging",
  "Jaar Machtiging",
  "Kwartaal Machtiging",
  "Jaar Acceptgiro",
  "Zakelijk Acceptgiro",
] as const

export const PER_POST_EMAIL = "Per post"

// Initials followed by a surname, e.g. "P.J. Jansen", "Th. van der Berg", "A. de Vries-Bakker".
const NAAM_REGEX =
  /^(?:\p{Lu}\p{Ll}?\.){1,6}\s*(?:(?:van|de|der|den|het|ten|ter|te|in|'t|la|le|du|da|di|von|el|al|op)\s+)*\p{Lu}[\p{L}'’-]*(?:[\s-]\p{L}[\p{L}'’-]*)*$/u

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
    geslacht: z.enum([...GESLACHT_OPTIONS, ""], { error: "Kies man of vrouw" }).transform(requireChoice("Kies man of vrouw")),
    naam: z
      .string()
      .trim()
      .min(1, "Vul de naam in")
      .regex(NAAM_REGEX, "Gebruik voorletters + achternaam, bijv. P.J. Jansen"),
    postcode: z
      .string()
      .trim()
      .regex(POSTCODE_REGEX, "Ongeldige postcode, bijv. 1234 AB")
      .transform(normalizePostcode),
    huisnummer: z
      .string()
      .trim()
      .regex(/^\d{1,5}$/, "Alleen cijfers"),
    toevoeging: z.string().trim().max(10, "Maximaal 10 tekens"),
    straat: z.string().trim().min(1, "Vul de straat in"),
    plaats: z.string().trim().min(1, "Vul de plaats in"),
    landcode: z.string().regex(/^\+\d{1,4}$/, "Kies een landcode"),
    telefoon: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5,13}$/, "Alleen cijfers, zonder 0 of landcode"),
    perPost: z.boolean(),
    email: z.string().trim(),
    // Required, but an invalid IBAN may still be submitted; the app warns the user when online.
    iban: z.string().transform(normalizeIban).pipe(z.string().min(1, "Vul het IBAN in")),
    contractType: z.enum([...CONTRACT_TYPE_OPTIONS, ""], { error: "Kies een contracttype" }).transform(requireChoice("Kies een contracttype")),
    betaalperiode: z.enum([...BETAALPERIODE_OPTIONS, ""], { error: "Kies een betaaltermijn" }).transform(requireChoice("Kies een betaaltermijn")),
    opmerkingen: z.string().trim().max(2000),
  })
  .superRefine((values, ctx) => {
    if (values.perPost) return
    if (!z.email().safeParse(values.email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Ongeldig e-mailadres" })
    }
  })

export type FormInput = z.input<typeof formSchema>
export type FormValues = z.output<typeof formSchema>

/**
 * What Claude reads from a photographed paper form. This is the single definition: the JSON schema sent to
 * Claude, the validation of its answer and the order of the fill animation are all derived from it.
 * Keys are in form order. Every key is always present; "" means "not on the paper form".
 * Opmerkingen is digital-only, so it is not part of the paper form.
 */
export const extractionSchema = z.strictObject({
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
  email: z.string(),
  iban: z.string(),
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
