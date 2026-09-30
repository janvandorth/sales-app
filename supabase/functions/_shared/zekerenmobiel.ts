import type { z } from "zod"
import { requireEnv } from "./env.ts"
import { HttpError } from "./http.ts"

const BASE_URL = "https://contracts.zekerenmobiel.nl"

/**
 * GET against the Zeker en Mobiel contracts API. The response is validated against `schema`, so a change on
 * their side fails loudly here instead of leaking half-parsed data into the app.
 * Note: the API answers some "not found / invalid" cases with 4xx plus a normal body, so 4xx is not an error.
 */
export async function zmGet<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
  const url = new URL(path, BASE_URL)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const response = await fetch(url, {
    headers: { "x-api-key": requireEnv("ZM_API_KEY"), Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status >= 500 || response.status === 401 || response.status === 403) {
    throw new HttpError(502, `Externe dienst gaf status ${response.status}`)
  }

  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) {
    console.error(`Unexpected response from ${path}`, parsed.error.issues)
    throw new HttpError(502, "Onverwacht antwoord van externe dienst")
  }
  return parsed.data
}
