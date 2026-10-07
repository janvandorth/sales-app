import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

export type Profile = { wervernaam: string; wervernr: string; isAdmin: boolean }

const cacheKey = (userId: string) => `profile:${userId}`

function readCachedProfile(userId: string): Profile | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    return raw ? (JSON.parse(raw) as Profile) : undefined
  } catch {
    return undefined // Storage unavailable (private mode) or corrupt; the network result will follow.
  }
}

async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("wervernaam, wervernr, is_admin")
    .eq("id", userId)
    .single()
  if (error) throw error
  const profile = { wervernaam: data.wervernaam, wervernr: data.wervernr, isAdmin: data.is_admin }
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(profile))
  } catch {
    // Storage unavailable; the in-memory query cache is enough.
  }
  return profile
}

/**
 * The recruiter's own profile (undefined while logged out). The last known value is kept in localStorage so it is
 * available offline.
 */
export function useProfile(userId: string | undefined): Profile | undefined {
  const { data } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    placeholderData: () => (userId ? readCachedProfile(userId) : undefined),
    enabled: userId !== undefined,
  })
  return data
}
