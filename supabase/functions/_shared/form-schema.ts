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

export const formSchema = z
  .object({
    rowId: z.uuid(),
    started: z.iso.datetime(),
    datum: z.iso.date({ error: "Kies een datum" }),
    klantnummer: z.string().trim().min(1, "Vul het klantnummer in"),
    geslacht: z.enum(GESLACHT_OPTIONS, { error: "Kies man of vrouw" }),
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
    iban: z
      .string()
      .transform(normalizeIban)
      .refine(isValidIbanChecksum, "Ongeldig IBAN nummer"),
    contractType: z.enum(CONTRACT_TYPE_OPTIONS, { error: "Kies een contracttype" }),
    betaalperiode: z.enum(BETAALPERIODE_OPTIONS, { error: "Kies een betaaltermijn" }),
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

/** Fields Claude may extract from a photographed paper form. */
export const EXTRACTABLE_FIELDS = [
  "klantnummer",
  "geslacht",
  "naam",
  "postcode",
  "huisnummer",
  "toevoeging",
  "straat",
  "plaats",
  "landcode",
  "telefoon",
  "email",
  "iban",
  "contractType",
  "betaalperiode",
  "opmerkingen",
] as const satisfies readonly (keyof FormInput)[]

export type ExtractedFields = Partial<Record<(typeof EXTRACTABLE_FIELDS)[number], string>>

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
