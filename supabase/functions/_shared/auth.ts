import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { HttpError } from "./http.ts"

/** Returns a Supabase client acting as the calling user (RLS applies) plus that user. */
export async function requireUser(req: Request): Promise<{ supabase: SupabaseClient; user: User }> {
  const authorization = req.headers.get("Authorization")
  if (!authorization) throw new HttpError(401, "Niet ingelogd")

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.auth.getUser(authorization.replace(/^Bearer\s+/i, ""))
  if (error || !data.user) throw new HttpError(401, "Niet ingelogd")
  return { supabase, user: data.user }
}
