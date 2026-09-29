import { requireUser } from "../_shared/auth.ts"
import { json, serve } from "../_shared/http.ts"

serve(async (req) => {
  await requireUser(req)
  return json({ scanEnabled: Boolean(Deno.env.get("ANTHROPIC_API_KEY")) })
})
