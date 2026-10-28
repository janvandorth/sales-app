import { describe, expect, it } from "vitest"
import type { SalesMap, SalesPc6 } from "./sales-map.ts"
import { ageIn, LEVELS, levelFrom, salesMapView, salesStreetsView, streetThresholds } from "./sales-map-view.ts"

// 90 days: 3811's newest sale (20 October) is 7 days before the end, 3812's (5 October) 22.
const FROM = "2026-07-30"
const TO = "2026-10-27"

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
  // As the API computes them for streets with 1, 2, 3 and 4 sales.
  streetThresholds: [2, 3, 4, 4],
}

describe("salesMapView for an admin", () => {
  const view = salesMapView(map, true, FROM, TO)

  it("sums PC6 postcodes into PC4 with the newest sale, the main city and who sold there", () => {
    expect(view.areas[0]).toEqual({
      postcode: "3811",
      city: "Amersfoort",
      sold: 6,
      bestStreetSold: 3,
      level: 1,
      lastSoldOn: "2026-10-20",
      age: 7 / 90,
      recruiters: [
        { recruiter: "0212BB", sold: 3 },
        { recruiter: "0618BB", sold: 3 },
      ],
    })
    expect(view.areas.map((a) => a.postcode)).toEqual(["3811", "3812"])
  })

  it("shades an area by its busiest street, ranked against the busiest streets of the other areas", () => {
    // 3811 sold 6 in all but 3 at most in one street; 3812 sold 4, all in one street, and is darker.
    expect(view.areas.map((a) => [a.postcode, a.level])).toEqual([
      ["3811", 1],
      ["3812", 2],
    ])
  })

  it("keeps the unplaced sales and the recruiter names", () => {
    expect(view).toMatchObject({ detailed: true, unplaced: 2 })
    expect(view.recruiters).toHaveLength(3)
  })
})

describe("salesMapView for a recruiter", () => {
  const view = salesMapView(map, false, FROM, TO)

  it("gives where, when and a shade for how much, but no count of any kind", () => {
    expect(view).toEqual({
      detailed: false,
      areas: [
        { postcode: "3811", city: "Amersfoort", lastSoldOn: "2026-10-20", age: 7 / 90, level: 1 },
        { postcode: "3812", city: "Amersfoort", lastSoldOn: "2026-10-05", age: 22 / 90, level: 2 },
      ],
      recruiters: [],
    })
  })
})

describe("salesStreetsView", () => {
  const pc6: SalesPc6 = {
    streetThresholds: [2, 3, 4, 4],
    streets: [{ ...area("3812AA", 4, "2026-10-05", [["1210AP", 4]]), geometry: { type: "Polygon", coordinates: [] } }],
  }

  it("gives each street its own shade and age as a GeoJSON feature, on the scale of its area", () => {
    const view = salesStreetsView(pc6, true, FROM, TO)

    expect(view.features.features[0]).toEqual({
      type: "Feature",
      properties: { postcode: "3812AA", level: 3, age: 22 / 90 },
      geometry: { type: "Polygon", coordinates: [] },
    })
    expect(view.streets[0]).toMatchObject({ sold: 4, recruiters: [{ recruiter: "1210AP", sold: 4 }] })
  })

  it("gives a recruiter the street and its newest sale, no count", () => {
    expect(salesStreetsView(pc6, false, FROM, TO).streets).toEqual([
      { postcode: "3812AA", city: "Amersfoort", lastSoldOn: "2026-10-05" },
    ])
  })
})

describe("levelFrom", () => {
  const thresholds = [10, 20, 40, 80]

  it.each([
    [1, 1], // the bottom half
    [10, 1], // at the median, not above it
    [11, 2],
    [21, 3], // top quarter
    [41, 4], // top tenth
    [81, LEVELS], // top 3%
  ])("%s ranks %s", (value, level) => {
    expect(levelFrom(value, thresholds)).toBe(level)
  })

  it("puts everything in the lightest shade when there is nothing to compare with", () => {
    expect(levelFrom(5, [])).toBe(1)
  })
})

describe("streetThresholds", () => {
  it("takes the median and the top 25%, 10% and 3% by nearest rank, as the API does", () => {
    expect(streetThresholds(Array.from({ length: 100 }, (_, i) => i + 1))).toEqual([50, 75, 90, 97])
    expect(streetThresholds([0, -1])).toEqual([])
  })
})

describe("ageIn", () => {
  it.each([
    ["2026-10-27", 0], // the last day
    ["2026-10-18", 0.1], // 9 of 90 days
    ["2026-07-29", 1], // before the period: as old as its first day
    ["2026-10-28", 0], // a sale dated after the period by mistake
  ])("a newest sale on %s in 30 July to 27 October is %s", (date, expected) => {
    expect(ageIn(date, FROM, TO)).toBeCloseTo(expected, 5)
  })
})

describe("salesMapView without sales", () => {
  it("gives no areas", () => {
    expect(salesMapView({ ...map, areas: [], unplaced: 0 }, true, FROM, TO).areas).toEqual([])
  })
})
