import { optionalEnv } from "./env.ts"

/**
 * Origins allowed to call the functions from a browser, comma separated, "*" as wildcard within a host
 * (e.g. "https://sales-app-wine-ten.vercel.app,http://localhost:*"). Unset allows every origin.
 * Authentication is enforced separately; this only stops other websites from calling the API in a browser.
 */
const allowedOrigins = (optionalEnv("ALLOWED_ORIGINS") ?? "*")
  .split(",")
  .map((pattern) => pattern.trim())
  .filter(Boolean)
  .map((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`))

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? ""
  const allowed = allowedOrigins.some((pattern) => pattern.test(origin))
  return {
    "Access-Control-Allow-Origin": allowed ? origin || "*" : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    return response
  })
}
