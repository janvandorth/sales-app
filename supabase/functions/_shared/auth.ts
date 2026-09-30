import type { SupabaseClient, User } from "@supabase/supabase-js"
import { HttpError } from "./http.ts"
import { createUserClient } from "./supabase.ts"

/**
 * Verifies the caller's access token. The returned user is the only trustworthy source of "who is calling":
 * never take user ids, names or recruiter numbers from the request body.
 */
export async function requireUser(req: Request): Promise<{ supabase: SupabaseClient; user: User }> {
  const authorization = req.headers.get("Authorization")
  if (!authorization) throw new HttpError(401, "Niet ingelogd")

  const supabase = createUserClient(authorization)
  const { data, error } = await supabase.auth.getUser(authorization.replace(/^Bearer\s+/i, ""))
  if (error || !data.user) throw new HttpError(401, "Niet ingelogd")
  return { supabase, user: data.user }
}
