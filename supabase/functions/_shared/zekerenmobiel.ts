import { HttpError } from "./http.ts"

const BASE_URL = "https://contracts.zekerenmobiel.nl"

/** GET against the Zeker en Mobiel contracts API. Returns parsed JSON for 2xx and 4xx responses. */
export async function zmGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = Deno.env.get("ZM_API_KEY")
  if (!apiKey) throw new HttpError(500, "ZM_API_KEY ontbreekt")

  const url = new URL(path, BASE_URL)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const response = await fetch(url, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status >= 500 || response.status === 401) {
    throw new HttpError(502, `Externe dienst gaf status ${response.status}`)
  }
  return (await response.json()) as T
}
