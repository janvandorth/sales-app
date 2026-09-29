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

type Props = {
  profile: Profile | null
  email: string
  online: boolean
  scanEnabled: boolean
  scanDisabledReason: string | null
  onScan: () => void
  outbox: QueuedSubmission[]
  syncing: boolean
  onSync: () => void
  onSignOut: () => void
  onOpenAdmin: () => void
}

export function AppHeader(props: Props) {
  const { profile, email, online, scanEnabled, scanDisabledReason, onScan, outbox, syncing, onSync, onSignOut, onOpenAdmin } =
    props

  return (
    <header className="sticky top-0 z-40 border-b bg-primary text-primary-foreground pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Formulier scannen met camera"
          title={scanDisabledReason ?? "Formulier scannen"}
          disabled={!scanEnabled}
          onClick={onScan}
        >
          <CameraIcon />
        </Button>

        <h1 className="flex-1 text-center text-lg font-semibold">Bellijst</h1>

        {!online && (
          <Badge variant="secondary" className="gap-1">
            <CloudOffIcon /> Offline
          </Badge>
        )}
        {outbox.length > 0 && (
          <Button variant="secondary" size="sm" onClick={onSync} disabled={!online || syncing} aria-label="Wachtrij versturen">
            <RefreshCwIcon className={cn(syncing && "animate-spin")} />
            {outbox.length}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="Account">
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
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {outbox.length} formulier(en) in wachtrij
                  {outbox.some((item) => item.lastError) && " — sommige zijn geweigerd door de server"}
                </DropdownMenuLabel>
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
