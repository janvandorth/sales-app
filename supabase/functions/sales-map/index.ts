import { requireUser } from "../_shared/auth.ts"
import { mapUrl } from "../_shared/contracts-api.ts"
import { optionalEnv } from "../_shared/env.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { salesMapRequestSchema, salesMapSchema, type SalesMap } from "../_shared/sales-map.ts"
import { demoSalesMap } from "../_shared/sales-map-demo.ts"
import { salesMapView, type SalesMapResponse } from "../_shared/sales-map-view.ts"

// Where the team sold, per PC4, for the map, from ZMAdmin via the Contracts API (GET .../Sales/2026.1/Map).
// Everyone sees the whole team's areas and when the newest sale there was; only admins also get how many sales
// and by whom. The counts are left out here, not in the app, so a recruiter's phone never receives them.
// Without STATS_API_KEY the areas are made up (demo mode).

serve(async (req) => {
  const { supabase, user } = await requireUser(req)
  const parsed = salesMapRequestSchema.safeParse(await req.json())
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Ongeldig verzoek")
  const { from, to } = parsed.data
  if (from > to) throw new HttpError(400, "Ongeldige periode")

  const { data: profile, error } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
  if (error || !profile) throw new HttpError(403, "Geen profiel gevonden")

  const key = optionalEnv("STATS_API_KEY")
  const map = key ? await fetchMap(mapUrl(), key, from, to) : demoSalesMap(from, to)
  const response: SalesMapResponse = { demo: !key, map: salesMapView(map, profile.is_admin === true, from, to) }
  return json(response)
})

async function fetchMap(endpoint: string, key: string, from: string, to: string): Promise<SalesMap> {
  const url = new URL(endpoint)
  url.searchParams.set("from", from)
  url.searchParams.set("to", to)

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
  const parsed = salesMapSchema.safeParse(body)
  if (!parsed.success) {
    console.error("Unexpected answer from the map endpoint", parsed.error.issues)
    throw new HttpError(502, "Onverwacht antwoord van de kaart")
  }
  return parsed.data
}
