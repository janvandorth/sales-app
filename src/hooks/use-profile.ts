import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export type Profile = { wervernaam: string; wervernr: string; isAdmin: boolean }

const cacheKey = (userId: string) => `profile:${userId}`

function readCache(userId: string): Profile | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

/** The recruiter profile, cached in localStorage so it is available offline. */
export function useProfile(userId: string) {
  const [profile, setProfile] = useState<Profile | null>(() => readCache(userId))

  useEffect(() => {
    supabase
      .from("profiles")
      .select("wervernaam, wervernr, is_admin")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        const next = { wervernaam: data.wervernaam, wervernr: data.wervernr, isAdmin: data.is_admin }
        setProfile(next)
        try {
          localStorage.setItem(cacheKey(userId), JSON.stringify(next))
        } catch {
          // Storage unavailable (private mode); the in-memory value is enough.
        }
      })
  }, [userId])

  return profile
}
