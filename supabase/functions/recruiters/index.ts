import { requireUser } from "../_shared/auth.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import type { Recruiter } from "../_shared/submission-record.ts"
import { createAdminClient } from "../_shared/supabase.ts"

// The wervers for the werver picker on the sales form: every profile in the app that is not an admin.
// Admins only: they may book a sale on another recruiter, everyone else always sells as themselves. Row level
// security lets a user read only their own profile, so the list is read with the service role.

serve(async (req) => {
  const { supabase, user } = await requireUser(req)
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
  if (!profile?.is_admin) throw new HttpError(403, "Geen beheerrechten")

  const { data: recruiters, error } = await createAdminClient()
    .from("profiles")
    .select("wervernaam, wervernr")
    .eq("is_admin", false)
    .order("wervernaam")
  if (error) throw error
  return json({ recruiters: recruiters satisfies Recruiter[] })
})
