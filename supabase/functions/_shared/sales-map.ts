// Shared between the sales-map edge function and the web app: the map's request and the sales per postcode that
// come from ZMAdmin (Contracts API, GET .../Sales/2026.1/Map, .../Map/Pc5 and .../Map/Pc6). No Deno APIs here.
import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum")

/** The map's view, "minLon,minLat,maxLon,maxLat" in WGS84 degrees. */
export const bboxSchema = z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, "Ongeldig kaartbeeld")

export const salesMapRequestSchema = z.object({
  /** First sale day, inclusive (yyyy-MM-dd). */
  from: isoDate,
  /** Last sale day, inclusive (yyyy-MM-dd). */
  to: isoDate,
  /** With it: the PC5 areas or the streets (PC6, the default) in this view instead of the PC4 areas. */
  bbox: bboxSchema.optional(),
  level: z.enum(["pc5", "pc6"]).optional(),
})

export type SalesMapRequest = z.input<typeof salesMapRequestSchema>

const salesArea = z.object({
  postcode: z.string().regex(/^\d{4}[A-Z]{2}$/),
  city: z.string(),
  sold: z.number().int(),
  lastSoldOn: isoDate,
  recruiters: z.array(z.object({ recruiter: z.string(), sold: z.number().int() })),
})

/** The Contracts API's answer: every sale in the period per full postcode, cancelled ones included. */
export const salesMapSchema = z.object({
  salesEnteredUntil: z.string().nullable(),
  /** One row per PC6 with a sale, e.g. "1234AB". The function sums them to PC4. */
  areas: z.array(salesArea),
  /** Sales whose customer has no valid postcode, so they are not on the map. */
  unplaced: z.number().int(),
  recruiters: z.array(z.object({ number: z.string(), name: z.string() })),
  /** Sales of a street at the 50th, 75th, 90th and 97th percentile of all streets with a sale. */
  streetThresholds: z.array(z.number().int()),
})

/** The Contracts API's streets in a view with a sale. Their outlines are vector tiles in the app. */
export const salesPc6Schema = z.object({
  streetThresholds: z.array(z.number().int()),
  streets: z.array(salesArea),
})

/** The Contracts API's PC5 areas in a view with a sale, and the national thresholds by best street. */
export const salesPc5Schema = z.object({
  areaThresholds: z.array(z.number().int()),
  areas: z.array(salesArea.extend({ postcode: z.string().regex(/^\d{4}[A-Z]$/), bestStreetSold: z.number().int() })),
})

export type SalesMap = z.infer<typeof salesMapSchema>
export type SalesMapArea = SalesMap["areas"][number]
export type SalesPc5 = z.infer<typeof salesPc5Schema>
export type SalesPc6 = z.infer<typeof salesPc6Schema>
