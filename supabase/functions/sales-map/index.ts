import { requireUser } from "../_shared/auth.ts"
import { mapUrl } from "../_shared/contracts-api.ts"
import { optionalEnv } from "../_shared/env.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { salesMapRequestSchema, salesMapSchema, type SalesMap, type SalesMapResponse } from "../_shared/sales-map.ts"
import { demoSalesMap } from "../_shared/sales-map-demo.ts"

// Sales per postcode for the map, from ZMAdmin via the Contracts API (GET .../Sales/2026.1/Map). Every signed-in
// user sees the whole team's sales there, so unlike kpi there is no wervernr to enforce.
// Without STATS_API_KEY the areas are made up (demo mode).

serve(async (req) => {
  await requireUser(req)
  const parsed = salesMapRequestSchema.safeParse(await req.json())
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Ongeldig verzoek")
  const { from, to } = parsed.data
  if (from > to) throw new HttpError(400, "Ongeldige periode")

  const key = optionalEnv("STATS_API_KEY")
  const response: SalesMapResponse = key
    ? { demo: false, map: await fetchMap(mapUrl(), key, from, to) }
    : { demo: true, map: demoSalesMap(from, to) }
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
