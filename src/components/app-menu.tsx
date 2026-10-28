import {
  CalendarDaysIcon,
  ChartColumnIcon,
  ClipboardListIcon,
  CloudOffIcon,
  FilePenLineIcon,
  KeyRoundIcon,
  LogOutIcon,
  MapIcon,
  MapPinnedIcon,
  MenuIcon,
  RefreshCwIcon,
  UsersIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { HEADER_BUTTON_CLASS } from "@/components/page-header"
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
import { useAppMenu } from "@/lib/app-menu"
import { SHOW_AREAS, SHOW_RESULTS } from "@/lib/deployment"
import type { View } from "@/lib/navigation"
import { cn } from "@/lib/utils"

/** Menu items sized for a thumb on the street: at least 48px high. */
const MENU_ITEM_CLASS = "min-h-12 gap-3 px-3 text-base [&_svg:not([class*='size-'])]:size-5"

/**
 * The right side of every page's top bar: being offline, and the one menu that leads to every page. Sales waiting
 * in the outbox show as a number on the menu button and as the menu's first item.
 */
export function AppMenu() {
  const menu = useAppMenu()
  if (!menu) return null
  const { profile, email, current, online, queued, refused } = menu
  const admin = profile?.isAdmin ?? false

  const page = (view: View, icon: ReactNode, label: string) => (
    <DropdownMenuItem
      className={cn(MENU_ITEM_CLASS, view === current && "bg-accent font-semibold")}
      aria-current={view === current ? "page" : undefined}
      onClick={() => view !== current && menu.open(view)}
    >
      {icon} {label}
    </DropdownMenuItem>
  )

  return (
    <>
      {!online && (
        <Badge variant="secondary" className="gap-1">
          <CloudOffIcon /> Offline
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(HEADER_BUTTON_CLASS, "relative")}
            aria-label={queued > 0 ? `Menu, ${queued} in de wachtrij` : "Menu"}
          >
            <MenuIcon />
            {queued > 0 && (
              <span
                className={cn(
                  "absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
                  refused ? "bg-destructive text-white" : "bg-amber-400 text-black",
                )}
              >
                {queued}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-1.5">
          <DropdownMenuLabel className="flex flex-col px-3 py-2 text-base">
            <span>{profile?.wervernaam ?? email}</span>
            {profile && <span className="text-sm font-normal text-muted-foreground">Wervernr. {profile.wervernr}</span>}
          </DropdownMenuLabel>
          {queued > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={menu.openOutbox}>
                <RefreshCwIcon /> Wachtrij ({queued})
                {refused && <span className="ml-auto text-xs text-destructive">geweigerd</span>}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          {page("form", <FilePenLineIcon />, "Formulier")}
          {page("sales", <ClipboardListIcon />, admin ? "Verkopen team" : "Mijn verkopen")}
          {SHOW_RESULTS && page("dashboard", <ChartColumnIcon />, admin ? "Resultaten team" : "Mijn resultaten")}
          {SHOW_RESULTS && page("map", <MapIcon />, "Verkoopkaart")}
          {SHOW_AREAS &&
            (admin
              ? page("planning", <CalendarDaysIcon />, "Planning")
              : page("areas", <MapPinnedIcon />, "Mijn gebieden"))}
          {admin && page("admin", <UsersIcon />, "Beheer wervers")}
          <DropdownMenuSeparator />
          <DropdownMenuItem className={MENU_ITEM_CLASS} disabled={!online} onClick={menu.changePassword}>
            <KeyRoundIcon /> Wachtwoord wijzigen
          </DropdownMenuItem>
          <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={menu.signOut}>
            <LogOutIcon /> Uitloggen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
