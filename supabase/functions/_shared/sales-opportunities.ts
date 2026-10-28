// Shared between the sales-opportunities edge function and the web app: where households are still "for grabs",
// from the Contracts API (GET .../Sales/2026.1/Opportunities and .../Opportunities/{pc4}). The API counts per street
// (PC6): CBS households minus our active customers, for the streets of a WOZ band, and adds them up per PC4. This
// file turns that into what the map shows: a shade per PC4 for everyone, the numbers for admins only.
// No Deno APIs here.
import { z } from "zod"
import { levelOf } from "./sales-map-view.ts"

export const WOZ_BANDS = ["low", "mid", "high", "all"] as const
export type WozBand = (typeof WOZ_BANDS)[number]

export const salesOpportunitiesRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("areas"), woz: z.enum(WOZ_BANDS) }),
  z.object({ action: z.literal("streets"), woz: z.enum(WOZ_BANDS), pc4: z.string().regex(/^[1-9]\d{3}$/) }),
])

export type SalesOpportunitiesRequest = z.input<typeof salesOpportunitiesRequestSchema>

/** The Contracts API's areas. */
export const opportunityAreasSchema = z.object({
  statistics: z.string(),
  lowBelow: z.number().int(),
  highFrom: z.number().int(),
  customersCountedAt: z.string().nullable(),
  areas: z.array(
    z.object({
      postcode: z.string().regex(/^\d{4}$/),
      households: z.number().int(),
      customers: z.number().int(),
      open: z.number().int(),
    }),
  ),
})

/** The Contracts API's streets of one PC4, most open households first. */
export const opportunityStreetsSchema = z.object({
  postcode: z.string(),
  streets: z.array(
    z.object({
      postcode: z.string(),
      streets: z.string(),
      city: z.string(),
      households: z.number().int(),
      customers: z.number().int(),
      open: z.number().int(),
      woz: z.number().int().nullable(),
    }),
  ),
})

export type OpportunityAreas = z.infer<typeof opportunityAreasSchema>
export type OpportunityStreets = z.infer<typeof opportunityStreetsSchema>

/** One PC4 on the map. The numbers only for admins. */
export type OpportunityArea = {
  postcode: string
  /** 1 (fewest open households) to LEVELS (as many as the area with the most). */
  level: number
  households?: number
  customers?: number
  open?: number
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

/** One street of a PC4. The numbers only for admins. */
export type OpportunityStreet = {
  postcode: string
  streets: string
  city: string
  households?: number
  customers?: number
  open?: number
  woz?: number | null
}

export type OpportunityStreetsView = { detailed: boolean; postcode: string; streets: OpportunityStreet[] }

/** The function's answer: areas or streets, as asked. */
export type SalesOpportunitiesResponse =
  | { demo: boolean; action: "areas"; view: OpportunitiesView }
  | { demo: boolean; action: "streets"; view: OpportunityStreetsView }

/**
 * Shades by open households, on a log scale up to the area with the most. An area without open households in the
 * band is left out: nothing to win there.
 */
export function opportunitiesView(api: OpportunityAreas, detailed: boolean): OpportunitiesView {
  const withOpen = api.areas.filter((a) => a.open > 0)
  const maxOpen = Math.max(0, ...withOpen.map((a) => a.open))
  return {
    detailed,
    lowBelow: api.lowBelow,
    highFrom: api.highFrom,
    statistics: api.statistics,
    areas: withOpen.map((a) => {
      const level = levelOf(a.open, maxOpen)
      if (!detailed) return { postcode: a.postcode, level }
      const share = a.households > 0 ? Math.min(1, a.customers / a.households) : 0
      return { postcode: a.postcode, level, households: a.households, customers: a.customers, open: a.open, share }
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
