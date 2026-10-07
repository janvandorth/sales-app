// Shared between the kpi edge function and the web app: the dashboard's request and the sales statistics that come
// from ZMAdmin (Contracts API, GET .../Sales/2026.1/Stats). No Deno APIs here.
import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum")

export const kpiRequestSchema = z.object({
  /** First sale day, inclusive (yyyy-MM-dd). */
  from: isoDate,
  /** Last sale day, inclusive (yyyy-MM-dd). */
  to: isoDate,
  /** Admins only: a recruiter code, or null for the whole team. Ignored for recruiters (always their own). */
  wervernr: z.string().trim().max(20).nullish(),
})

export type KpiRequest = z.input<typeof kpiRequestSchema>

/**
 * The Contracts API's answer. Dates without a time are yyyy-MM-dd; timestamps are ZMAdmin's local (Dutch) time
 * without a zone, e.g. "2026-10-02T09:26:35.37".
 */
export const salesStatsSchema = z.object({
  /** When the most recent cancellation was entered: cancellations of later sales are certainly still missing. */
  cancellationsEnteredUntil: z.string().nullable(),
  salesEnteredUntil: z.string().nullable(),
  /** Per sale day and recruiter; a cancellation counts on the day of the sale. */
  days: z.array(
    z.object({ date: isoDate, recruiter: z.string(), sold: z.number().int(), cancelled: z.number().int() }),
  ),
  recruiters: z.array(z.object({ number: z.string(), name: z.string() })),
  /** One recruiter only (empty for the team), newest cancellation first. */
  cancellations: z.array(
    z.object({
      regNr: z.string(),
      name: z.string(),
      city: z.string(),
      soldOn: isoDate,
      cancelledOn: z.string().nullable(),
      reason: z.string(),
      detail: z.string(),
    }),
  ),
  /** Reasons of the cancelled sales per sale day, so they follow the selected week or month. */
  reasons: z.array(z.object({ date: isoDate, reason: z.string(), count: z.number().int() })),
})

export type SalesStats = z.infer<typeof salesStatsSchema>
export type SalesStatsDay = SalesStats["days"][number]
export type SalesStatsCancellation = SalesStats["cancellations"][number]
export type SalesStatsReason = SalesStats["reasons"][number]

export type KpiResponse = {
  /** True when the Contracts API is not configured and the numbers are made up. */
  demo: boolean
  /** Whose numbers these are; null = the whole team (admins only). */
  wervernr: string | null
  stats: SalesStats
}
