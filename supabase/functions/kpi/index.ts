import { requireUser } from "../_shared/auth.ts"
import { optionalEnv } from "../_shared/env.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { kpiRequestSchema, salesStatsSchema, type KpiResponse, type SalesStats } from "../_shared/kpi.ts"
import { demoSalesStats } from "../_shared/kpi-demo.ts"

// Sales and cancellations for the dashboard, from ZMAdmin via the Contracts API (GET .../Sales/2026.1/Stats).
// That endpoint returns anything for anyone with the API key, so who may see what is decided here: a recruiter
// always gets their own wervernr, only an admin may choose another recruiter or the whole team.
// Without STATS_API_URL and STATS_API_KEY the numbers are made up (demo mode).

serve(async (req) => {
  const { supabase, user } = await requireUser(req)
  const parsed = kpiRequestSchema.safeParse(await req.json())
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Ongeldig verzoek")
  const { from, to } = parsed.data
  if (from > to) throw new HttpError(400, "Ongeldige periode")

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("wervernr, is_admin")
    .eq("id", user.id)
    .single()
  if (error || !profile) throw new HttpError(403, "Geen profiel gevonden")

  const wervernr = profile.is_admin ? parsed.data.wervernr || null : profile.wervernr

  const url = optionalEnv("STATS_API_URL")
  const key = optionalEnv("STATS_API_KEY")
  const response: KpiResponse =
    url && key
      ? { demo: false, wervernr, stats: await fetchStats(url, key, from, to, wervernr) }
      : { demo: true, wervernr, stats: demoSalesStats(from, to, wervernr) }
  return json(response)
})

async function fetchStats(
  endpoint: string,
  key: string,
  from: string,
  to: string,
  recruiter: string | null,
): Promise<SalesStats> {
  const url = new URL(endpoint)
  url.searchParams.set("from", from)
  url.searchParams.set("to", to)
  if (recruiter) url.searchParams.set("recruiter", recruiter)

  const response = await fetch(url, {
    headers: { "X-API-Key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }).catch((error) => {
    console.error("Stats endpoint unreachable", error)
    throw new HttpError(502, "De cijfers zijn nu niet bereikbaar")
  })
  const text = await response.text()
  if (!response.ok) {
    console.error(`Stats endpoint answered ${response.status}: ${text.slice(0, 500)}`)
    throw new HttpError(502, "De cijfers zijn nu niet bereikbaar")
  }

  let body: unknown = null
  try {
    body = JSON.parse(text)
  } catch {
    // Reported below.
  }
  const parsed = salesStatsSchema.safeParse(body)
  if (!parsed.success) {
    console.error("Unexpected answer from the stats endpoint", parsed.error.issues)
    throw new HttpError(502, "Onverwacht antwoord van de cijfers")
  }
  return parsed.data
}
