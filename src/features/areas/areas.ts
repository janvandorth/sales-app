import { addDays, formatDay, periodStart } from "../dashboard/periods"

/**
 * Areas the sales manager gives wervers: postcodes of any level (PC4 "3561", PC5 "3561A", PC6 "3561AC"), where a
 * code covers every postcode it starts. Dates are yyyy-MM-dd on the phone's calendar.
 */

export type Bounds = [west: number, south: number, east: number, north: number]

export type AreaMember = { wervernr: string; name: string }

export type AreaAssignment = {
  id: string
  postcodes: string[]
  wervernrs: string[]
  startsOn: string
  endsOn: string
  /** Neighbourhood and town at the centre, e.g. "Overvecht, Utrecht"; empty when unknown. */
  label: string
  note: string
  bounds: Bounds | null
  /** Households and those not yet a customer when the area was given out; null when the map had no numbers. */
  households: number | null
  open: number | null
  members: AreaMember[]
  /** Sales its wervers booked in the area between its first and last day. */
  sold: number
  /** Doors rung in it so far. */
  visited: number
}

export type NewAreaAssignment = Omit<AreaAssignment, "id" | "members" | "sold" | "visited">

/** The share of its addresses walked, 0..1; null when its size is not known. */
export function walkedShare(a: Pick<AreaAssignment, "households" | "visited">): number | null {
  if (!a.households) return null
  return Math.min(1, a.visited / a.households)
}

/** What the map starts with when the planning sends it to give out an area. */
export type AssignStart = { wervernr?: string; days?: { startsOn: string; endsOn: string } }

/** Doors a werver gets through in a day, roughly: an area with more addresses needs more days. */
export const DOORS_PER_DAY = 90

/** The days an area of `households` addresses needs, when it needs more than it was given; else null. */
export function tooBig(a: Pick<AreaAssignment, "households" | "startsOn" | "endsOn">): number | null {
  if (a.households === null) return null
  const days = Math.round((Date.parse(a.endsOn) - Date.parse(a.startsOn)) / 86_400_000) + 1
  return a.households > DOORS_PER_DAY * days ? days : null
}

/**
 * An area tapped on the map, with what the map knew of it at that moment: so the numbers stay when it is panned
 * out of view. `lastSold` is null when nothing was sold there in the past year, undefined when it is not known.
 */
export type PickedArea = {
  code: string
  bounds: Bounds
  households?: number
  open?: number
  lastSold?: string | null
}

export type PickedSummary = {
  households: number | null
  open: number | null
  /** The newest sale in any of the areas; null when none in the past year, undefined when not known. */
  lastSold: string | null | undefined
}

/** The selection's numbers, summed over the areas whose numbers are known. */
export function summarize(picked: PickedArea[]): PickedSummary {
  const sum = (values: (number | undefined)[]) => {
    const known = values.filter((v) => v !== undefined)
    return known.length ? known.reduce((a, b) => a + b, 0) : null
  }
  const dates = picked.map((p) => p.lastSold).filter((d) => typeof d === "string")
  const lastSold = dates.length
    ? dates.reduce((a, b) => (a > b ? a : b))
    : picked.length > 0 && picked.every((p) => p.lastSold === null)
      ? null
      : undefined
  return { households: sum(picked.map((p) => p.households)), open: sum(picked.map((p) => p.open)), lastSold }
}

/** Whether `code` covers `postcode`: the same area or a larger one around it. */
export const covers = (code: string, postcode: string) => postcode.startsWith(code)

/** Whether two codes share any postcode: one covers the other. */
export const overlaps = (a: string, b: string) => covers(a, b) || covers(b, a)

/**
 * The selection after tapping `code`. A tap on a picked area, or on a street inside a picked larger area, drops
 * that area; otherwise `code` is added and any smaller picked areas inside it fold into it.
 */
export function toggleCode(picked: string[], code: string): string[] {
  const around = picked.find((p) => covers(p, code))
  if (around) return picked.filter((p) => p !== around)
  return [...picked.filter((p) => !covers(code, p)), code]
}

/** The selection after tapping `area`, keeping what was known of the areas that stay picked. */
export function pickArea(picked: PickedArea[], area: PickedArea): PickedArea[] {
  const codes = toggleCode(
    picked.map((p) => p.code),
    area.code,
  )
  return codes.map((code) => (code === area.code ? area : picked.find((p) => p.code === code)!))
}

/** The codes of the larger areas that hold part of the selection but are not picked whole. */
export function partlyPicked(picked: string[]): string[] {
  const parts = new Set<string>()
  for (const code of picked) {
    for (const length of [4, 5]) if (code.length > length) parts.add(code.slice(0, length))
  }
  return [...parts].filter((part) => !picked.some((p) => covers(p, part)))
}

/** The smallest box around all of `boxes`. */
export function unionBounds(boxes: Bounds[]): Bounds | null {
  if (boxes.length === 0) return null
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ]
}

