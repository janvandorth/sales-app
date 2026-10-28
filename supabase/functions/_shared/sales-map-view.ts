// What the map shows, made by the sales-map function from the Contracts API's sales per PC6. Everyone sees where
// and how recently the team sold, and how much as one of LEVELS shades. Only admins get the numbers: for recruiters
// no count of any kind leaves the server, not per area, not per recruiter, not in total. No Deno APIs here.
import type { SalesMap } from "./sales-map.ts"

/** Shades of "how much": coarse enough that a recruiter cannot work the counts back out. */
export const LEVELS = 5

/** One PC4 area. `sold` and `recruiters` only for admins. */
export type MapArea = {
  /** "1234". */
  postcode: string
  city: string
  lastSoldOn: string
  /** 1 (fewest sales) to LEVELS (as many as the busiest area), on a log scale. */
  level: number
  sold?: number
  /** Most sales first. */
  recruiters?: { recruiter: string; sold: number }[]
}

/** The sales-map function's answer. */
export type SalesMapResponse = {
  /** True when the Contracts API is not configured and the areas are made up. */
  demo: boolean
  map: SalesMapView
}

export type SalesMapView = {
  /** True when the counts are included (admins). */
  detailed: boolean
  areas: MapArea[]
  /** Admins only: sales without a valid postcode, so not on the map. */
  unplaced?: number
  /** Admins only: the names to the recruiter codes in `areas`. */
  recruiters: { number: string; name: string }[]
}

type Sum = { area: Omit<Required<MapArea>, "level">; cities: Map<string, number>; recruiters: Map<string, number> }

/**
 * The PC6 rows summed to PC4: a PC4 area holds the sales of every PC6 that starts with it, its newest sale day, the
 * city most of those sales were at, and its level. Without `detailed`, the counts are left out.
 */
export function salesMapView(map: SalesMap, detailed: boolean): SalesMapView {
  const sums = new Map<string, Sum>()
  for (const pc6 of map.areas) {
    const postcode = pc6.postcode.slice(0, 4)
    let sum = sums.get(postcode)
    if (!sum) {
      sum = {
        area: { postcode, city: "", lastSoldOn: pc6.lastSoldOn, sold: 0, recruiters: [] },
        cities: new Map(),
        recruiters: new Map(),
      }
      sums.set(postcode, sum)
    }
    sum.area.sold += pc6.sold
    if (pc6.lastSoldOn > sum.area.lastSoldOn) sum.area.lastSoldOn = pc6.lastSoldOn
    if (pc6.city) sum.cities.set(pc6.city, (sum.cities.get(pc6.city) ?? 0) + pc6.sold)
    for (const r of pc6.recruiters) sum.recruiters.set(r.recruiter, (sum.recruiters.get(r.recruiter) ?? 0) + r.sold)
  }

  const maxSold = Math.max(0, ...[...sums.values()].map((s) => s.area.sold))
  const areas: MapArea[] = [...sums.values()]
    .map(({ area, cities, recruiters }) => {
      const shown = { postcode: area.postcode, city: mostOf(cities) ?? "", lastSoldOn: area.lastSoldOn }
      const level = levelOf(area.sold, maxSold)
      if (!detailed) return { ...shown, level }
      return {
        ...shown,
        level,
        sold: area.sold,
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

/**
 * 1 to LEVELS for `sold` sales when the busiest area has `maxSold`. On a log scale, so one busy area does not push
 * all others into the lightest shade.
 */
export function levelOf(sold: number, maxSold: number): number {
  if (maxSold <= 1) return LEVELS
  return 1 + Math.round(((LEVELS - 1) * Math.log(sold)) / Math.log(maxSold))
}

/** The key with the highest count; ties go to the alphabetically first. */
function mostOf(counts: Map<string, number>): string | undefined {
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
}
