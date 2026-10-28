import { optionalEnv } from "./env.ts"

/**
 * Origins allowed to call the functions from a browser, comma separated, "*" as wildcard within a host
 * (e.g. "https://sales-app-wine-ten.vercel.app,http://localhost:*"). Unset allows every origin. The test
 * deployment's TEST_ORIGINS are allowed too. Authentication is enforced separately; this only stops other websites
 * from calling the API in a browser.
 */
const allowedOrigins = [
  ...originPatterns(optionalEnv("ALLOWED_ORIGINS") ?? "*"),
  ...originPatterns(optionalEnv("TEST_ORIGINS") ?? ""),
]

/** Comma separated origins, "*" as wildcard within a host, as regular expressions. */
export function originPatterns(list: string): RegExp[] {
  return list
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`))
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? ""
  const allowed = allowedOrigins.some((pattern) => pattern.test(origin))
  return {
    "Access-Control-Allow-Origin": allowed ? origin || "*" : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-test-deployment",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** A JSON response; CORS headers are added by `serve`. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/**
 * Wraps an edge function handler: answers CORS preflights, adds CORS headers and turns thrown errors into
 * JSON responses (HttpError keeps its status and message; anything else becomes a generic 500).
 */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    const cors = corsHeaders(req)
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

    let response: Response
    try {
      response = await handler(req)
    } catch (error) {
      if (error instanceof HttpError) {
        response = json({ error: error.message }, error.status)
      } else {
        console.error(error)
        response = json({ error: "Interne fout" }, 500)
      }
    }
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value)
    // Not compressed here: Supabase's gateway already gzips every answer for callers that accept it.
    return response
  })
}
