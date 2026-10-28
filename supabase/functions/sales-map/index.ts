import type { z } from "zod"
import { requireUser } from "../_shared/auth.ts"
import { mapUrl } from "../_shared/contracts-api.ts"
import { optionalEnv } from "../_shared/env.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { salesMapRequestSchema, salesMapSchema, salesPc5Schema, salesPc6Schema } from "../_shared/sales-map.ts"
import { demoSalesMap } from "../_shared/sales-map-demo.ts"
import { salesMapView, salesPc5View, salesStreetsView, type SalesMapResponse } from "../_shared/sales-map-view.ts"

// Where the team sold, for the map, from ZMAdmin via the Contracts API: per PC4 (GET .../Sales/2026.1/Map), or
// zoomed in the PC5 areas (.../Map/Pc5) or the streets (.../Map/Pc6) in the map's view. Everyone sees the whole team's areas, when the newest sale
// there was and a shade for how much; only admins also get how many sales and by whom. The counts are left out
// here, not in the app, so a recruiter's phone never receives them.
// Without STATS_API_KEY the areas are made up (demo mode; no PC5 or street outlines then).

serve(async (req) => {
  const { supabase, user } = await requireUser(req)
  const parsed = salesMapRequestSchema.safeParse(await req.json())
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Ongeldig verzoek")
  const { from, to, bbox, level } = parsed.data
  if (from > to) throw new HttpError(400, "Ongeldige periode")

  const { data: profile, error } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
  if (error || !profile) throw new HttpError(403, "Geen profiel gevonden")
  const detailed = profile.is_admin === true

  const key = optionalEnv("STATS_API_KEY")
  let response: SalesMapResponse
  if (bbox && level === "pc5") {
    const pc5 = key
      ? await fetchFromApi(`${mapUrl()}/Pc5`, key, { from, to, bbox }, salesPc5Schema)
      : { areaThresholds: [], areas: [] }
    response = { demo: !key, streets: salesPc5View(pc5, detailed, from, to) }
  } else if (bbox) {
    const pc6 = key
      ? await fetchFromApi(`${mapUrl()}/Pc6`, key, { from, to, bbox }, salesPc6Schema)
      : { streetThresholds: [], streets: [] }
    response = { demo: !key, streets: salesStreetsView(pc6, detailed, from, to) }
  } else {
    const map = key ? await fetchFromApi(mapUrl(), key, { from, to }, salesMapSchema) : demoSalesMap(from, to)
    response = { demo: !key, map: salesMapView(map, detailed, from, to) }
  }
  return json(response)
})

async function fetchFromApi<T>(
  endpoint: string,
  key: string,
  query: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = new URL(endpoint)
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value)

  const response = await fetch(url, {
    headers: { "X-API-Key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }).catch((error) => {
    console.error("Map endpoint unreachable", error)
    throw new HttpError(502, "De kaart is nu niet bereikbaar")
  })
  const text = await response.text()
  if (!response.ok) {
    console.error(`Map endpoint answered ${response.status}: ${text.slice(0, 500)}`)
    throw new HttpError(502, "De kaart is nu niet bereikbaar")
  }

  let body: unknown = null
  try {
    body = JSON.parse(text)
  } catch {
    // Reported below.
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    console.error("Unexpected answer from the map endpoint", parsed.error.issues)
    throw new HttpError(502, "Onverwacht antwoord van de kaart")
  }
  return parsed.data
}
