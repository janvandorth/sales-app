import { lazy, Suspense, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ListIcon, MapIcon, MinusIcon } from "lucide-react"
import { toast } from "sonner"
import { AppMenu } from "@/components/app-menu"
import { HEADER_BUTTON_CLASS, PAGE_WIDTH, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { areaDoors, deleteTickedDoors, listDoorVisits, recordTickedDoors, type TickedDoor } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { addDays, formatDay, today } from "../dashboard/periods"
import { covers, firstName, weekday, type AreaAssignment, type Bounds } from "./areas"
import { doorKey, doorLabel, sides, type Door, type DoorVisit } from "./doors"
import {
  between,
  codeStatuses,
  countLabel,
  groupDoors,
  parseTick,
  statusOf,
  tickLabel,
  ticks,
  visitsSince,
  type Side,
  type Status,
} from "./tick"

const TickMap = lazy(() => import("./tick-map"))

type Props = {
  area: AreaAssignment
  onBack: () => void
}

/** Two taps on one side of a street: from `a` to `b`; until the second, `a` alone. */
type Selection = { side: Side; a: string; b?: string }

/**
 * The sales manager ticks off what a werver walked without logging it: whole postcodes from the list or the map,
 * house numbers of a PC6 by two taps, or typed as the werver texted it. Every tick is stored at once and can be
 * undone from the message it leaves.
 */
export function TickPage({ area, onBack }: Props) {
  const client = useQueryClient()
  const now = today()
  const [wervernr, setWervernr] = useState(area.wervernrs[0])
  const days = useMemo(() => {
    const list: string[] = []
    for (let d = area.startsOn; d <= area.endsOn && d <= now; d = addDays(d, 1)) list.push(d)
    return list.length > 0 ? list : [area.startsOn]
  }, [area, now])
  const [day, setDay] = useState(days.at(-1)!)
  const [view, setView] = useState<"list" | "map">("list")
  const [text, setText] = useState("")
  const [expanded, setExpanded] = useState<Set<string> | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)

  const doorsQuery = useQuery({
    queryKey: ["area-doors", area.postcodes],
    queryFn: () => areaDoors(area.postcodes),
    staleTime: Infinity,
  })
  // An area's codes may overlap ("3561A" and "3561AB"): each door once.
  const doors = useMemo(
    () => [...new Map((doorsQuery.data ?? []).map((d) => [doorKey(d), d])).values()],
    [doorsQuery.data],
  )
  const postcodes = useMemo(() => [...new Set(doors.map((d) => d.postcode))], [doors])
  const bounds = useMemo(() => doorBounds(doors) ?? area.bounds, [doors, area.bounds])
  const visitsKey = ["area-visits", area.id]
  const visits = useQuery({
    queryKey: visitsKey,
    queryFn: () => listDoorVisits(postcodes),
    enabled: postcodes.length > 0,
  })
  const byDoor = useMemo(() => visitsSince(visits.data ?? [], area.startsOn), [visits.data, area.startsOn])
  const isDone = (d: Door) => byDoor.has(doorKey(d))
  const groups = useMemo(() => groupDoors(doors, (d) => byDoor.has(doorKey(d))), [doors, byDoor])
  const statuses = useMemo(() => codeStatuses(doors, (d) => byDoor.has(doorKey(d))), [doors, byDoor])
  // The first PC5 starts open, so the PC6 rows show at once.
  const openGroups = expanded ?? new Set(groups.slice(0, 1).map((g) => g.code))

  const setVisits = (change: (list: DoorVisit[]) => DoorVisit[]) =>
    client.setQueryData<DoorVisit[]>(visitsKey, (list) => change(list ?? []))
  const changed = () => void client.invalidateQueries({ queryKey: ["area-assignments"] })

  function store(rows: TickedDoor[]) {
    setVisits((list) => [...list, ...rows.map((r) => ({ ...r, outcome: "walked" as const }))])
    recordTickedDoors(rows)
      .then(changed)
      .catch((error: unknown) => {
        const ids = new Set(rows.map((r) => r.id))
        setVisits((list) => list.filter((v) => !ids.has(v.id)))
        toast.error(getErrorMessage(error))
      })
  }

  function unstore(rows: DoorVisit[]) {
    const ids = new Set(rows.map((r) => r.id))
    setVisits((list) => list.filter((v) => !ids.has(v.id)))
    deleteTickedDoors([...ids])
      .then(changed)
      .catch((error: unknown) => {
        setVisits((list) => [...list, ...rows])
        toast.error(getErrorMessage(error))
      })
  }

  /** Ticks off the doors not done yet; when all are, takes back those ticked off. */
  function toggle(list: Door[], label: string) {
    const left = list.filter((d) => !isDone(d))
    if (left.length > 0) {
      const visitedAt = day === now ? new Date().toISOString() : new Date(`${day}T12:00:00`).toISOString()
      const rows = left.map((d) => ({ ...d, id: crypto.randomUUID(), assignmentId: area.id, wervernr, visitedAt }))
      store(rows)
      toast(`${label} afgevinkt`, {
        action: { label: "Ongedaan", onClick: () => unstore(rows.map((r) => ({ ...r, outcome: "walked" }))) },
      })
      return
    }
    const ticked = list.flatMap((d) => (byDoor.get(doorKey(d)) ?? []).filter((v) => v.outcome === "walked"))
    if (ticked.length === 0) return void toast.info("Gelogd tijdens het lopen")
    unstore(ticked)
    toast(`${label} teruggezet`, {
      action: {
        label: "Ongedaan",
        onClick: () => store(ticked.map((v) => ({ ...v, assignmentId: area.id }))),
      },
    })
  }

  const ofCode = (code: string) => doors.filter((d) => covers(code, d.postcode))
  const tick = parseTick(text)
  const typed = tick ? doors.filter((d) => ticks(tick, d)) : []
  const openRow = open ? groups.flatMap((g) => g.rows).find((r) => r.code === open) : undefined

  const loading = doorsQuery.isPending || (postcodes.length > 0 && visits.isPending)
  const error = doorsQuery.error ?? visits.error

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <PageHeader
        start={
          <Button
            variant="ghost"
            size="icon"
            className={HEADER_BUTTON_CLASS}
            aria-label="Terug"
            onClick={() => (openRow ? (setOpen(null), setSelection(null)) : onBack())}
          >
            <ArrowLeftIcon />
          </Button>
        }
        title={
          openRow ? (
            <span className="flex min-w-0 flex-col items-center leading-tight">
              <span className="truncate">{openRow.streets}</span>
              <span className="text-xs font-normal opacity-80">{openRow.code}</span>
            </span>
          ) : (
            "Afvinken"
          )
        }
        end={<AppMenu />}
      />

      {!openRow && (
        <div className="border-b">
          <div className={`mx-auto flex flex-col gap-2.5 px-4 py-3 ${PAGE_WIDTH}`}>
            {(area.members.length > 1 || days.length > 1) && (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
                {area.members.length > 1 &&
                  area.members.map((m) => (
                    <Button
                      key={m.wervernr}
                      size="sm"
                      variant={m.wervernr === wervernr ? "default" : "outline"}
                      className="h-9 shrink-0 rounded-full"
                      aria-pressed={m.wervernr === wervernr}
                      onClick={() => setWervernr(m.wervernr)}
                    >
                      {firstName(m.name)}
                    </Button>
                  ))}
                {days.length > 1 &&
                  days.map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={d === day ? "default" : "outline"}
                      className="h-9 shrink-0 rounded-full"
                      aria-pressed={d === day}
                      onClick={() => setDay(d)}
                    >
                      {weekday(d)} {formatDay(d)}
                    </Button>
                  ))}
              </div>
            )}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (!tick || typed.length === 0) return
                toggle(typed, tickLabel(tick, doors))
                setText("")
              }}
            >
              <Input
                aria-label="Postcode of reeks"
                placeholder="3561AB 2-40 even"
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="h-11 flex-1 text-base md:text-base"
                autoCapitalize="characters"
                autoComplete="off"
              />
              <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Weergave">
                {(["list", "map"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={v === "list" ? "Lijst" : "Kaart"}
                    aria-pressed={v === view}
                    onClick={() => setView(v)}
                    className={cn(
                      "flex w-10 items-center justify-center rounded-md [&_svg]:size-4.5",
                      v === view ? "bg-background shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {v === "list" ? <ListIcon /> : <MapIcon />}
                  </button>
                ))}
              </div>
            </form>
          </div>
        </div>
      )}

      {error && (
        <div className={`mx-auto w-full px-4 py-3 ${PAGE_WIDTH}`}>
          <Alert variant="destructive">
            <AlertDescription>{getErrorMessage(error)}</AlertDescription>
          </Alert>
        </div>
      )}
      {loading && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      )}

      {!loading && !error && openRow && (
        <Numbers
          doors={openRow.doors}
          isDone={isDone}
          selection={selection}
          onSelect={setSelection}
          onToggle={toggle}
        />
      )}

      {!loading && !error && !openRow && tick && (
        <div className={`mx-auto w-full px-4 py-3 ${PAGE_WIDTH}`}>
          {typed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen adressen in dit gebied</p>
          ) : (
            <TypedTick
              label={tickLabel(tick, doors)}
              detail={`${tick.code} · ${typed.length} ${typed.length === 1 ? "adres" : "adressen"}`}
              done={typed.every(isDone)}
              onToggle={() => {
                toggle(typed, tickLabel(tick, doors))
                setText("")
              }}
            />
          )}
        </div>
      )}

      {!loading && !error && !openRow && !tick && view === "list" && (
        <div className={`mx-auto w-full pb-[env(safe-area-inset-bottom)] ${PAGE_WIDTH}`}>
          {groups.map((g) => {
            const isOpen = openGroups.has(g.code)
            return (
              <div key={g.code}>
                <div className="flex items-center border-b bg-muted/50 pl-2">
                  <TickBox
                    status={statusOf(g.done, g.doors.length)}
                    label={g.code}
                    onClick={() => toggle(g.doors, g.code)}
                  />
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    className="flex h-13 flex-1 items-center gap-2 pr-3 text-left"
                    onClick={() => {
                      const next = new Set(openGroups)
                      if (isOpen) next.delete(g.code)
                      else next.add(g.code)
                      setExpanded(next)
                    }}
                  >
                    <span className="flex-1 font-semibold tabular-nums">{g.code}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {countLabel(g.done, g.doors.length)}
                    </span>
                    {isOpen ? (
                      <ChevronDownIcon className="size-4.5 text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon className="size-4.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
                {isOpen &&
                  g.rows.map((r) => (
                    <div key={r.code} className="flex items-center border-b border-muted pl-5">
                      <TickBox
                        status={statusOf(r.done, r.doors.length)}
                        label={r.code}
                        onClick={() => toggle(r.doors, r.code)}
                      />
                      <button
                        type="button"
                        className="flex h-14 min-w-0 flex-1 items-center gap-2 pr-3 text-left"
                        onClick={() => setOpen(r.code)}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">
                            {r.streets} <span className="text-muted-foreground tabular-nums">{r.range}</span>
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">{r.code}</span>
                        </span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {countLabel(r.done, r.doors.length)}
                        </span>
                        <ChevronRightIcon className="size-4.5 shrink-0 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && !openRow && !tick && view === "map" && (
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          }
        >
          <TickMap area={area} bounds={bounds} statuses={statuses} onTap={(code) => toggle(ofCode(code), code)} />
        </Suspense>
      )}
    </div>
  )
}

/** The box around the doors that have a location; null when none has. */
function doorBounds(doors: Door[]): Bounds | null {
  const points = doors.flatMap((d) => (d.at ? [d.at] : []))
  if (points.length === 0) return null
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

/** A checkbox for a whole postcode: a tap ticks it off, or takes back what was ticked off in it. */
function TickBox({ status, label, onClick }: { status: Status; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={status === "done" ? true : status === "part" ? "mixed" : false}
      aria-label={label}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center"
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-md [&_svg]:size-4 [&_svg]:stroke-3",
          status === "open" ? "border-2 border-zinc-400" : "bg-primary text-primary-foreground",
        )}
      >
        {status === "done" && <CheckIcon />}
        {status === "part" && <MinusIcon />}
      </span>
    </button>
  )
}

type TypedTickProps = { label: string; detail: string; done: boolean; onToggle: () => void }

/** What the typed text covers, to tick off at once. */
function TypedTick({ label, detail, done, onToggle }: TypedTickProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border-2 py-2.5 pr-2.5 pl-3.5",
        done ? "border-border" : "border-green-700 bg-green-50",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{label}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{detail}</span>
      </span>
      {done ? (
        <Button variant="outline" className="h-11" onClick={onToggle}>
          Terugzetten
        </Button>
      ) : (
        <Button className="h-11 bg-green-700 hover:bg-green-800" onClick={onToggle}>
          <CheckIcon /> Afvinken
        </Button>
      )}
    </div>
  )
}

type NumbersProps = {
  doors: Door[]
  isDone: (door: Door) => boolean
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  onToggle: (doors: Door[], label: string) => void
}

/**
 * The house numbers of one PC6, odd and even side by side as along the street. Two taps on a side pick the doors
 * from one to the other; a side's checkbox takes the whole side.
 */
function Numbers({ doors, isDone, selection, onSelect, onToggle }: NumbersProps) {
  const both = sides(doors)
  const picked = selection ? between(both[selection.side], selection.a, selection.b ?? selection.a) : []
  const pickedKeys = new Set(picked.map(doorKey))
  const left = picked.filter((d) => !isDone(d)).length
  const label = (list: Door[]) =>
    list.length === 1 ? doorLabel(list[0]) : `${doorLabel(list[0])}–${doorLabel(list.at(-1)!)}`

  function tap(side: Side, key: string) {
    if (!selection || selection.side !== side || selection.b !== undefined) onSelect({ side, a: key })
    else onSelect({ ...selection, b: key })
  }

  return (
    <div className={`mx-auto flex w-full flex-1 flex-col px-4 pt-3 ${PAGE_WIDTH}`}>
      <div className="grid grid-cols-2 gap-4">
        {(["odd", "even"] as const).map((side) => {
          const list = both[side]
          const done = list.filter(isDone).length
          return (
            <div key={side} className="flex flex-col gap-2">
              <div className="flex items-center">
                <TickBox
                  status={list.length === 0 ? "open" : statusOf(done, list.length)}
                  label={side === "even" ? "Even kant" : "Oneven kant"}
                  onClick={() => list.length > 0 && onToggle(list, `${side === "even" ? "Even" : "Oneven"} kant`)}
                />
                <span className="flex-1 font-semibold">{side === "even" ? "Even" : "Oneven"}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{countLabel(done, list.length)}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {list.map((d) => {
                  const key = doorKey(d)
                  const isEnd = selection?.side === side && (key === selection.a || key === selection.b)
                  const inRange = pickedKeys.has(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={inRange}
                      onClick={() => tap(side, key)}
                      className={cn(
                        "h-10 rounded-lg text-[15px] tabular-nums",
                        isEnd
                          ? "bg-green-700 font-bold text-white"
                          : inRange
                            ? "border-2 border-green-700 bg-green-100 font-semibold text-green-950"
                            : isDone(d)
                              ? "bg-primary text-primary-foreground"
                              : "border",
                      )}
                    >
                      {doorLabel(d)}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {picked.length > 0 && (
        <div className="sticky bottom-0 mt-auto flex gap-2 bg-background py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" className="h-13 text-base" onClick={() => onSelect(null)}>
            Wissen
          </Button>
          {left > 0 ? (
            <Button
              className="h-13 flex-1 bg-green-700 text-base hover:bg-green-800"
              onClick={() => {
                onToggle(picked, label(picked))
                onSelect(null)
              }}
            >
              <CheckIcon /> {left} afvinken
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-13 flex-1 text-base"
              onClick={() => {
                onToggle(picked, label(picked))
                onSelect(null)
              }}
            >
              {picked.length} terugzetten
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
