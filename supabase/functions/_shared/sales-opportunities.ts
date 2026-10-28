// Shared between the sales-opportunities edge function and the web app: where households are still "for grabs",
// from the Contracts API (GET .../Sales/2026.1/Opportunities, .../Opportunities/{pc4}, .../Pc5 and .../Pc6).
// The API counts per street (PC6): CBS households minus our active customers, for the streets of a WOZ band. A PC4
// is shaded by its best street, ranked against the best streets of all other areas, so a dark area is one with a
// street worth zooming in to; zoomed in, each street is ranked among all streets. Everyone gets the shades; the
// numbers only admins. No Deno APIs here.
import { z } from "zod"
import { bboxSchema } from "./sales-map.ts"
import { levelFrom, streetThresholds, type DetailView } from "./sales-map-view.ts"

export const WOZ_BANDS = ["low", "mid", "high", "all"] as const
export type WozBand = (typeof WOZ_BANDS)[number]

export const salesOpportunitiesRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("areas"), woz: z.enum(WOZ_BANDS) }),
  z.object({ action: z.literal("streets"), woz: z.enum(WOZ_BANDS), pc4: z.string().regex(/^[1-9]\d{3}$/) }),
  z.object({ action: z.literal("pc5"), woz: z.enum(WOZ_BANDS), bbox: bboxSchema }),
  z.object({ action: z.literal("pc6"), woz: z.enum(WOZ_BANDS), bbox: bboxSchema }),
])

export type SalesOpportunitiesRequest = z.input<typeof salesOpportunitiesRequestSchema>

/** The Contracts API's areas. */
export const opportunityAreasSchema = z.object({
  statistics: z.string(),
  lowBelow: z.number().int(),
  highFrom: z.number().int(),
  customersCountedAt: z.string().nullable(),
  /** Open households of a street at the 50th, 75th, 90th and 97th percentile of all streets with any open. */
  streetThresholds: z.array(z.number().int()),
  areas: z.array(
    z.object({
      postcode: z.string().regex(/^\d{4}$/),
      households: z.number().int(),
      customers: z.number().int(),
      open: z.number().int(),
      bestStreetOpen: z.number().int(),
    }),
  ),
})

const street = z.object({
  postcode: z.string(),
  streets: z.string(),
  city: z.string(),
  households: z.number().int(),
  customers: z.number().int(),
  open: z.number().int(),
  woz: z.number().int().nullable(),
})

/** The Contracts API's streets of one PC4, most open households first. */
export const opportunityStreetsSchema = z.object({ postcode: z.string(), streets: z.array(street) })

/** The Contracts API's streets in a view with open households. Their outlines are vector tiles in the app. */
export const opportunityPc6Schema = z.object({
  streetThresholds: z.array(z.number().int()),
  streets: z.array(street.omit({ streets: true, city: true })),
})

/** The Contracts API's PC5 areas in a view with open households, and the national thresholds by best street. */
export const opportunityPc5Schema = z.object({
  areaThresholds: z.array(z.number().int()),
  areas: z.array(
    z.object({
      postcode: z.string().regex(/^\d{4}[A-Z]$/),
      households: z.number().int(),
      customers: z.number().int(),
      open: z.number().int(),
      bestStreetOpen: z.number().int(),
    }),
  ),
})

export type OpportunityAreas = z.infer<typeof opportunityAreasSchema>
export type OpportunityStreets = z.infer<typeof opportunityStreetsSchema>
export type OpportunityPc5 = z.infer<typeof opportunityPc5Schema>
export type OpportunityPc6 = z.infer<typeof opportunityPc6Schema>

/** One PC4 on the map. The numbers only for admins. */
export type OpportunityArea = {
  postcode: string
  /** 1 to LEVELS: how its best street ranks against the best streets of the other areas. */
  level: number
  households?: number
  customers?: number
  open?: number
  /** Open households in its best street. */
  bestStreetOpen?: number
  /** Share of the households that are a customer, 0 to 1. */
  share?: number
}

export type OpportunitiesView = {
  detailed: boolean
  /** Average WOZ (thousands of euros) below which a street is low, and from which it is high. */
  lowBelow: number
  highFrom: number
  /** Where the households and WOZ values come from, for the map's credits. */
  statistics: string
  areas: OpportunityArea[]
}

/** One street. The numbers only for admins; its name only where the API looked it up (the ranked list). */
export type OpportunityStreet = {
  postcode: string
  streets?: string
  city?: string
  households?: number
  customers?: number
  open?: number
  woz?: number | null
}

/** One PC5 area or street of the zoomed-in map and its shade. The numbers only for admins. */
export type OpportunityDetail = {
  postcode: string
  /** 1 to LEVELS, on the national scale of its kind (PC5 by its best street, a street by itself). */
  level: number
  households?: number
  customers?: number
  open?: number
  /** PC5 only: open households in its best street. */
  bestStreetOpen?: number
  /** Streets only: average WOZ value in thousands. */
  woz?: number | null
}

export type OpportunityStreetsView = { detailed: boolean; postcode: string; streets: OpportunityStreet[] }

/** The function's answer: areas, the ranked streets of one area, or the PC5 areas or streets in a view. */
export type SalesOpportunitiesResponse =
  | { demo: boolean; action: "areas"; view: OpportunitiesView }
  | { demo: boolean; action: "streets"; view: OpportunityStreetsView }
  | { demo: boolean; action: "pc5" | "pc6"; view: DetailView<OpportunityDetail> }

/** Each area by its best street. An area without open households in the band is left out: nothing to win there. */
export function opportunitiesView(api: OpportunityAreas, detailed: boolean): OpportunitiesView {
  const open = api.areas.filter((a) => a.open > 0)
  const areaThresholds = streetThresholds(open.map((a) => a.bestStreetOpen))
  return {
    detailed,
    lowBelow: api.lowBelow,
    highFrom: api.highFrom,
    statistics: api.statistics,
    areas: open.map((a) => {
      const level = levelFrom(a.bestStreetOpen, areaThresholds)
      if (!detailed) return { postcode: a.postcode, level }
      const share = a.households > 0 ? Math.min(1, a.customers / a.households) : 0
      const { households, customers, open, bestStreetOpen } = a
      return { postcode: a.postcode, level, households, customers, open, bestStreetOpen, share }
    }),
  }
}

/** The streets in the API's order (most open first); recruiters get only where, not how many. */
export function opportunityStreetsView(api: OpportunityStreets, detailed: boolean): OpportunityStreetsView {
  return {
    detailed,
    postcode: api.postcode,
    streets: api.streets.map((s) => (detailed ? s : { postcode: s.postcode, streets: s.streets, city: s.city })),
  }
}

/** The streets in a view, each by its own open households on the national street scale. */
export function opportunityPc6View(api: OpportunityPc6, detailed: boolean): DetailView<OpportunityDetail> {
  return {
    detailed,
    level: "pc6",
    areas: api.streets.map(({ postcode, households, customers, open, woz }) => {
      const level = levelFrom(open, api.streetThresholds)
      return detailed ? { postcode, level, households, customers, open, woz } : { postcode, level }
    }),
  }
}

/** The PC5 areas in a view, each by its best street ranked against all PC5 areas in the country. */
export function opportunityPc5View(api: OpportunityPc5, detailed: boolean): DetailView<OpportunityDetail> {
  return {
    detailed,
    level: "pc5",
    areas: api.areas.map(({ postcode, households, customers, open, bestStreetOpen }) => {
      const level = levelFrom(bestStreetOpen, api.areaThresholds)
      return detailed ? { postcode, level, households, customers, open, bestStreetOpen } : { postcode, level }
    }),
  }
}
