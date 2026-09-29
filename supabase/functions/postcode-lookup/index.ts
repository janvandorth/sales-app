import { requireUser } from "../_shared/auth.ts"
import { POSTCODE_REGEX, normalizePostcode } from "../_shared/form-schema.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { zmGet } from "../_shared/zekerenmobiel.ts"

type LookupResponse = { hasError: boolean; street: string | null; residence: string | null }

serve(async (req) => {
  await requireUser(req)
  const { postcode, huisnummer } = await req.json()

  if (typeof postcode !== "string" || !POSTCODE_REGEX.test(postcode.trim())) {
    throw new HttpError(400, "Ongeldige postcode")
  }
  if (typeof huisnummer !== "string" || !/^\d{1,5}$/.test(huisnummer.trim())) {
    throw new HttpError(400, "Ongeldig huisnummer")
  }

  const result = await zmGet<LookupResponse>("/PostalCode/Lookup", {
    postalCode: normalizePostcode(postcode),
    houseNr: huisnummer.trim(),
  })

  if (result.hasError || !result.street || !result.residence) {
    return json({ found: false })
  }
  return json({ found: true, straat: result.street, plaats: toTitleCase(result.residence) })
})

/** "DEN HAAG" -> "Den Haag", "'S-GRAVENHAGE" -> "'s-Gravenhage" */
function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase())
    .replace(/^'S-/i, "'s-")
}
