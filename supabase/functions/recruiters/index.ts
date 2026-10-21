import { requireUser } from "../_shared/auth.ts"
import { recruitersUrl } from "../_shared/contracts-api.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { isOnboardingConfigured, onboardingKey } from "../_shared/onboarding.ts"
import { recruitersResponseSchema, toZmRecruiters, type ZmRecruiter } from "../_shared/recruiters.ts"
import { isTestRequest } from "../_shared/test-request.ts"

// ZMAdmin's active recruiters, from the Contracts API (GET .../Recruiters), for the werver picker on the sales form.
// Admins only: they may book a sale on another recruiter, everyone else always sells as themselves.
// The list comes from the environment where the sale will be onboarded, so the picked code exists there.

serve(async (req) => {
  const { supabase, user } = await requireUser(req)
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
  if (!profile?.is_admin) throw new HttpError(403, "Geen beheerrechten")

  if (!isOnboardingConfigured()) throw new HttpError(503, "De wervers zijn nu niet beschikbaar")
  const test = isTestRequest(req)
  return json({ recruiters: await fetchRecruiters(recruitersUrl(test), onboardingKey(test)) })
})

async function fetchRecruiters(url: string, key: string): Promise<ZmRecruiter[]> {
  const response = await fetch(url, {
    headers: { "X-API-Key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    console.error("Recruiters endpoint unreachable", error)
    throw new HttpError(502, "De wervers zijn nu niet bereikbaar")
  })
  const text = await response.text()
  if (!response.ok) {
    console.error(`Recruiters endpoint answered ${response.status}: ${text.slice(0, 500)}`)
    throw new HttpError(502, "De wervers zijn nu niet bereikbaar")
  }

  let body: unknown = null
  try {
    body = JSON.parse(text)
  } catch {
    // Reported below.
  }
  const parsed = recruitersResponseSchema.safeParse(body)
  if (!parsed.success) {
    console.error("Unexpected answer from the recruiters endpoint", parsed.error.issues)
    throw new HttpError(502, "Onverwacht antwoord van de wervers")
  }
  return toZmRecruiters(parsed.data)
}
