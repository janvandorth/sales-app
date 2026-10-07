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

// Opus reads handwriting in the boxed fields (IBAN, phone) far more reliably than Sonnet; low effort keeps the scan fast.
const MODEL = "claude-opus-5-5"

const SYSTEM_PROMPT = `Je leest foto's van ingevulde (vaak handgeschreven) Nederlandse verkoopformulieren van Zeker en Mobiel uit en zet de gegevens om naar gestructureerde velden.

Vakjesvelden:
- Voorletters, huisnummer, postcode, telefoonnummer en IBAN staan op het formulier in een rij vakjes die van elkaar gescheiden zijn door voorgedrukte verticale streepjes (|). Die streepjes horen bij het formulier en zijn GEEN tekens: lees ze nooit als "1", "I", "l" of "|".
- Elk vakje bevat hoogstens één handgeschreven teken. Lees het veld vakje voor vakje; een leeg vakje levert niets op.
- Een "1" is alleen een 1 als er een pennenstreep (meestal blauwe of zwarte inkt, vaak met een schuin haaltje bovenaan) binnen een vakje staat. Een dunne, rechte, grijze/zwarte drukstreep op de grens tussen twee vakjes is een scheidingslijn.
- Handschrift loopt soms over een scheidingslijn heen; tel dan het teken één keer.
- Een handgeschreven 1 kan ook op een schuine streep, een haakje of een "l" lijken; beoordeel per vakje of er inkt in staat.
- Buiten de vakjes (vrij geschreven) is een 1 vaak maar een kort streepje, schuin haaltje of apostrof-achtig tekentje tussen de andere cijfers. Tel elk zo'n streepje als een 1; sla het niet over.

Doorhalingen en verbeteringen:
- Doorgestreepte tekens tellen niet mee.
- Staat er boven, onder of naast de vakjes een waarde geschreven (omdat de verkoper zich verschreef of de vakjes vol waren), dan is dat meestal de juiste waarde. Neem die geschreven waarde over in plaats van wat in de vakjes staat, vooral als de vakjes doorgestreept of onvolledig zijn. Plak de twee nooit aan elkaar.

Lengtecontrole (tel je tekens na):
- Een Nederlands IBAN is precies 18 tekens: NL + 2 cijfers + 4 letters (bankcode, bijv. INGB, ABNA, RABO) + 10 cijfers. Buitenlandse IBANs hebben een andere lengte.
- Een Nederlands telefoonnummer is precies 10 cijfers inclusief de voorloop-0 (mobiel: 06 + 8 cijfers). Een buitenlands nummer begint meestal met + of 00 en kan een andere lengte hebben.
- Kom je bij een Nederlands IBAN of telefoonnummer op meer tekens uit, dan heb je waarschijnlijk een scheidingslijn als 1 gelezen of een doorgehaalde/verbeterde waarde meegeteld; kijk dan opnieuw. Kom je op minder uit, dan heb je vrijwel zeker een 1 (kort streepje) gemist; zoek die en neem hem op. Dit geldt ook voor een waarde die boven of naast de vakjes is geschreven.

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
