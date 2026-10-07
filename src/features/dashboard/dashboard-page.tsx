import { useMemo, useState } from "react"
import { ArrowLeftIcon, ChevronDownIcon, ClockIcon, RefreshCwIcon } from "lucide-react"
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { Profile } from "@/hooks/use-profile"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { CancellationList } from "./cancellation-list"
import { PeriodBar } from "./period-bar"
import { PeriodChart } from "./period-chart"
import {
  addDays,
  buildPeriods,
  formatDay,
  formatTimestamp,
  isProvisional,
  periodDates,
  periodKey,
  periodTitle,
  reasonsIn,
  SETTLE_DAYS,
  type Granularity,
} from "./periods"
import { ReasonList } from "./reason-list"
import { StatTiles } from "./stat-tiles"
import { TeamTable } from "./team-table"
import { useKpi } from "./use-kpi"

type Props = { profile: Profile | undefined; onBack: () => void }

/**
 * Results from ZMAdmin for one week or month at a time: the numbers first, then the trend, the cancellations and
 * why customers cancelled. A recruiter sees their own; the sales manager sees the team and can open any recruiter.
 */
export function DashboardPage({ profile, onBack }: Props) {
  const isAdmin = profile?.isAdmin ?? false
  // Admins: null = the whole team. Recruiters always get their own numbers (the server enforces that too).
  const [picked, setPicked] = useState<string | null>(null)
  const wervernr = isAdmin ? picked : (profile?.wervernr ?? null)
  const team = useKpi(null, isAdmin)
  const kpi = useKpi(wervernr, profile !== undefined)
  const [granularity, setGranularity] = useState<Granularity>("week")
  const [selectedKey, setSelectedKey] = useState<string>()

  const data = kpi.data
  const periods = useMemo(
    () => (data ? buildPeriods(data.stats.days, granularity, data.from, data.to) : []),
    [data, granularity],
  )
  const selected = periods.find((p) => p.key === selectedKey) ?? periods.at(-1)
  const selectedIndex = selected ? periods.indexOf(selected) : -1
  const enteredUntil = data?.stats.cancellationsEnteredUntil ?? null
  const provisional = selected ? isProvisional(selected, enteredUntil) : false
  const recruiters = team.data?.stats.recruiters ?? data?.stats.recruiters ?? []
  // "week 41" or "juni 2025" in card titles; the bar at the top has the dates.
  const periodName = selected ? periodTitle(selected, granularity) : ""

  // A recruiter's reasons come from their own cancellations, which carry the sale day. The team only has the totals
  // per reason; per period once the endpoint sends their sale day (see SalesStats.reasons).
  const reasonsPerPeriod = wervernr !== null || (data?.stats.reasons.every((r) => r.date) ?? true)
  const reasons =
    !data || !selected
      ? []
      : wervernr !== null
        ? reasonsIn(
            data.stats.cancellations.map((c) => ({ date: c.soldOn, reason: c.reason, count: 1 })),
            selected,
          )
        : reasonsIn(data.stats.reasons, reasonsPerPeriod ? selected : null)

  function changeGranularity(next: Granularity) {
    // Stay on the same moment: the week or month that contains the selected period's first day.
    if (selected) setSelectedKey(periodKey(selected.start, next))
    setGranularity(next)
  }

  async function previous() {
    if (!selected) return
    if (selectedIndex > 0) return setSelectedKey(periods[selectedIndex - 1].key)
    // The oldest loaded period: load the year before, then step into it.
    await kpi.fetchNextPage()
    setSelectedKey(periodKey(addDays(selected.start, -1), granularity))
  }

  return (
    <div className="min-h-svh bg-muted">
      <PageHeader
        start={
          <Button
            variant="ghost"
            size="icon"
            className={HEADER_BUTTON_CLASS}
            aria-label="Terug naar formulier"
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </Button>
        }
        title={
          isAdmin ? (
            // Whose numbers: the page's subject, so it is the title. Native select for the phone's own picker.
            <span className="relative flex max-w-full min-w-0 items-center">
              <select
                aria-label="Wiens cijfers"
                className="max-w-[60vw] min-w-0 appearance-none truncate rounded-md bg-white/15 py-1.5 pr-8 pl-3 text-lg font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                value={picked ?? ""}
                onChange={(event) => setPicked(event.target.value || null)}
              >
                <option className="text-foreground" value="">
                  Hele team
                </option>
                {recruiters.map((r) => (
                  <option className="text-foreground" key={r.number} value={r.number}>
                    {r.name} ({r.number})
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-2 size-5" />
            </span>
          ) : (
            "Mijn resultaten"
          )
        }
        end={
          <Button
            variant="ghost"
            size="icon"
            className={HEADER_BUTTON_CLASS}
            aria-label="Vernieuwen"
            onClick={() => void kpi.refetch()}
          >
            <RefreshCwIcon className={kpi.isFetching ? "animate-spin" : undefined} />
          </Button>
        }
      />

      {selected && (
        <PeriodBar
          granularity={granularity}
          onGranularity={changeGranularity}
          title={periodName.charAt(0).toUpperCase() + periodName.slice(1)}
          subtitle={periodDates(selected, granularity)}
          canPrevious={selectedIndex > 0 || kpi.hasNextPage}
          canNext={selectedIndex < periods.length - 1}
          loadingPrevious={kpi.isFetchingNextPage}
          onPrevious={() => void previous()}
          onNext={() => setSelectedKey(periods[selectedIndex + 1].key)}
          onLatest={() => setSelectedKey(undefined)}
        />
      )}

      <main
        className={cn(
          "mx-auto flex max-w-xl flex-col gap-4 p-4 transition-opacity",
          kpi.isPlaceholderData && "pointer-events-none opacity-50",
        )}
        aria-busy={kpi.isPlaceholderData}
      >
        {kpi.error && !data && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-2">
              {getErrorMessage(kpi.error, "De cijfers konden niet worden geladen")}
              <Button size="sm" variant="outline" onClick={() => void kpi.refetch()}>
                Opnieuw
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!data && !kpi.error && (
          <div className="flex justify-center p-12">
            <Spinner className="size-6" />
          </div>
        )}

        {data && selected && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span className="first-letter:uppercase">{periodName}</span>
                  {provisional && (
                    <Badge variant="secondary">
                      <ClockIcon /> voorlopig
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <StatTiles period={selected} />
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <ClockIcon className="size-4 shrink-0" />
                  <p>
                    Opzeggingen bijgewerkt t/m{" "}
                    <strong className="font-semibold text-foreground">
                      {enteredUntil ? formatTimestamp(enteredUntil) : "onbekend"}
                    </strong>
                    .
                    {provisional &&
                      ` Opzeggingen komen vaak pas weken na de verkoop binnen; deze cijfers zijn compleet als dat tot ${SETTLE_DAYS / 7} weken na deze periode is bijgewerkt.`}
                  </p>
                </div>
                {data.demo && (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Voorbeeldcijfers: de koppeling met ZMAdmin staat nog niet aan. Namen en aantallen zijn verzonnen.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Verloop per {granularity === "week" ? "week" : "maand"}</CardTitle>
                <CardDescription>
                  Tik op een {granularity === "week" ? "week" : "maand"} om die te bekijken.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <PeriodChart
                  periods={periods}
                  granularity={granularity}
                  selectedKey={selected.key}
                  onSelect={setSelectedKey}
                  isProvisional={(period) => isProvisional(period, enteredUntil)}
                  canLoadMore={kpi.hasNextPage}
                  loadingMore={kpi.isFetchingNextPage}
                  onLoadMore={() => void kpi.fetchNextPage()}
                />
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2.5 rounded-[3px] bg-netto" /> Netto
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2.5 rounded-[3px] bg-opgezegd" /> Opgezegd
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-[3px] bg-[repeating-linear-gradient(135deg,transparent_0_2px,var(--color-muted-foreground)_2px_3px)]"
                    />
                    Nog niet compleet
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {wervernr === null ? "Per werver" : "Opzeggingen"} · {periodName}
                </CardTitle>
                <CardDescription>
                  {wervernr === null
                    ? "Tik op een werver voor diens opzeggingen."
                    : "Opgezegde klanten uit de verkopen van deze periode."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {wervernr === null ? (
                  <TeamTable
                    stats={data.stats}
                    period={selected}
                    onPick={(number) => {
                      setPicked(number)
                      window.scrollTo({ top: 0 })
                    }}
                  />
                ) : (
                  <CancellationList
                    items={data.stats.cancellations.filter(
                      (c) => c.soldOn >= selected.start && c.soldOn <= selected.end,
                    )}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Redenen van opzeggingen · {reasonsPerPeriod ? periodName : "alles geladen"}</CardTitle>
                {!reasonsPerPeriod && (
                  <CardDescription>
                    Verkopen sinds {formatDay(data.from)} {data.from.slice(0, 4)}; per{" "}
                    {granularity === "week" ? "week" : "maand"} volgt nog.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <ReasonList reasons={reasons} />
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
