import { ChartColumnIcon, CameraIcon, CloudOffIcon, LogOutIcon, RefreshCwIcon, UserIcon, UsersIcon } from "lucide-react"
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header"
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
import { cn } from "@/lib/utils"
import type { OutboxItem } from "../outbox/outbox-store"

type Props = {
  profile: Profile | undefined
  email: string
  online: boolean
  scanDisabled: boolean
  onScan: () => void
  outbox: OutboxItem[]
  syncing: boolean
  onOpenOutbox: () => void
  onOpenDashboard: () => void
  onOpenAdmin: () => void
  onSignOut: () => void
}

/** Menu items sized for a thumb on the street: at least 48px high. */
const MENU_ITEM_CLASS = "min-h-12 gap-3 px-3 text-base [&_svg:not([class*='size-'])]:size-5"

/** Header of the form page: camera scan, logo, offline/outbox status and the account menu. */
export function FormHeader(props: Props) {
  const { profile, email, online, scanDisabled, onScan, outbox, syncing } = props
  const { onOpenOutbox, onOpenDashboard, onOpenAdmin, onSignOut } = props

  return (
    <PageHeader
      start={
        <Button
          variant="ghost"
          size="icon"
          className={HEADER_BUTTON_CLASS}
          aria-label="Formulier scannen met camera"
          title={online ? "Formulier scannen" : "Scannen werkt alleen online"}
          disabled={scanDisabled}
          onClick={onScan}
        >
          <CameraIcon />
        </Button>
      }
      title={
        // Same treatment as the footer on zekerenmobiel.nl: the color logo rendered white.
        <img src="/logo.png" alt="Zeker & Mobiel — Z&M Sales" className="h-6 w-auto brightness-0 invert" />
      }
      end={
        <>
          {!online && (
            <Badge variant="secondary" className="gap-1">
              <CloudOffIcon /> Offline
            </Badge>
          )}
          {outbox.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className={HEADER_BUTTON_CLASS}
              onClick={onOpenOutbox}
              aria-label="Wachtrij bekijken"
            >
              <RefreshCwIcon className={cn(syncing && "animate-spin")} />
              {outbox.length}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={HEADER_BUTTON_CLASS} aria-label="Account">
                <UserIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-1.5">
              <DropdownMenuLabel className="flex flex-col px-3 py-2 text-base">
                <span>{profile?.wervernaam ?? email}</span>
                {profile && (
                  <span className="text-sm font-normal text-muted-foreground">Wervernr. {profile.wervernr}</span>
                )}
              </DropdownMenuLabel>
              {outbox.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={onOpenOutbox}>
                    <RefreshCwIcon /> Wachtrij ({outbox.length})
                    {outbox.some((item) => item.rejectedReason) && (
                      <span className="ml-auto text-xs text-destructive">geweigerd</span>
                    )}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={onOpenDashboard}>
                <ChartColumnIcon /> {profile?.isAdmin ? "Resultaten team" : "Mijn resultaten"}
              </DropdownMenuItem>
              {profile?.isAdmin && (
                <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={onOpenAdmin}>
                  <UsersIcon /> Beheer wervers
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={onSignOut}>
                <LogOutIcon /> Uitloggen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  )
}
