import type { z } from "zod"
import { requireUser } from "../_shared/auth.ts"
import { opportunitiesUrl } from "../_shared/contracts-api.ts"
import { optionalEnv } from "../_shared/env.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { demoOpportunityAreas, demoOpportunityStreets } from "../_shared/sales-opportunities-demo.ts"
import {
  opportunitiesView,
  opportunityAreasSchema,
  opportunityPc5Schema,
  opportunityPc5View,
  opportunityPc6Schema,
  opportunityPc6View,
  opportunityStreetsSchema,
  opportunityStreetsView,
  salesOpportunitiesRequestSchema,
  type SalesOpportunitiesResponse,
} from "../_shared/sales-opportunities.ts"

// Where households are still "for grabs" for the map, from the Contracts API: per PC4, the ranked streets of one,
// or (zoomed in) the PC5 areas or the streets in the map's view, as shades for the vector-tile outlines in the app. Everyone sees the shades and the streets; only admins get
// households, customers and open households. The numbers are left out here, not in the app, so a recruiter's phone
// never receives them. Without STATS_API_KEY the answers are made up (demo mode; nothing zoomed in then).

serve(async (req) => {
  const { supabase, user } = await requireUser(req)
  const parsed = salesOpportunitiesRequestSchema.safeParse(await req.json())
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Ongeldig verzoek")
  const request = parsed.data

  const { data: profile, error } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
  if (error || !profile) throw new HttpError(403, "Geen profiel gevonden")
  const detailed = profile.is_admin === true

  const key = optionalEnv("STATS_API_KEY")
  let response: SalesOpportunitiesResponse
  if (request.action === "areas") {
    const api = key
      ? await fetchFromApi(opportunitiesUrl(), key, request.woz, opportunityAreasSchema)
      : demoOpportunityAreas(request.woz)
    response = { demo: !key, action: "areas", view: opportunitiesView(api, detailed) }
  } else if (request.action === "streets") {
    const api = key
      ? await fetchFromApi(opportunitiesUrl(request.pc4), key, request.woz, opportunityStreetsSchema)
      : demoOpportunityStreets(request.pc4, request.woz)
    response = { demo: !key, action: "streets", view: opportunityStreetsView(api, detailed) }
  } else if (request.action === "pc5") {
    const api = key
      ? await fetchFromApi(opportunitiesUrl("Pc5"), key, request.woz, opportunityPc5Schema, request.bbox)
      : { areaThresholds: [], areas: [] }
    response = { demo: !key, action: "pc5", view: opportunityPc5View(api, detailed) }
  } else {
    const api = key
      ? await fetchFromApi(opportunitiesUrl("Pc6"), key, request.woz, opportunityPc6Schema, request.bbox)
      : { streetThresholds: [], streets: [] }
    response = { demo: !key, action: "pc6", view: opportunityPc6View(api, detailed) }
  }
  return json(response)
})

async function fetchFromApi<T>(
  endpoint: string,
  key: string,
  woz: string,
  schema: z.ZodType<T>,
  bbox?: string,
): Promise<T> {
  const url = new URL(endpoint)
  if (woz !== "all") url.searchParams.set("woz", woz)
  if (bbox) url.searchParams.set("bbox", bbox)

  const response = await fetch(url, {
    headers: { "X-API-Key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }).catch((error) => {
    console.error("Opportunities endpoint unreachable", error)
    throw new HttpError(502, "De kansen zijn nu niet bereikbaar")
  })
  const text = await response.text()
  if (!response.ok) {
    console.error(`Opportunities endpoint answered ${response.status}: ${text.slice(0, 500)}`)
    throw new HttpError(502, "De kansen zijn nu niet bereikbaar")
  }

  let body: unknown = null
  try {
    body = JSON.parse(text)
  } catch {
    // Reported below.
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    console.error("Unexpected answer from the opportunities endpoint", parsed.error.issues)
    throw new HttpError(502, "Onverwacht antwoord van de kansen")
  }
  return parsed.data
}
