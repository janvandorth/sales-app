import { lazy, Suspense } from "react"
import { ArrowLeftIcon, ChevronRightIcon, FootprintsIcon, NavigationIcon } from "lucide-react"
import { AppMenu } from "@/components/app-menu"
import { HEADER_BUTTON_CLASS, PAGE_WIDTH, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { getErrorMessage } from "@/lib/errors"
import { addDays, formatDay, periodStart, today } from "../dashboard/periods"
import {
  areaTitle,
  firstName,
  isoWeek,
  routeUrl,
  runsOn,
  spanLabel,
  weekday,
  walkedShare,
  type AreaAssignment,
} from "./areas"
import { useAreaAssignments } from "./use-areas"

// MapLibre is loaded with the first card that shows a map, not with the page.
const AreaThumbnail = lazy(() => import("../sales-map/area-thumbnail"))

type Props = {
  /** Whose areas: the werver's own number, also to leave them out of "met …". */
  wervernr: string | undefined
  /** Set when a manager looks at a werver's list: the page is titled with their name. */
  viewedAs?: string
  onBack: () => void
  /** Opens the map on an area. */
  onShow: (area: AreaAssignment) => void
  /** Starts walking an area door by door. */
  onWalk: (area: AreaAssignment) => void
}

/** How far back finished areas are listed, and how far ahead coming ones. */
const DAYS_BACK = 14
const DAYS_AHEAD = 42

/**
 * Where the werver goes: today's areas up top with the way there, then the rest of the week, later weeks and the
 * past two weeks. Kansen show as shades on the map, as everywhere for wervers; no numbers here.
 */
export function MyAreasPage({ wervernr, viewedAs, onBack, onShow, onWalk }: Props) {
  const now = today()
  const saturday = addDays(periodStart(now, "week"), 5)
  const areas = useAreaAssignments(addDays(now, -DAYS_BACK), addDays(now, DAYS_AHEAD))
  // A werver only gets their own; a manager gets everyone's, so keep the werver they opened.
  const all = (areas.data ?? []).filter((a) => !viewedAs || (wervernr !== undefined && a.wervernrs.includes(wervernr)))
  const todays = all.filter((a) => runsOn(a, now))
  const thisWeek = all.filter((a) => a.startsOn > now && a.startsOn <= saturday)
  const later = all.filter((a) => a.startsOn > saturday)
  const done = all.filter((a) => a.endsOn < now).reverse()
  const others = (a: AreaAssignment) => a.members.filter((m) => m.wervernr !== wervernr).map((m) => firstName(m.name))

  return (
    <div className="min-h-svh bg-muted">
      <PageHeader
        start={
          <Button variant="ghost" size="icon" className={HEADER_BUTTON_CLASS} aria-label="Terug" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        }
        title={viewedAs ? `Gebieden van ${firstName(viewedAs)}` : "Mijn gebieden"}
        end={<AppMenu />}
      />

      <div className={`mx-auto space-y-2.5 px-4 py-4 ${PAGE_WIDTH}`}>
        {areas.error && (
          <Alert variant="destructive">
            <AlertDescription>{getErrorMessage(areas.error)}</AlertDescription>
          </Alert>
        )}
        {areas.isPending && (
          <div className="flex justify-center py-8">
            <Spinner className="size-6" />
          </div>
        )}
        {areas.data && all.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">Je hebt nog geen gebieden gekregen.</p>
        )}

        {todays.length > 0 && (
          <Heading>
            Vandaag · {weekday(now)} {formatDay(now)}
          </Heading>
        )}
        {todays.map((area) => (
          <div key={area.id} className="overflow-hidden rounded-xl border bg-background">
            {area.bounds && (
              <button
                type="button"
                className="relative block h-40 w-full bg-muted"
                aria-label={`${areaTitle(area)} op de kaart`}
                onClick={() => onShow(area)}
              >
                <Suspense fallback={null}>
                  <AreaThumbnail area={area} />
                </Suspense>
                {walkedShare(area) !== null && (
                  <span className="absolute top-2.5 right-2.5 rounded-md bg-background px-2 py-1 text-xs font-semibold shadow">
                    {Math.round(walkedShare(area)! * 100)}% gelopen
                  </span>
                )}
              </button>
            )}
            <div className="space-y-2.5 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold">{areaTitle(area)}</span>
                <span className="text-sm text-muted-foreground">
                  {[
                    area.endsOn > now && `t/m ${weekday(area.endsOn)}`,
                    others(area).length && `met ${others(area).join(" en ")}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {area.note && <p className="rounded-md bg-muted px-3 py-2 text-sm">{area.note}</p>}
              <div className="flex gap-2">
                <Button className="h-11 flex-1 text-base" onClick={() => onWalk(area)}>
                  <FootprintsIcon /> Start lopen
                </Button>
                {area.bounds && (
                  <Button variant="outline" className="h-11 text-base" asChild>
                    <a href={routeUrl(area.bounds)} target="_blank" rel="noreferrer">
                      <NavigationIcon /> Route
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}

        <Section
          title="Deze week"
          areas={thisWeek}
          when={(a) => [weekday(a.startsOn), formatDay(a.startsOn, false)]}
          onShow={onShow}
        >
          {(a) => (others(a).length ? `met ${others(a).join(" en ")}` : spanLabel(a.startsOn, a.endsOn))}
        </Section>
        <Section title="Later" areas={later} when={(a) => ["wk", String(isoWeek(a.startsOn))]} onShow={onShow}>
          {(a) => spanLabel(a.startsOn, a.endsOn)}
        </Section>
        <Section title="Afgerond" areas={done} when={(a) => ["wk", String(isoWeek(a.startsOn))]} onShow={onShow} muted>
          {(a) => `${a.sold} verkocht`}
        </Section>
      </div>
    </div>
  )
}

type SectionProps = {
  title: string
  areas: AreaAssignment[]
  /** The small and the big line of the date column. */
  when: (a: AreaAssignment) => [string, string]
  children: (a: AreaAssignment) => string
  onShow: (a: AreaAssignment) => void
  muted?: boolean
}

/** A titled list of areas, each opening the map. */
function Section(props: SectionProps) {
  if (props.areas.length === 0) return null
  return (
    <>
      <Heading>{props.title}</Heading>
      <div className="divide-y rounded-xl border bg-background">
        {props.areas.map((area) => {
          const [top, big] = props.when(area)
          return (
            <button
              key={area.id}
              type="button"
              onClick={() => props.onShow(area)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left ${props.muted ? "text-muted-foreground" : ""}`}
            >
              <span className="flex w-9 flex-col items-center">
                <span className="text-xs text-muted-foreground">{top}</span>
                <span className="text-lg font-bold">{big}</span>
              </span>
              <span className="flex flex-1 flex-col">
                <span className="font-semibold">{areaTitle(area)}</span>
                <span className="text-sm text-muted-foreground">{props.children(area)}</span>
              </span>
              <ChevronRightIcon className="size-5 text-muted-foreground" />
            </button>
          )
        })}
      </div>
    </>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 pt-2 text-sm font-semibold text-muted-foreground">{children}</h2>
}
