import { covers } from "./areas"
import { doorKey, sortDoors, type Door, type DoorVisit } from "./doors"

/**
 * Ticking off what a werver walked, afterwards: a whole postcode (PC4, PC5 or PC6), or in a PC6 a range of house
 * numbers, on one side or both. What is done is worked out per door, from every visit since the area started, so
 * doors rung on the walk and doors ticked off count alike.
 */

export type Side = "even" | "odd"

/** "3561", "3561A", "3561AB", "3561AB 12", "3561AB 2-40" or "3561AB 2-40 even". */
export type Tick = { code: string; from?: number; to?: number; side?: Side }

const SIDES: Record<string, Side> = { E: "even", EV: "even", EVEN: "even", O: "odd", ON: "odd", ONEVEN: "odd" }

/**
 * The tick typed, as a werver would text it: spaces and case free, "–", "t/m" or "tm" between the numbers. A range
 * or side only after a whole PC6, where house numbers run along one street; null for anything else.
 */
export function parseTick(text: string): Tick | null {
  const match = text
    .trim()
    .toUpperCase()
    .match(/^(\d{4})\s*([A-Z]{2})?(?:\s*(\d+)(?:\s*(?:-|–|T\/M|TM)\s*(\d+))?)?(?:\s*(EVEN|ONEVEN|EV|ON|E|O))?$/)
  if (!match) {
    const short = text
      .trim()
      .toUpperCase()
      .match(/^(\d{4})\s*([A-Z])$/)
    return short ? { code: short[1] + short[2] } : null
  }
  const [, digits, letters, first, last, side] = match
  if (!letters && (first || side)) return null
  const tick: Tick = { code: digits + (letters ?? "") }
  if (first) {
    const a = Number(first)
    const b = last ? Number(last) : a
    tick.from = Math.min(a, b)
    tick.to = Math.max(a, b)
  }
  if (side) tick.side = SIDES[side]
  return tick
}

export const sideOf = (huisnummer: number): Side => (huisnummer % 2 === 0 ? "even" : "odd")

/** Whether a door is one the tick covers. */
export function ticks(tick: Tick, door: Door): boolean {
  if (!covers(tick.code, door.postcode)) return false
  if (tick.from !== undefined && (door.huisnummer < tick.from || door.huisnummer > tick.to!)) return false
  return tick.side === undefined || sideOf(door.huisnummer) === tick.side
}

/** How a tick reads back: "Zonnebloemstraat 26–50 even", or the code alone above a PC6. */
export function tickLabel(tick: Tick, doors: Door[]): string {
  if (tick.code.length < 6) return tick.code
  const street = doors.find((d) => d.postcode === tick.code)?.straat ?? tick.code
  const numbers = tick.from === undefined ? "" : tick.from === tick.to ? ` ${tick.from}` : ` ${tick.from}–${tick.to}`
  const side = tick.side === "even" ? " even" : tick.side === "odd" ? " oneven" : ""
  return street + numbers + side
}

/** The visits per door that count for an area: since it started, any outcome. */
export function visitsSince(visits: DoorVisit[], startsOn: string): Map<string, DoorVisit[]> {
  const byDoor = new Map<string, DoorVisit[]>()
  for (const v of visits) {
    if (v.visitedAt.slice(0, 10) < startsOn) continue
    const key = doorKey(v)
    byDoor.set(key, [...(byDoor.get(key) ?? []), v])
  }
  return byDoor
}

export type Status = "done" | "part" | "open"

export function statusOf(done: number, total: number): Status {
  return done === 0 ? "open" : done === total ? "done" : "part"
}

/** "12" when done or open, "9/43" in between: the fraction only where it says something. */
export const countLabel = (done: number, total: number) =>
  statusOf(done, total) === "part" ? `${done}/${total}` : String(total)

export type Row = {
  code: string
  /** The street, or streets, of a PC6; empty above. */
  streets: string
  /** "1–23": the lowest and highest house number. */
  range: string
  doors: Door[]
  done: number
}

export type Group = Row & { rows: Row[] }

function row(code: string, doors: Door[], done: (d: Door) => boolean): Row {
  const sorted = sortDoors(doors)
  const low = sorted[0]?.huisnummer
  const high = sorted.at(-1)?.huisnummer
  return {
    code,
    streets: code.length === 6 ? [...new Set(sorted.map((d) => d.straat))].join(", ") : "",
    range: low === undefined ? "" : low === high ? String(low) : `${low}–${high}`,
    doors: sorted,
    done: sorted.filter(done).length,
  }
}

/** The doors by PC5 and, within, by PC6, in postcode order, with how many of each are done. */
export function groupDoors(doors: Door[], done: (d: Door) => boolean): Group[] {
  const byCode = (length: number) => {
    const map = new Map<string, Door[]>()
    for (const d of doors) {
      const code = d.postcode.slice(0, length)
      map.set(code, [...(map.get(code) ?? []), d])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }
  const pc6 = byCode(6).map(([code, list]) => row(code, list, done))
  return byCode(5).map(([code, list]) => ({
    ...row(code, list, done),
    rows: pc6.filter((r) => r.code.startsWith(code)),
  }))
}

/** For the map: every PC4, PC5 and PC6 code with any door done, and whether all are. */
export function codeStatuses(doors: Door[], done: (d: Door) => boolean): Map<string, Status> {
  const counts = new Map<string, { done: number; total: number }>()
  for (const d of doors) {
    for (const length of [4, 5, 6]) {
      const code = d.postcode.slice(0, length)
      const c = counts.get(code) ?? { done: 0, total: 0 }
      c.total++
      if (done(d)) c.done++
      counts.set(code, c)
    }
  }
  const statuses = new Map<string, Status>()
  for (const [code, c] of counts) {
    const status = statusOf(c.done, c.total)
    if (status !== "open") statuses.set(code, status)
  }
  return statuses
}

/** The doors on one side from `a` to `b` (either order), as tapped in the list of house numbers. */
export function between(side: Door[], a: string, b: string): Door[] {
  const i = side.findIndex((d) => doorKey(d) === a)
  const j = side.findIndex((d) => doorKey(d) === b)
  if (i === -1 || j === -1) return []
  return side.slice(Math.min(i, j), Math.max(i, j) + 1)
}
