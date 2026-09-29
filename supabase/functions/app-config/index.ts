import { requireUser } from "../_shared/auth.ts"
import { json, serve } from "../_shared/http.ts"

serve(async (req) => {
  await requireUser(req)
  // Scanning always works: without ANTHROPIC_API_KEY, extract-form returns mock data.
  return json({ scanEnabled: true, scanMock: !Deno.env.get("ANTHROPIC_API_KEY") })
})
