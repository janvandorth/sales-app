/**
 * Walking an area door by door. The streets and house numbers come from the BAG (PDOK's address search); what the
 * werver taps at each door is kept as a visit. A door is one address: postcode, house number and its letter or
 * addition ("toevoeging", e.g. "A" or "-2").
 */

export type Outcome = "not_home" | "no_interest" | "later" | "sold" | "skip"

export type Door = {
  postcode: string
  huisnummer: number
  toevoeging: string
  straat: string
  plaats: string
  /** Where the address is, [lon, lat]; unknown for a door only known from a visit. */
  at?: [number, number]
}

export type DoorVisit = Door & {
  id: string
  outcome: Outcome
  /** ISO timestamp. */
  visitedAt: string
  wervernr: string
}

/** A street in an area: its name and town, its postcodes there and where each postcode lies. */
export type Street = {
  key: string
  name: string
  plaats: string
  postcodes: string[]
  points: [lon: number, lat: number][]
}

/** One postcode as PDOK lists it. */
export type PostcodePlace = { postcode: string; straat: string; plaats: string; lon: number; lat: number }

export const OUTCOME_LABELS: Record<Outcome, string> = {
  not_home: "niet thuis",
  no_interest: "geen interesse",
  later: "terugkomen",
  sold: "verkocht",
  skip: "overgeslagen",
}

export const doorKey = (d: Pick<Door, "postcode" | "huisnummer" | "toevoeging">) =>
  `${d.postcode}:${d.huisnummer}:${d.toevoeging}`

/** "6", "6A" or "6-2". */
export const doorLabel = (d: Pick<Door, "huisnummer" | "toevoeging">) => `${d.huisnummer}${d.toevoeging}`

/** The letter and addition as one: "A", "-2", "A-2" or "". */
export function toevoeging(letter: string | undefined, addition: string | undefined): string {
  return `${letter ?? ""}${addition ? `-${addition}` : ""}`
}

/** Doors in walking order: by house number, then letter or addition. */
export function sortDoors(doors: Door[]): Door[] {
  return [...doors].sort(
    (a, b) => a.huisnummer - b.huisnummer || a.toevoeging.localeCompare(b.toevoeging, "nl", { numeric: true }),
  )
}

/** The even and the odd side of a street, each in walking order. */
export function sides(doors: Door[]): { even: Door[]; odd: Door[] } {
  const sorted = sortDoors(doors)
  return { even: sorted.filter((d) => d.huisnummer % 2 === 0), odd: sorted.filter((d) => d.huisnummer % 2 === 1) }
}

/** The streets among postcodes, with every postcode they run through; sorted by name. */
export function streetsOf(places: PostcodePlace[]): Street[] {
  const byKey = new Map<string, Street>()
  for (const p of places) {
    if (!p.straat) continue
    const key = `${p.straat}|${p.plaats}`
    const street = byKey.get(key) ?? { key, name: p.straat, plaats: p.plaats, postcodes: [], points: [] }
    if (!street.postcodes.includes(p.postcode)) {
      street.postcodes.push(p.postcode)
      street.points.push([p.lon, p.lat])
    }
    byKey.set(key, street)
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"))
}

/** Metres between two points, near enough at street scale. */
export function distance([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
  const y = lat2 - lat1
  return Math.sqrt(x * x + y * y) * 111_320
}

/** Streets nearest first: by the closest of their postcodes to `at`. */
export function byDistance(streets: Street[], at: [number, number]): Street[] {
  const near = (s: Street) => Math.min(...s.points.map((p) => distance(p, at)))
  return [...streets].sort((a, b) => near(a) - near(b))
}

/** The door whose address lies nearest to `here`, with its side; null when no door has a location. */
export function nearestDoor(doors: Door[], here: [number, number]): { door: Door; side: "even" | "odd" } | null {
  let best: Door | null = null
  let bestDistance = Infinity
  for (const d of doors) {
    if (!d.at) continue
    const metres = distance(d.at, here)
    if (metres < bestDistance) {
      best = d
      bestDistance = metres
    }
  }
  return best && { door: best, side: best.huisnummer % 2 === 0 ? "even" : "odd" }
}

/** The newest visit per door. */
export function latestVisits(visits: DoorVisit[]): Map<string, DoorVisit> {
  const latest = new Map<string, DoorVisit>()
  for (const v of visits) {
    const key = doorKey(v)
    const before = latest.get(key)
    if (!before || before.visitedAt < v.visitedAt) latest.set(key, v)
  }
  return latest
}

/** Where to start on a side: the first door nobody has been to, else the first. */
export function firstOpen(doors: Door[], latest: Map<string, DoorVisit>): number {
  const index = doors.findIndex((d) => !latest.has(doorKey(d)))
  return index === -1 ? 0 : index
}

/** The doors around `index` to show in the strip: `size` of them, the current one in the middle where possible. */
export function stripRange(length: number, index: number, size = 7): { start: number; end: number } {
  const start = Math.max(0, Math.min(index - Math.floor(size / 2), length - size))
  return { start, end: Math.min(length, start + size) }
}
