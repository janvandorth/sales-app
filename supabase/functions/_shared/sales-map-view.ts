// What the map shows, made by the sales-map function from the Contracts API's sales per street (PC6). Everyone sees
// where and how recently the team sold, and how much as one of LEVELS shades. Only admins get the numbers: for
// recruiters no count of any kind leaves the server, not per area, not per recruiter, not in total.
// A PC4 or PC5 area is shaded by its busiest street, ranked against the busiest streets of all other areas of its
// size, so a dark area is one with a street worth zooming in to, however big or small the area is. Zoomed in to
// streets, each street is ranked among all streets. No Deno APIs here.
import type { SalesMap, SalesPc5, SalesPc6 } from "./sales-map.ts"

/** Shades of "how much": coarse enough that a recruiter cannot work the counts back out. */
export const LEVELS = 5

/** One PC4 area. The numbers only for admins. */
export type MapArea = {
  /** "1234". */
  postcode: string
  city: string
  lastSoldOn: string
  /** How long ago `lastSoldOn` was as a share of the period: 0 = its last day, 1 = its first day. */
  age: number
  /** 1 to LEVELS: how its busiest street ranks against the busiest streets of the other areas. */
  level: number
  sold?: number
  /** Sales in its busiest street. */
  bestStreetSold?: number
  /** Most sales first. */
  recruiters?: { recruiter: string; sold: number }[]
}

/** The sales-map function's answer: the PC4 areas, or (asked with a view) the PC5 areas or streets in it. */
export type SalesMapResponse = { demo: boolean; map: SalesMapView } | { demo: boolean; detail: DetailView<SalesStreet> }

export type SalesMapView = {
  /** True when the counts are included (admins). */
  detailed: boolean
  areas: MapArea[]
  /** Admins only: sales without a valid postcode, so not on the map. */
  unplaced?: number
  /** Admins only: the names to the recruiter codes in `areas`. */
  recruiters: { number: string; name: string }[]
}

/** One PC5 area or street (PC6) of the zoomed-in map and what it is drawn by. The numbers only for admins. */
export type SalesStreet = {
  postcode: string
  /** 1 to LEVELS, on the national scale of its kind (PC5 by its busiest street, a street by itself). */
  level: number
  /** As MapArea.age. */
  age: number
  city: string
  lastSoldOn: string
  sold?: number
  /** PC5 only: sales in its busiest street. */
  bestStreetSold?: number
  recruiters?: { recruiter: string; sold: number }[]
}

/**
 * The PC5 areas or streets in a view: per postcode what it is drawn by and what its popup shows. The outlines are
 * vector tiles the app has; this is only what colours them.
 */
export type DetailView<T> = {
  detailed: boolean
  /** Which postcodes these are. */
  level: "pc5" | "pc6"
  areas: T[]
}

type Sum = {
  area: Omit<Required<MapArea>, "level" | "age">
  cities: Map<string, number>
  recruiters: Map<string, number>
}

/**
 * The PC6 rows summed to PC4: a PC4 area holds the sales of every PC6 that starts with it, its newest sale day and
 * that day's age in the period `from`..`to` (yyyy-MM-dd), the city most of those sales were at, and the level of
 * its busiest street. Without `detailed`, the counts are left out.
 */
