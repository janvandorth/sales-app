import type { SalesMapArea } from "@shared/sales-map"
import { LEVELS, type Level } from "./levels"

/** One postcode area at any level, summed from the PC6 areas in it. */
export type MapArea = {
  /** "1234", "1234A" or "1234AB". */
  postcode: string
  city: string
  sold: number
  lastSoldOn: string
  /** Most sales first. */
  recruiters: { recruiter: string; sold: number }[]
}

export type MapAreas = Record<Level, Map<string, MapArea>>

/**
 * The endpoint's PC6 areas summed to every level: a PC5 or PC4 area holds the sales of every PC6 that starts with
 * it. Its city is the one most of those sales were at.
 */
export function aggregate(areas: SalesMapArea[]): MapAreas {
  const result = {} as MapAreas
  for (const { level, length } of LEVELS) {
    const sums = new Map<string, { area: MapArea; cities: Map<string, number>; recruiters: Map<string, number> }>()
    for (const pc6 of areas) {
      const postcode = pc6.postcode.slice(0, length)
      let sum = sums.get(postcode)
      if (!sum) {
        sum = {
          area: { postcode, city: "", sold: 0, lastSoldOn: pc6.lastSoldOn, recruiters: [] },
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

    result[level] = new Map(
      [...sums].map(([postcode, sum]) => [
        postcode,
        {
          ...sum.area,
          city: mostOf(sum.cities) ?? "",
          recruiters: [...sum.recruiters]
            .map(([recruiter, sold]) => ({ recruiter, sold }))
            .sort((a, b) => b.sold - a.sold || a.recruiter.localeCompare(b.recruiter)),
        },
      ]),
    )
  }
  return result
}

/** The key with the highest count; ties go to the alphabetically first. */
function mostOf(counts: Map<string, number>): string | undefined {
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
}
