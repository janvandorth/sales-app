import { createContext, useContext } from "react"
import type { Profile } from "@/hooks/use-profile"
import type { View } from "./navigation"

/**
 * What the menu in every page's top bar needs: who is signed in, what waits in the outbox, and how to get to every
 * page. Provided once by the app, so every page shows the same menu without passing it along.
 */
export type AppMenuValue = {
  profile: Profile | undefined
  email: string
  /** The page open now, marked in the menu. */
  current: View
  online: boolean
  /** Sales waiting in the outbox, and whether ZMAdmin refused any of them. */
  queued: number
  refused: boolean
  open: (view: View) => void
  openOutbox: () => void
  changePassword: () => void
  signOut: () => void
}

export const AppMenuContext = createContext<AppMenuValue | null>(null)

export function useAppMenu(): AppMenuValue | null {
  return useContext(AppMenuContext)
}
