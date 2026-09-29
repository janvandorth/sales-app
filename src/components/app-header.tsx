import { CameraIcon, CloudOffIcon, LogOutIcon, RefreshCwIcon, UserIcon, UsersIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Profile } from "@/hooks/use-profile"
import type { QueuedSubmission } from "@/lib/offline-store"
import { cn } from "@/lib/utils"

/** Buttons on the navy header: translucent white so they read as clickable on a dark background. */
export const HEADER_BUTTON = "bg-white/15 text-white hover:bg-white/25 hover:text-white"

type Props = {
  profile: Profile | null
  email: string
  online: boolean
  scanEnabled: boolean
  scanDisabledReason: string | null
  onScan: () => void
  outbox: QueuedSubmission[]
  syncing: boolean
  onOpenOutbox: () => void
  onSignOut: () => void
  onOpenAdmin: () => void
}

export function AppHeader(props: Props) {
  const { profile, email, online, scanEnabled, scanDisabledReason, onScan, outbox, syncing, onOpenOutbox, onSignOut, onOpenAdmin } =
    props

  return (
    <header className="sticky top-0 z-40 border-b bg-primary text-primary-foreground pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
        <Button
          variant="ghost"
          className={HEADER_BUTTON}
          size="icon"
          aria-label="Formulier scannen met camera"
          title={scanDisabledReason ?? "Formulier scannen"}
          disabled={!scanEnabled}
          onClick={onScan}
        >
          <CameraIcon />
        </Button>

        <h1 className="flex flex-1 justify-center">
          {/* Same treatment as the footer on zekerenmobiel.nl: the color logo rendered white. */}
          <img src="/logo.png" alt="Zeker & Mobiel — Bellijst" className="h-6 w-auto brightness-0 invert" />
        </h1>

        {!online && (
          <Badge variant="secondary" className="gap-1">
            <CloudOffIcon /> Offline
          </Badge>
        )}
        {outbox.length > 0 && (
          <Button variant="ghost" className={HEADER_BUTTON} size="sm" onClick={onOpenOutbox} aria-label="Wachtrij bekijken">
            <RefreshCwIcon className={cn(syncing && "animate-spin")} />
            {outbox.length}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className={HEADER_BUTTON} size="icon" aria-label="Account">
              <UserIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span>{profile?.wervernaam ?? email}</span>
              {profile && <span className="text-xs font-normal text-muted-foreground">Wervernr. {profile.wervernr}</span>}
            </DropdownMenuLabel>
            {outbox.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenOutbox}>
                  <RefreshCwIcon /> Wachtrij ({outbox.length})
                  {outbox.some((item) => item.lastError) && <span className="ml-auto text-xs text-destructive">geweigerd</span>}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            {profile?.isAdmin && (
              <DropdownMenuItem onClick={onOpenAdmin}>
                <UsersIcon /> Beheer wervers
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onSignOut}>
              <LogOutIcon /> Uitloggen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
