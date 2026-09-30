import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireUser } from "../_shared/auth.ts"
import { optionalEnv } from "../_shared/env.ts"
import {
  BETAALPERIODE_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  EXTRACTABLE_FIELDS,
  GESLACHT_OPTIONS,
  type ExtractedFields,
} from "../_shared/form-schema.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { createAdminClient } from "../_shared/supabase.ts"

// Reading a form is a simple visual task; Sonnet at low effort keeps the scan fast.
const MODEL = "claude-sonnet-5-5"
const BUCKET = "scans"

const SYSTEM_PROMPT = `Je leest foto's van ingevulde (vaak handgeschreven) Nederlandse verkoopformulieren van Zeker en Mobiel uit en zet de gegevens om naar gestructureerde velden.

Regels:
- Neem alleen over wat op het formulier staat. Laat een veld weg als het leeg, onleesbaar of niet aanwezig is; verzin niets.
- naam: voorletters met punten + achternaam, bijv. "P.J. Jansen" of "A. van der Berg".
- postcode: "1234AB" zonder spatie. huisnummer: alleen cijfers; letters of toevoegingen gaan naar toevoeging.
- landcode: internationaal kengetal met +, bijv. "+31". telefoon: alleen cijfers zonder landcode en zonder voorloop-0 (06-12345678 wordt "612345678").
- iban: zonder spaties, hoofdletters.
- geslacht, contractType en betaalperiode: kies exact een van de toegestane waarden als die duidelijk is aangevinkt of vermeld.`

// Every field is required so Claude always returns the complete shape; "" means "not on the form".
const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    klantnummer: { type: "string" },
    geslacht: { type: "string", enum: [...GESLACHT_OPTIONS, ""] },
    naam: { type: "string" },
    postcode: { type: "string" },
    huisnummer: { type: "string" },
    toevoeging: { type: "string" },
    straat: { type: "string" },
    plaats: { type: "string" },
    landcode: { type: "string" },
    telefoon: { type: "string" },
    email: { type: "string" },
    iban: { type: "string" },
    contractType: { type: "string", enum: [...CONTRACT_TYPE_OPTIONS, ""] },
    betaalperiode: { type: "string", enum: [...BETAALPERIODE_OPTIONS, ""] },
  },
  required: [...EXTRACTABLE_FIELDS],
}

// The same contract, enforced on whatever comes back (Claude or mock) before it reaches the app.
const extractionResult = z.object({
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

// Used until ANTHROPIC_API_KEY is configured, so the scan flow can be demonstrated end to end.
const MOCK_RESULT: z.infer<typeof extractionResult> = {
  klantnummer: "100234",
  geslacht: "Vrouw",
  naam: "M.A. de Vries",
  postcode: "1012JS",
  huisnummer: "1",
  toevoeging: "",
  straat: "Dam",
  plaats: "Amsterdam",
  landcode: "+31",
  telefoon: "612345678",
  email: "m.devries@voorbeeld.nl",
  iban: "NL91ABNA0417164300",
  contractType: "Service",
  betaalperiode: "Maand Machtiging",
}
const MOCK_DELAY_MS = 2500

serve(async (req) => {
  const { supabase, user } = await requireUser(req)
  const { path } = await req.json()
  if (typeof path !== "string" || !path.startsWith(`${user.id}/`)) {
    throw new HttpError(400, "Ongeldig bestandspad")
  }

  // The photo contains personal data (IBAN, phone, address): delete it as soon as it has been read,
  // also when reading fails. The extracted values live on in the form, not in storage.
  try {
    return await extract(supabase, path)
  } finally {
    const { error } = await createAdminClient().storage.from(BUCKET).remove([path])
    if (error) console.error(`Could not delete scan ${path}`, error)
  }
})

async function extract(supabase: SupabaseClient, path: string): Promise<Response> {
  const apiKey = optionalEnv("ANTHROPIC_API_KEY")
  if (!apiKey) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))
    return json({ fields: toFields(extractionResult.parse(MOCK_RESULT)), mock: true })
  }

  const { data: file, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !file) throw new HttpError(404, "Foto niet gevonden")

  const mediaType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg"
  const data = encodeBase64(new Uint8Array(await file.arrayBuffer()))

  // Keys that are not scoped to a workspace must name one on every request.
  const workspaceId = optionalEnv("ANTHROPIC_WORKSPACE_ID")
  const client = new Anthropic({
    apiKey,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  })
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    // @ts-expect-error `fallbacks: "default"` is newer than some SDK typings.
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: extractionSchema },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: "Lees dit formulier uit." },
        ],
      },
    ],
  })

  if (response.stop_reason === "refusal") throw new HttpError(422, "De foto kon niet worden verwerkt")

  const text = response.content.find((block) => block.type === "text")
  if (!text || text.type !== "text") throw new HttpError(502, "Geen resultaat ontvangen")

  const parsed = extractionResult.safeParse(JSON.parse(text.text))
  if (!parsed.success) throw new HttpError(502, "Onverwacht resultaat bij het uitlezen")
  return json({ fields: toFields(parsed.data), mock: false })
}

/** Drops empty values so the app only fills fields that were actually found. */
function toFields(result: z.infer<typeof extractionResult>): ExtractedFields {
  const fields: ExtractedFields = {}
  for (const key of EXTRACTABLE_FIELDS) {
    const value = result[key].trim()
    if (value) fields[key] = value
  }
  return fields
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
