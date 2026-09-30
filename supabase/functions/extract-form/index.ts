import Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { requireUser } from "../_shared/auth.ts"
import { optionalEnv } from "../_shared/env.ts"
import {
  EXTRACTABLE_FIELDS,
  extractionSchema,
  normalizeIban,
  type ExtractedFields,
  type Extraction,
} from "../_shared/form-schema.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { SCANS_BUCKET } from "../_shared/storage.ts"
import { createAdminClient } from "../_shared/supabase.ts"

// Reading a form is a simple visual task; Sonnet at low effort keeps the scan fast.
const MODEL = "claude-sonnet-5-5"

const SYSTEM_PROMPT = `Je leest foto's van ingevulde (vaak handgeschreven) Nederlandse verkoopformulieren van Zeker en Mobiel uit en zet de gegevens om naar gestructureerde velden.

Regels:
- Neem alleen over wat op het formulier staat. Laat een veld leeg ("") als het leeg, onleesbaar of niet aanwezig is; verzin niets.
- naam: voorletters met punten + achternaam, bijv. "P.J. Jansen" of "A. van der Berg".
- postcode: "1234AB" zonder spatie. huisnummer: alleen cijfers; letters of toevoegingen gaan naar toevoeging.
- landcode: internationaal kengetal met +, bijv. "+31". telefoon: alleen cijfers zonder landcode en zonder voorloop-0 (06-12345678 wordt "612345678").
- iban: zonder spaties, hoofdletters.
- geslacht, contractType en betaalperiode: kies exact een van de toegestane waarden als die duidelijk is aangevinkt of vermeld.`

// Structured output schema for Claude, derived from the shared definition (minus the $schema marker).
const { $schema: _, ...EXTRACTION_JSON_SCHEMA } = z.toJSONSchema(extractionSchema)

// Returned when ANTHROPIC_API_KEY is not configured, so the scan flow can be demonstrated end to end.
const MOCK_EXTRACTION: Extraction = {
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

  const apiKey = optionalEnv("ANTHROPIC_API_KEY")
  const result = apiKey
    ? { fields: normalize(await readWithClaude(supabase, path, apiKey)), mock: false }
    : { fields: normalize(await mockRead()), mock: true }

  // The photo contains personal data (IBAN, phone, address): delete it once it has been read successfully.
  // After a failure it is kept so the scan can be retried or investigated.
  const { error } = await createAdminClient().storage.from(SCANS_BUCKET).remove([path])
  if (error) console.error(`Could not delete scan ${path}`, error)

  return json(result)
})

async function readWithClaude(supabase: SupabaseClient, path: string, apiKey: string): Promise<Extraction> {
  const { data: file, error } = await supabase.storage.from(SCANS_BUCKET).download(path)
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
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA },
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

  const parsed = extractionSchema.safeParse(JSON.parse(text.text))
  if (!parsed.success) throw new HttpError(502, "Onverwacht resultaat bij het uitlezen")
  return parsed.data
}

async function mockRead(): Promise<Extraction> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))
  return extractionSchema.parse(MOCK_EXTRACTION)
}

/** Cleans up what was read into the shape the form expects, and drops empty (not found) values. */
function normalize(extraction: Extraction): ExtractedFields {
  const cleaned: Extraction = {
    ...extraction,
    huisnummer: extraction.huisnummer.replace(/\D/g, ""),
    telefoon: extraction.telefoon.replace(/\D/g, "").replace(/^0+/, ""),
    iban: normalizeIban(extraction.iban),
    landcode: /^\+\d{1,4}$/.test(extraction.landcode.trim()) ? extraction.landcode.trim() : "",
  }
  const fields: Record<string, string> = {}
  for (const key of EXTRACTABLE_FIELDS) {
    const value = cleaned[key].trim()
    if (value) fields[key] = value
  }
  return fields as ExtractedFields
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
