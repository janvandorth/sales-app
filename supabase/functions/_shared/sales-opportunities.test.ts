import { describe, expect, it } from "vitest"
import { LEVELS } from "./sales-map-view.ts"
import {
  opportunitiesView,
  opportunityStreetsView,
  type OpportunityAreas,
  type OpportunityStreets,
} from "./sales-opportunities.ts"

const areas: OpportunityAreas = {
  statistics: "CBS kerncijfers per postcode 2025 (v1)",
  lowBelow: 285,
  highFrom: 450,
  customersCountedAt: "2026-10-28T06:00:00",
  areas: [
    { postcode: "3811", households: 400, customers: 40, open: 360 },
    { postcode: "3812", households: 100, customers: 100, open: 0 },
    { postcode: "3813", households: 30, customers: 3, open: 27 },
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

  it("gives a shade by open households and the numbers with the share that are customers", () => {
    expect(view.areas[0]).toEqual({
      postcode: "3811",
      level: LEVELS,
      households: 400,
      customers: 40,
      open: 360,
      share: 0.1,
    })
    expect(view).toMatchObject({ detailed: true, lowBelow: 285, highFrom: 450 })
  })

  it("leaves out areas where nothing is open", () => {
    expect(view.areas.map((a) => a.postcode)).toEqual(["3811", "3813"])
  })
})

describe("opportunitiesView for a recruiter", () => {
  it("gives only the shade per area, no number of any kind", () => {
    expect(opportunitiesView(areas, false).areas).toEqual([
      { postcode: "3811", level: LEVELS },
      { postcode: "3813", level: 3 },
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
