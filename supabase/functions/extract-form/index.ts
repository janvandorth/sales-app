import Anthropic from "@anthropic-ai/sdk"
import { requireUser } from "../_shared/auth.ts"
import {
  BETAALPERIODE_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  EXTRACTABLE_FIELDS,
  GESLACHT_OPTIONS,
  type ExtractedFields,
} from "../_shared/form-schema.ts"
import { HttpError, json, serve } from "../_shared/http.ts"

const MODEL = "claude-opus-5-5"
const BUCKET = "scans"

const SYSTEM_PROMPT = `Je leest foto's van ingevulde (vaak handgeschreven) Nederlandse verkoopformulieren van Zeker en Mobiel uit en zet de gegevens om naar gestructureerde velden.

Regels:
- Neem alleen over wat op het formulier staat. Laat een veld weg als het leeg, onleesbaar of niet aanwezig is; verzin niets.
- naam: voorletters met punten + achternaam, bijv. "P.J. Jansen" of "A. van der Berg".
- postcode: "1234AB" zonder spatie. huisnummer: alleen cijfers; letters of toevoegingen gaan naar toevoeging.
- landcode: internationaal kengetal met +, bijv. "+31". telefoon: alleen cijfers zonder landcode en zonder voorloop-0 (06-12345678 wordt "612345678").
- iban: zonder spaties, hoofdletters.
- geslacht, contractType en betaalperiode: kies exact een van de toegestane waarden als die duidelijk is aangevinkt of vermeld.`

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    klantnummer: { type: "string" },
    geslacht: { type: "string", enum: [...GESLACHT_OPTIONS] },
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
    contractType: { type: "string", enum: [...CONTRACT_TYPE_OPTIONS] },
    betaalperiode: { type: "string", enum: [...BETAALPERIODE_OPTIONS] },
    opmerkingen: { type: "string" },
  },
  required: [],
}

serve(async (req) => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) throw new HttpError(503, "Scannen is nog niet geconfigureerd")

  const { supabase, user } = await requireUser(req)
  const { path } = await req.json()
  if (typeof path !== "string" || !path.startsWith(`${user.id}/`)) {
    throw new HttpError(400, "Ongeldig bestandspad")
  }

  const { data: file, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !file) throw new HttpError(404, "Foto niet gevonden")

  const mediaType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg"
  const data = encodeBase64(new Uint8Array(await file.arrayBuffer()))

  const client = new Anthropic({ apiKey })
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    // @ts-expect-error `fallbacks: "default"` is newer than some SDK typings.
    fallbacks: "default",
    output_config: {
      effort: "medium",
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

  const parsed = JSON.parse(text.text) as Record<string, unknown>
  const fields: ExtractedFields = {}
  for (const key of EXTRACTABLE_FIELDS) {
    const value = parsed[key]
    if (typeof value === "string" && value.trim()) fields[key] = value.trim()
  }
  return json({ fields })
})

function encodeBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
