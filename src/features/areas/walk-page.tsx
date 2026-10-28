import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  FileTextIcon,
  LocateFixedIcon,
  MapIcon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { AppMenu } from "@/components/app-menu"
import { HEADER_BUTTON_CLASS, PAGE_WIDTH, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { areaPostcodes, deleteDoorVisit, listDoorVisits, recordDoorVisit, streetDoors } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { today } from "../dashboard/periods"
import { localDate } from "../sales-list/days"
import { centreOf, type AreaAssignment } from "./areas"
import {
  byDistance,
  distance,
  doorKey,
  doorLabel,
  firstOpen,
  latestVisits,
  nearestDoor,
  OUTCOME_LABELS,
  sides,
  streetsOf,
  type Door,
  type DoorVisit,
  type Outcome,
} from "./doors"

type Props = {
  area: AreaAssignment
  /** The werver walking; their doors are logged under this number. */
  wervernr: string | undefined
  onBack: () => void
  /** "Verkocht": opens the sales form with this address filled in. */
  onSold: (door: Door) => void
  /** Opens the map on the area. */
  onShowMap: () => void
}

type Side = "even" | "odd"

/** Further than this from every postcode of the area, the werver is told they are outside it. */
const OUTSIDE_METRES = 400

/** How each outcome looks in the strip of doors. */
const OUTCOME_STYLES: Record<Outcome | "open", string> = {
  open: "border bg-background",
  not_home: "bg-muted text-foreground",
  no_interest: "bg-slate-500 text-white",
  later: "bg-orange-300 text-orange-950",
  sold: "bg-blue-700 text-white",
  skip: "border border-dashed text-muted-foreground line-through",
}

/**
 * Door by door through an area: the street comes from where the phone is (or is picked), its house numbers from
 * the BAG, one side at a time in walking order. One tap per door logs how it went and moves on to the next.
 */
export function WalkPage({ area, wervernr, onBack, onSold, onShowMap }: Props) {
  const position = usePosition()
  const places = useQuery({
    queryKey: ["area-postcodes", area.postcodes],
    queryFn: () => areaPostcodes(area.postcodes),
    staleTime: Infinity,
  })
  const streets = useMemo(() => streetsOf(places.data ?? []), [places.data])
  const here = position ?? (area.bounds ? centreOf(area.bounds) : null)
  const nearby = useMemo(() => (here ? byDistance(streets, here) : streets), [streets, here])
  /** A street picked by hand; until then the nearest one follows the phone. */
  const [picked, setPicked] = useState<string | null>(null)
  const street = streets.find((s) => s.key === picked) ?? nearby[0]
  const outside =
    position !== null &&
    places.data !== undefined &&
    places.data.length > 0 &&
    places.data.every((p) => distance([p.lon, p.lat], position) > OUTSIDE_METRES)

  const doors = useQuery({
    queryKey: ["street-doors", street?.key, street?.postcodes],
    queryFn: () => streetDoors(street!),
    enabled: street !== undefined,
    staleTime: Infinity,
  })
  const visits = useQuery({
    queryKey: ["door-visits", street?.key],
    queryFn: () => listDoorVisits(street!.postcodes),
    enabled: street !== undefined,
  })

  // This session's taps show at once, under a temporary id; `savedAs` is the server's once it is stored.
  const [added, setAdded] = useState<(DoorVisit & { savedAs?: string })[]>([])
  const [undone, setUndone] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<{ visitId: string; at: string; index: number }[]>([])

  const all = useMemo(() => {
    const fromServer = new Set((visits.data ?? []).map((v) => v.id))
    const undoneSaved = new Set(added.filter((v) => undone.has(v.id)).map((v) => v.savedAs))
    return [
      ...(visits.data ?? []).filter((v) => !undoneSaved.has(v.id)),
      ...added.filter((v) => !undone.has(v.id) && !(v.savedAs && fromServer.has(v.savedAs))),
    ]
  }, [visits.data, added, undone])
  const latest = useMemo(() => latestVisits(all), [all])

  const [side, setSide] = useState<Side>("even")
  const both = useMemo(() => sides(doors.data ?? []), [doors.data])
  const list = both[side]
  const at = `${street?.key}|${side}`
  const [positions, setPositions] = useState<Record<string, number>>({})

  // With a location, a street opens at the door nearest to the phone, once per street (and again on "Waar ik ben").
  const [snapped, setSnapped] = useState<string | null>(null)
  if (position && street && doors.data && snapped !== street.key) {
    setSnapped(street.key)
    const near = nearestDoor(doors.data, position)
    if (near) {
      setSide(near.side)
      const onSide = both[near.side].findIndex((d) => doorKey(d) === doorKey(near.door))
      setPositions((p) => ({ ...p, [`${street.key}|${near.side}`]: onSide }))
    }
  }
  const index = Math.min(positions[at] ?? firstOpen(list, latest), Math.max(0, list.length - 1))
  const door = list[index] as Door | undefined
  const moveTo = (i: number) => setPositions((p) => ({ ...p, [at]: Math.max(0, Math.min(list.length - 1, i)) }))

  const day = today()

  function mark(outcome: Outcome) {
    if (!door || !wervernr) return
    const temp: DoorVisit = {
      ...door,
      id: `temp-${crypto.randomUUID()}`,
      outcome,
      visitedAt: new Date().toISOString(),
      wervernr,
    }
    setAdded((a) => [...a, temp])
    setHistory((h) => [...h, { visitId: temp.id, at, index }])
    moveTo(index + 1)
    recordDoorVisit({ ...door, outcome, assignmentId: area.id, wervernr })
      .then((id) => setAdded((a) => a.map((v) => (v.id === temp.id ? { ...v, savedAs: id } : v))))
      .catch((error: unknown) => {
        setAdded((a) => a.filter((v) => v.id !== temp.id))
        toast.error(getErrorMessage(error))
      })
    if (outcome === "sold") onSold(door)
  }

  function undo() {
    const last = history.at(-1)
    if (!last) return
    const id = added.find((v) => v.id === last.visitId)?.savedAs
    if (!id) return void toast.info("Nog bezig met opslaan, probeer zo opnieuw")
    setHistory((h) => h.slice(0, -1))
    setUndone((u) => new Set(u).add(last.visitId))
    setPositions((p) => ({ ...p, [last.at]: last.index }))
    deleteDoorVisit(id).catch((error: unknown) => {
      setUndone((u) => new Set([...u].filter((v) => v !== last.visitId)))
      toast.error(getErrorMessage(error))
    })
  }

  const loading = places.isPending || (street !== undefined && doors.isPending)
  const error = places.error ?? doors.error

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <PageHeader
        start={
          <Button variant="ghost" size="icon" className={HEADER_BUTTON_CLASS} aria-label="Terug" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        }
        title={street?.name ?? "Lopen"}
        end={<AppMenu />}
      />

      <div className={`mx-auto flex w-full flex-1 flex-col gap-3 px-4 py-3 ${PAGE_WIDTH}`}>
        {outside && <p className="text-sm font-medium text-orange-700">Je bent buiten je gebied</p>}

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Straat">
          <Button variant="outline" size="sm" className="h-9 shrink-0 rounded-full" onClick={onShowMap}>
            <MapIcon /> Kaart
          </Button>
          {position && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-full"
              onClick={() => {
                setPicked(null)
                setSnapped(null)
              }}
            >
              <LocateFixedIcon /> Waar ik ben
            </Button>
          )}
          {nearby.slice(0, 15).map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={s.key === street?.key ? "default" : "outline"}
              className="h-9 shrink-0 rounded-full"
              aria-pressed={s.key === street?.key}
              onClick={() => setPicked(s.key)}
            >
              {s.name}
            </Button>
          ))}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{getErrorMessage(error)}</AlertDescription>
          </Alert>
        )}
        {loading && !error && (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-6" />
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Kant">
              {(["even", "odd"] as const).map((s) => {
                const total = both[s].length
                const done = both[s].filter((d) => latest.has(doorKey(d))).length
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={s === side}
                    onClick={() => setSide(s)}
                    className={cn(
                      "h-10 rounded-md text-sm",
                      s === side ? "bg-background font-semibold shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {s === "even" ? "Even" : "Oneven"} · {total > 0 && done === total ? "klaar" : `${done}/${total}`}
                  </button>
                )
              })}
            </div>

            {list.length === 0 ? (
              <p className="flex-1 py-8 text-center text-muted-foreground">Geen adressen aan deze kant.</p>
            ) : (
              <>
                <DoorStrip doors={list} index={index} latest={latest} day={day} onPick={moveTo} />

                <div className="flex flex-1 flex-col items-center justify-center py-4">
                  <span className="text-7xl font-bold tracking-tight">{door ? doorLabel(door) : ""}</span>
                  {door && latest.get(doorKey(door)) && (
                    <span className="text-sm text-muted-foreground">
                      eerder: {OUTCOME_LABELS[latest.get(doorKey(door))!.outcome]}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-16 text-base" onClick={() => mark("not_home")}>
                    Niet thuis
                  </Button>
                  <Button
                    className="h-16 bg-slate-500 text-base hover:bg-slate-600"
                    onClick={() => mark("no_interest")}
                  >
                    Geen interesse
                  </Button>
                  <Button
                    className="h-16 bg-orange-300 text-base text-orange-950 hover:bg-orange-400"
                    onClick={() => mark("later")}
                  >
                    Terugkomen
                  </Button>
                  <Button className="h-16 bg-blue-700 text-base hover:bg-blue-800" onClick={() => mark("sold")}>
                    Verkocht <FileTextIcon />
                  </Button>
                </div>
                <div className="flex justify-between pb-[env(safe-area-inset-bottom)]">
                  <Button variant="ghost" className="text-muted-foreground" onClick={() => mark("skip")}>
                    Geen woning / overslaan
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={history.length === 0}
                    onClick={undo}
                  >
                    <Undo2Icon /> Ongedaan
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

type DoorStripProps = {
  doors: Door[]
  index: number
  latest: Map<string, DoorVisit>
  /** Today, so doors done on earlier days show faded. */
  day: string
  onPick: (index: number) => void
}

/**
 * Every house number of the side in one row that scrolls sideways, the current one kept in the middle; the arrows
 * jump to the start or the end of the street.
 */
function DoorStrip({ doors, index, latest, day, onPick }: DoorStripProps) {
  const row = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    current.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
  }, [index, doors])
  const scrollTo = (end: "start" | "end") =>
    row.current?.scrollTo({ left: end === "start" ? 0 : row.current.scrollWidth, behavior: "smooth" })

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label="Naar het begin van de straat"
        onClick={() => scrollTo("start")}
      >
        <ChevronsLeftIcon />
      </Button>
      <div ref={row} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-1 [scrollbar-width:none]">
        {doors.map((d, i) => {
          const visit = latest.get(doorKey(d))
          const isCurrent = i === index
          const earlier = visit && localDate(visit.visitedAt) !== day
          return (
            <button
              key={doorKey(d)}
              ref={isCurrent ? current : undefined}
              type="button"
              aria-label={`Nummer ${doorLabel(d)}${isCurrent ? ", huidig" : ""}${visit ? `, ${OUTCOME_LABELS[visit.outcome]}` : ""}`}
              aria-current={isCurrent ? "true" : undefined}
              onClick={() => onPick(i)}
              className={cn(
                "h-11 min-w-12 shrink-0 rounded-md px-2 text-sm font-semibold",
                OUTCOME_STYLES[visit?.outcome ?? "open"],
                earlier && "opacity-50",
                isCurrent && "ring-2 ring-foreground ring-offset-2",
              )}
            >
              {doorLabel(d)}
            </button>
          )
        })}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label="Naar het einde van de straat"
        onClick={() => scrollTo("end")}
      >
        <ChevronsRightIcon />
      </Button>
    </div>
  )
}

/** Where the phone is, as [lon, lat], while the page is open; null without a fix or permission. */
function usePosition(): [number, number] | null {
  const [position, setPosition] = useState<[number, number] | null>(null)
  useEffect(() => {
    if (!("geolocation" in navigator)) return
    const watch = navigator.geolocation.watchPosition(
      (p) => setPosition([p.coords.longitude, p.coords.latitude]),
      () => setPosition(null),
      { enableHighAccuracy: true, maximumAge: 15_000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [])
  return position
}
