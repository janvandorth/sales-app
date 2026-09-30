import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { requireEnv } from "./env.ts"

/**
 * Client with the service role: bypasses row level security. Only use it for writes the caller may not do
 * directly (e.g. storing a submission) and always scope queries to the verified user yourself.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  })
}

/** Client acting as the caller: row level security applies exactly as in the app. */
export function createUserClient(authorization: string): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
}