export const centreOf = (b: Bounds): [lon: number, lat: number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]

export type PeriodPreset = { key: string; label: string; startsOn: string; endsOn: string }

/** The periods offered when giving out an area; a week runs Monday to Saturday. */
export function periodPresets(now: string): PeriodPreset[] {
  const monday = periodStart(now, "week")
  const saturday = addDays(monday, 5)
  return [
    { key: "today", label: "Vandaag", startsOn: now, endsOn: now },
    { key: "tomorrow", label: "Morgen", startsOn: addDays(now, 1), endsOn: addDays(now, 1) },
    // On a Sunday "this week" is over; it is then the coming one.
    { key: "week", label: "Deze week", startsOn: now, endsOn: now > saturday ? addDays(saturday, 7) : saturday },
    { key: "next", label: "Volgende week", startsOn: addDays(monday, 7), endsOn: addDays(saturday, 7) },
  ]
}

/** The presets, with `given` first when the planning opened the map for days that are not one of them. */
export function periodsFor(now: string, given?: { startsOn: string; endsOn: string }): PeriodPreset[] {
  const presets = periodPresets(now)
  if (!given || presets.some((p) => p.startsOn === given.startsOn && p.endsOn === given.endsOn)) return presets
  return [{ key: "given", label: spanLabel(given.startsOn, given.endsOn), ...given }, ...presets]
}

/** The ISO week number of the week `date` is in. */
export function isoWeek(date: string): number {
  const thursday = new Date(`${addDays(periodStart(date, "week"), 3)}T00:00:00Z`)
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.floor((thursday.getTime() - yearStart) / (7 * 86_400_000)) + 1
}

const WEEKDAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"]

export const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

/** "wo 30 okt" for one day, "ma 28 – wo 30 okt" or "ma–wo" (`short`) for more. */
export function spanLabel(startsOn: string, endsOn: string, short = false): string {
  if (startsOn === endsOn) return short ? weekday(startsOn) : `${weekday(startsOn)} ${formatDay(startsOn)}`
  if (short) return `${weekday(startsOn)}–${weekday(endsOn)}`
  const sameMonth = startsOn.slice(0, 7) === endsOn.slice(0, 7)
  return `${weekday(startsOn)} ${formatDay(startsOn, !sameMonth)} – ${weekday(endsOn)} ${formatDay(endsOn)}`
}

/** "3561A + 2 straten", "3561, 3562" or "3561AC": the codes, the larger areas first. */
export function codesLabel(codes: string[]): string {
  const areas = codes.filter((c) => c.length < 6).sort()
  const streets = codes.filter((c) => c.length === 6).sort()
  if (areas.length === 0) return streets.length <= 2 ? streets.join(", ") : `${streets.length} straten`
  const named = areas.length <= 2 ? areas.join(", ") : `${areas.length} gebieden`
  if (streets.length === 0) return named
  return `${named} + ${streets.length} ${streets.length === 1 ? "straat" : "straten"}`
}

/** "Sanne" from "Sanne de Wit": wervers know each other by first name. */
export const firstName = (name: string) => name.split(" ")[0]

/**
 * Who has the area a postcode lies in, one line per assignment covering it: "Sanne + Daan · wo–vr". Empty when
 * nobody has it.
 */
export function takenBy(given: AreaAssignment[], postcode: string): string[] {
  return given
    .filter((a) => a.postcodes.some((code) => covers(code, postcode)))
    .map((a) => `${a.members.map((m) => firstName(m.name)).join(" + ")} · ${spanLabel(a.startsOn, a.endsOn, true)}`)
}

/** The title of an area: its neighbourhood, else its codes. */
export const areaTitle = (a: Pick<AreaAssignment, "label" | "postcodes">) => a.label || codesLabel(a.postcodes)

/** Whether an assignment runs on `day`. */
export const runsOn = (a: Pick<AreaAssignment, "startsOn" | "endsOn">, day: string) =>
  a.startsOn <= day && day <= a.endsOn

/** Whether an assignment overlaps the days from..to. */
export const runsDuring = (a: Pick<AreaAssignment, "startsOn" | "endsOn">, from: string, to: string) =>
  a.startsOn <= to && from <= a.endsOn

/** "Overvecht, Utrecht" from PDOK's "Wijk 03 Overvecht" and "Utrecht". */
export function placeLabel(wijk: string | undefined, town: string | undefined): string {
  const neighbourhood = (wijk ?? "").replace(/^Wijk\s+\d+\s+/i, "").trim()
  if (!neighbourhood) return town ?? ""
  if (!town || neighbourhood.toLowerCase() === town.toLowerCase()) return neighbourhood
  return `${neighbourhood}, ${town}`
}

/** The Google Maps route from where the phone is to the middle of the area. */
export function routeUrl(bounds: Bounds): string {
  const [lon, lat] = centreOf(bounds)
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lon.toFixed(5)}`
}
