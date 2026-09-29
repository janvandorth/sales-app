import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export type Profile = { wervernaam: string; wervernr: string }

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
      .select("wervernaam, wervernr")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setProfile(data)
        try {
          localStorage.setItem(cacheKey(userId), JSON.stringify(data))
        } catch {
          // Storage unavailable (private mode); the in-memory value is enough.
        }
      })
  }, [userId])

  return profile
}
