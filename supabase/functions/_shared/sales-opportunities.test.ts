import { describe, expect, it } from "vitest"
import { LEVELS } from "./sales-map-view.ts"
import {
  opportunitiesView,
  opportunityPc5Schema,
  opportunityPc5View,
  opportunityPc6View,
  opportunityStreetsView,
  type OpportunityAreas,
  type OpportunityPc5,
  type OpportunityPc6,
  type OpportunityStreets,
} from "./sales-opportunities.ts"

const areas: OpportunityAreas = {
  statistics: "CBS kerncijfers per postcode 2025 (v1)",
  lowBelow: 285,
  highFrom: 450,
  customersCountedAt: "2026-10-28T06:00:00",
  streetThresholds: [10, 20, 40, 80],
  areas: [
    // Big, but its open households are spread thin: no single street stands out.
    { postcode: "3811", households: 4000, customers: 40, open: 3960, bestStreetOpen: 15 },
    { postcode: "3812", households: 100, customers: 100, open: 0, bestStreetOpen: 0 },
    // Small, with one street of 90 open households: worth zooming in to.
    { postcode: "3813", households: 300, customers: 3, open: 297, bestStreetOpen: 90 },
  ],
}

const streets: OpportunityStreets = {
  postcode: "3811",
  streets: [
    { postcode: "3811AA", streets: "Kerkstraat", city: "Amersfoort", households: 40, customers: 2, open: 38, woz: 240 },
    { postcode: "3811AB", streets: "Molenweg", city: "Amersfoort", households: 20, customers: 0, open: 20, woz: 260 },
  ],
}

describe("opportunitiesView for an admin", () => {
  const view = opportunitiesView(areas, true)

  it("ranks an area by its best street against the other areas, with the numbers and the share that are customers", () => {
    expect(view.areas).toEqual([
      { postcode: "3811", level: 1, households: 4000, customers: 40, open: 3960, bestStreetOpen: 15, share: 0.01 },
      { postcode: "3813", level: 2, households: 300, customers: 3, open: 297, bestStreetOpen: 90, share: 0.01 },
    ])
    expect(view).toMatchObject({ detailed: true, lowBelow: 285, highFrom: 450 })
  })
})

describe("opportunitiesView for a recruiter", () => {
  it("gives only the shade per area, no number of any kind, and leaves out areas with nothing open", () => {
    expect(opportunitiesView(areas, false).areas).toEqual([
      { postcode: "3811", level: 1 },
      { postcode: "3813", level: 2 },
    ])
  })
})

describe("opportunityStreetsView", () => {
  it("keeps the numbers for an admin", () => {
    expect(opportunityStreetsView(streets, true).streets[0]).toEqual(streets.streets[0])
  })

  it("gives a recruiter the streets in the same order without numbers", () => {
    expect(opportunityStreetsView(streets, false)).toEqual({
      detailed: false,
      postcode: "3811",
      streets: [
        { postcode: "3811AA", streets: "Kerkstraat", city: "Amersfoort" },
        { postcode: "3811AB", streets: "Molenweg", city: "Amersfoort" },
      ],
    })
  })
})

describe("opportunityPc6View", () => {
  const pc6: OpportunityPc6 = {
    streetThresholds: [10, 20, 40, 80],
    streets: [{ postcode: "3811AA", households: 100, customers: 10, open: 90, woz: 250 }],
  }

  it("shades each street on the national street scale", () => {
    expect(opportunityPc6View(pc6, true).areas[0]).toEqual({
      postcode: "3811AA",
      level: LEVELS,
      households: 100,
      customers: 10,
      open: 90,
      woz: 250,
    })
  })

  it("gives a recruiter only the postcode and shade of each street", () => {
    expect(opportunityPc6View(pc6, false).areas).toEqual([{ postcode: "3811AA", level: LEVELS }])
  })
})

describe("opportunityPc5View", () => {
  const pc5: OpportunityPc5 = {
    areaThresholds: [10, 20, 40, 80],
    areas: [
      {
        postcode: "3811A",
        households: 300,
        customers: 10,
        open: 290,
        bestStreetOpen: 30,
      },
    ],
  }

  it("accepts the API's PC5 postcodes", () => {
    expect(opportunityPc5Schema.safeParse(pc5).success).toBe(true)
  })

  it("shades each PC5 area by its best street", () => {
    const view = opportunityPc5View(pc5, true)

    expect(view.level).toBe("pc5")
    expect(view.areas[0]).toEqual({
      postcode: "3811A",
      level: 3,
      households: 300,
      customers: 10,
      open: 290,
      bestStreetOpen: 30,
    })
  })

  it("gives a recruiter only the postcode and shade of each area", () => {
    expect(opportunityPc5View(pc5, false).areas).toEqual([{ postcode: "3811A", level: 3 }])
  })
})