export function salesMapView(map: SalesMap, detailed: boolean, from: string, to: string): SalesMapView {
  const sums = new Map<string, Sum>()
  for (const pc6 of map.areas) {
    const postcode = pc6.postcode.slice(0, 4)
    let sum = sums.get(postcode)
    if (!sum) {
      sum = {
        area: { postcode, city: "", lastSoldOn: pc6.lastSoldOn, sold: 0, bestStreetSold: 0, recruiters: [] },
        cities: new Map(),
        recruiters: new Map(),
      }
      sums.set(postcode, sum)
    }
    sum.area.sold += pc6.sold
    sum.area.bestStreetSold = Math.max(sum.area.bestStreetSold, pc6.sold)
    if (pc6.lastSoldOn > sum.area.lastSoldOn) sum.area.lastSoldOn = pc6.lastSoldOn
    if (pc6.city) sum.cities.set(pc6.city, (sum.cities.get(pc6.city) ?? 0) + pc6.sold)
    for (const r of pc6.recruiters) sum.recruiters.set(r.recruiter, (sum.recruiters.get(r.recruiter) ?? 0) + r.sold)
  }

  const areaThresholds = streetThresholds([...sums.values()].map((s) => s.area.bestStreetSold))
  const areas: MapArea[] = [...sums.values()]
    .map(({ area, cities, recruiters }) => {
      const shown = {
        postcode: area.postcode,
        city: mostOf(cities) ?? "",
        lastSoldOn: area.lastSoldOn,
        age: ageIn(area.lastSoldOn, from, to),
        level: levelFrom(area.bestStreetSold, areaThresholds),
      }
      if (!detailed) return shown
      return {
        ...shown,
        sold: area.sold,
        bestStreetSold: area.bestStreetSold,
        recruiters: [...recruiters]
          .map(([recruiter, sold]) => ({ recruiter, sold }))
          .sort((a, b) => b.sold - a.sold || a.recruiter.localeCompare(b.recruiter)),
      }
    })
    .sort((a, b) => a.postcode.localeCompare(b.postcode))

  return detailed
    ? { detailed, areas, unplaced: map.unplaced, recruiters: map.recruiters }
    : { detailed, areas, recruiters: [] }
}

/** The streets in a view, each by its own sales on the national street scale. */
export function salesStreetsView(pc6: SalesPc6, detailed: boolean, from: string, to: string): DetailView<SalesStreet> {
  return {
    detailed,
    level: "pc6",
    areas: pc6.streets.map(({ postcode, city, lastSoldOn, sold, recruiters }) => {
      const shown = {
        postcode,
        level: levelFrom(sold, pc6.streetThresholds),
        age: ageIn(lastSoldOn, from, to),
        city,
        lastSoldOn,
      }
      return detailed ? { ...shown, sold, recruiters } : shown
    }),
  }
}

/** The PC5 areas in a view, each by its busiest street ranked against all PC5 areas in the country. */
export function salesPc5View(pc5: SalesPc5, detailed: boolean, from: string, to: string): DetailView<SalesStreet> {
  return {
    detailed,
    level: "pc5",
    areas: pc5.areas.map(({ postcode, city, lastSoldOn, sold, bestStreetSold, recruiters }) => {
      const level = levelFrom(bestStreetSold, pc5.areaThresholds)
      const shown = { postcode, level, age: ageIn(lastSoldOn, from, to), city, lastSoldOn }
      return detailed ? { ...shown, sold, bestStreetSold, recruiters } : shown
    }),
  }
}

/**
 * 1 to LEVELS for a street's value: 1 up to the national median, then one more for each of the top 25%, 10% and 3%
 * it is in (`thresholds` from the Contracts API). By rank rather than by size, so the darkest shade marks the few
 * streets that really stand out.
 */
export function levelFrom(value: number, thresholds: readonly number[]): number {
  return Math.min(LEVELS, 1 + thresholds.filter((t) => value > t).length)
}

/**
 * The values at the 50th, 75th, 90th and 97th percentile of the positive `values` (nearest rank), as the Contracts
 * API computes them; for the demo data, which has no API.
 */
export function streetThresholds(values: readonly number[]): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return []
  return [50, 75, 90, 97].map((p) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)])
}

/** How long before `to` the day `date` is, as a share of the period `from`..`to`, between 0 and 1. */
export function ageIn(date: string, from: string, to: string): number {
  const day = 86_400_000
  const length = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / day + 1
  const ago = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / day
  return Math.min(1, Math.max(0, ago / length))
}

/** The key with the highest count; ties go to the alphabetically first. */
function mostOf(counts: Map<string, number>): string | undefined {
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
}
