import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon } from "lucide-react"
import { AppMenu } from "@/components/app-menu"
import { HEADER_BUTTON_CLASS, PAGE_WIDTH, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { Profile } from "@/hooks/use-profile"
import type { SubmittedSale } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { addDays, today } from "../dashboard/periods"
import { loadOutbox } from "../outbox/outbox-store"
import { dayTitle, MAX_DAYS_BACK, shortDate } from "./days"
import { SaleItem } from "./sale-item"
import { useSalesDay } from "./use-sales-day"

type Props = { profile: Profile | undefined; userId: string | undefined; onBack: () => void }

/**
 * What was sent in, one day at a time (by the moment it was received), back to a month ago: a sanity check for the
 * recruiter. The sales manager sees everyone's, grouped per recruiter.
 */
export function SalesListPage({ profile, userId, onBack }: Props) {
  const isAdmin = profile?.isAdmin ?? false
  const now = today()
  const [date, setDate] = useState(now)
  const sales = useSalesDay(date)
  // Same cache entry as useOutbox on the form page; IndexedDB is local, so it also works offline.
  const { data: queued = [] } = useQuery({
    queryKey: ["outbox", userId],
    queryFn: () => loadOutbox(userId!),
    enabled: userId !== undefined && date === now,
    networkMode: "always",
  })
  const oldest = addDays(now, -MAX_DAYS_BACK)

  const groups = useMemo(() => groupByRecruiter(sales.data?.sales ?? []), [sales.data])
  const total = sales.data?.total ?? 0
  const loaded = sales.data?.sales.length ?? 0

  return (
    <div className="min-h-svh bg-muted">
      <PageHeader
        start={
          <Button variant="ghost" size="icon" className={HEADER_BUTTON_CLASS} aria-label="Terug" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        }
        title={isAdmin ? "Verkopen team" : "Mijn verkopen"}
        end={<AppMenu />}
      />

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b bg-background/95 backdrop-blur">
        <div className={`mx-auto flex items-center gap-2 px-4 py-2 ${PAGE_WIDTH}`}>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label="Vorige dag"
            disabled={date <= oldest}
            onClick={() => setDate(addDays(date, -1))}
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col items-center leading-tight" aria-live="polite">
            <span className="truncate text-sm font-semibold">{dayTitle(date, now)}</span>
            <span className="truncate text-xs text-muted-foreground">{shortDate(date)}</span>
          </div>
          {date !== now && (
            <button
              type="button"
              className="mx-1 shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
              aria-label="Naar vandaag"
              onClick={() => setDate(now)}
            >
              Vandaag
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label="Volgende dag"
            disabled={date >= now}
            onClick={() => setDate(addDays(date, 1))}
          >
            <ChevronRightIcon className="size-5" />
          </Button>
          {/* By hand, for ZMAdmin's answer on a sale just sent; the list also refreshes when the app comes back. */}
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 border-l text-muted-foreground"
            aria-label="Vernieuwen"
            onClick={() => void sales.refetch()}
          >
            <RefreshCwIcon className={cn("size-5", sales.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <main
        className={cn(
          "mx-auto flex flex-col gap-4 p-4 transition-opacity",
          PAGE_WIDTH,
          sales.isPlaceholderData && "pointer-events-none opacity-50",
        )}
        aria-busy={sales.isPlaceholderData}
      >
        {sales.error && !sales.data && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-2">
              {getErrorMessage(sales.error, "De verkopen konden niet worden geladen")}
              <Button size="sm" variant="outline" onClick={() => void sales.refetch()}>
                Opnieuw
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!sales.data && !sales.error && (
          <div className="flex justify-center p-12">
            <Spinner className="size-6" />
          </div>
        )}

        {queued.length > 0 && date === now && (
          <Card>
            <CardHeader>
              <CardTitle>Nog niet verstuurd · {queued.length}</CardTitle>
              <CardDescription>Deze staan in de wachtrij en worden verstuurd zodra je online bent.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="-my-3 divide-y">
                {queued.map((item) => (
                  <SaleItem key={item.values.rowId} sale={item.values} day={date} status="queued" />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {sales.data && (
          <>
            <p className="px-1 text-sm text-muted-foreground">
              {total === 0
                ? `Geen verkopen ontvangen op ${shortDate(date)}.`
                : `${total} ${total === 1 ? "verkoop" : "verkopen"} ontvangen${
                    isAdmin && groups.length > 1 ? ` van ${groups.length} wervers` : ""
                  }.`}
            </p>
            {/* Large screens: the recruiters side by side. */}
            <div className={cn("grid gap-4", groups.length > 1 && "lg:grid-cols-2 lg:items-start")}>
              {groups.map((group) => (
                <Card key={group.wervernr} className="min-w-0">
                  {isAdmin && (
                    <CardHeader>
                      <CardTitle>
                        {group.wervernaam} · {group.sales.length}
                      </CardTitle>
                      <CardDescription>Wervernr. {group.wervernr}</CardDescription>
                    </CardHeader>
                  )}
                  <CardContent>
                    <ul className="-my-3 divide-y">
                      {group.sales.map((sale) => (
                        <SaleItem
                          key={sale.rowId}
                          sale={sale}
                          day={date}
                          received={sale.received}
                          status={sale.onboardingStatus}
                        />
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
            {sales.hasNextPage && (
              <Button
                variant="outline"
                className="h-12 self-center px-6"
                disabled={sales.isFetchingNextPage}
                onClick={() => void sales.fetchNextPage()}
              >
                {sales.isFetchingNextPage && <Spinner />}
                Meer laden ({loaded} van {total})
              </Button>
            )}
          </>
        )}
      </main>
    </div>
  )
}

type Group = { wervernr: string; wervernaam: string; sales: SubmittedSale[] }

/** Per recruiter, alphabetically; within a recruiter in the order they came in. */
function groupByRecruiter(sales: SubmittedSale[]): Group[] {
  const groups = new Map<string, Group>()
  for (const sale of sales) {
    const group = groups.get(sale.wervernr) ?? { wervernr: sale.wervernr, wervernaam: sale.wervernaam, sales: [] }
    group.sales.push(sale)
    groups.set(sale.wervernr, group)
  }
  return [...groups.values()].sort((a, b) => a.wervernaam.localeCompare(b.wervernaam, "nl"))
}
