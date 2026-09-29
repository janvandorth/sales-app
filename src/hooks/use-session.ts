import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

// Invite and password-reset emails land on the app with `type=invite|recovery` in the URL hash.
// Read it before supabase-js consumes the hash and signs the user in.
const linkType = /[#&]type=(invite|recovery)/.exec(window.location.hash)?.[1] ?? null

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(linkType !== null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setNeedsPassword(true)
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return {
    session,
    loading,
    needsPassword: needsPassword && session !== null,
    isInvite: linkType === "invite",
    passwordSet: () => {
      setNeedsPassword(false)
      history.replaceState(null, "", window.location.pathname)
    },
  }
}
