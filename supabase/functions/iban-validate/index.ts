import { z } from "zod"
import { requireUser } from "../_shared/auth.ts"
import { isValidIbanChecksum, normalizeIban } from "../_shared/form-schema.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { zmGet } from "../_shared/zekerenmobiel.ts"

const validateResponse = z.object({
  valid: z.boolean(),
  bankData: z.object({ name: z.string(), bic: z.string() }).nullable(),
})

serve(async (req) => {
  await requireUser(req)
  const { iban } = await req.json()
  if (typeof iban !== "string") throw new HttpError(400, "IBAN ontbreekt")

  const normalized = normalizeIban(iban)
  // The upstream API accepts anything that is not a Dutch IBAN, so check the checksum ourselves first.
  if (!isValidIbanChecksum(normalized)) return json({ valid: false, iban: normalized })

  const result = await zmGet("/IBAN/Validate", { iban: normalized }, validateResponse)
  return json({
    valid: result.valid,
    iban: normalized,
    bank: result.bankData?.name || null,
    bic: result.bankData?.bic || null,
  })
})
