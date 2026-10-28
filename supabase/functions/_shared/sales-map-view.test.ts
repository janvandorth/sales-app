import { describe, expect, it } from "vitest"
import type { SalesMap } from "./sales-map.ts"
import { LEVELS, levelOf, salesMapView } from "./sales-map-view.ts"

const area = (
  postcode: string,
  sold: number,
  lastSoldOn: string,
  recruiters: [string, number][],
  city = "Amersfoort",
) => ({ postcode, city, sold, lastSoldOn, recruiters: recruiters.map(([recruiter, n]) => ({ recruiter, sold: n })) })

const map: SalesMap = {
  salesEnteredUntil: "2026-10-27T12:00:00",
  areas: [
    area("3811AB", 2, "2026-10-01", [["0212BB", 2]]),
    area("3811AC", 3, "2026-10-20", [
      ["0212BB", 1],
      ["0618BB", 2],
    ]),
    area("3811BA", 1, "2026-09-15", [["0618BB", 1]], "Leusden"),
    area("3812AA", 4, "2026-10-05", [["1210AP", 4]]),
  ],
  unplaced: 2,
  recruiters: [
    { number: "0212BB", name: "Jan" },
    { number: "0618BB", name: "Sanne" },
    { number: "1210AP", name: "Mehmet" },
  ],
}

describe("salesMapView for an admin", () => {
  const view = salesMapView(map, true)

  it("sums PC6 postcodes into PC4 with the newest sale, the main city and who sold there", () => {
    expect(view.areas[0]).toEqual({
      postcode: "3811",
      city: "Amersfoort",
      sold: 6,
      level: LEVELS,
      lastSoldOn: "2026-10-20",
      recruiters: [
        { recruiter: "0212BB", sold: 3 },
        { recruiter: "0618BB", sold: 3 },
      ],
    })
    expect(view.areas.map((a) => a.postcode)).toEqual(["3811", "3812"])
  })

  it("keeps the unplaced sales and the recruiter names", () => {
    expect(view).toMatchObject({ detailed: true, unplaced: 2 })
    expect(view.recruiters).toHaveLength(3)
  })
})

describe("salesMapView for a recruiter", () => {
  const view = salesMapView(map, false)

  it("gives where, when and a shade for how much, but no count of any kind", () => {
    expect(view).toEqual({
      detailed: false,
      areas: [
        { postcode: "3811", city: "Amersfoort", lastSoldOn: "2026-10-20", level: 5 },
        { postcode: "3812", city: "Amersfoort", lastSoldOn: "2026-10-05", level: 4 },
      ],
      recruiters: [],
    })
  })
})

describe("levelOf", () => {
  it("runs from 1 for a single sale to LEVELS for the busiest area", () => {
    expect(levelOf(1, 40)).toBe(1)
    expect(levelOf(40, 40)).toBe(LEVELS)
  })

  it("grows on a log scale, so half the busiest is well past the middle shade", () => {
    expect(levelOf(20, 40)).toBe(4)
  })

  it("gives the darkest shade when no area has more than one sale", () => {
    expect(levelOf(1, 1)).toBe(LEVELS)
  })
})

describe("salesMapView without sales", () => {
  it("gives no areas", () => {
    expect(salesMapView({ ...map, areas: [], unplaced: 0 }, true).areas).toEqual([])
  })
})
