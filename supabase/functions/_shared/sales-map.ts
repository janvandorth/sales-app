// Shared between the sales-map edge function and the web app: the map's request and the sales per postcode that
// come from ZMAdmin (Contracts API, GET .../Sales/2026.1/Map). No Deno APIs here.
import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum")

export const salesMapRequestSchema = z.object({
  /** First sale day, inclusive (yyyy-MM-dd). */
  from: isoDate,
  /** Last sale day, inclusive (yyyy-MM-dd). */
  to: isoDate,
})

export type SalesMapRequest = z.input<typeof salesMapRequestSchema>

/** The Contracts API's answer: every sale in the period per full postcode, cancelled ones included. */
export const salesMapSchema = z.object({
  salesEnteredUntil: z.string().nullable(),
  /** One row per PC6 with a sale, e.g. "1234AB". The app sums them to PC5 and PC4. */
  areas: z.array(
    z.object({
      postcode: z.string().regex(/^\d{4}[A-Z]{2}$/),
      city: z.string(),
      sold: z.number().int(),
      lastSoldOn: isoDate,
      recruiters: z.array(z.object({ recruiter: z.string(), sold: z.number().int() })),
    }),
  ),
  /** Sales whose customer has no valid postcode, so they are not on the map. */
  unplaced: z.number().int(),
  recruiters: z.array(z.object({ number: z.string(), name: z.string() })),
})

export type SalesMap = z.infer<typeof salesMapSchema>
export type SalesMapArea = SalesMap["areas"][number]

export type SalesMapResponse = {
  /** True when the Contracts API is not configured and the areas are made up. */
  demo: boolean
  map: SalesMap
}
