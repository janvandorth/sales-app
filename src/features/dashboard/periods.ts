import type { SalesStatsDay, SalesStatsReason } from "@shared/kpi"

// Dates are handled as yyyy-MM-dd strings and computed in UTC, so the time zone of the phone never shifts a day.

export type Granularity = "week" | "month"

export type Period = {
  key: string
  /** First and last day, inclusive (yyyy-MM-dd). */
  start: string
  end: string
  sold: number
  cancelled: number
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
const MONTHS_LONG = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
]

/**
 * Every week or month whose first day is on or after `from` and that has started by `to`, oldest first, also
 * when nothing was sold. A week starts on Monday (ISO).
 */
export function buildPeriods(days: SalesStatsDay[], granularity: Granularity, from: string, to: string): Period[] {
  const periods: Period[] = []
  const byKey = new Map<string, Period>()
  for (let start = firstStartOnOrAfter(from, granularity); start <= to; start = nextStart(start, granularity)) {
    const period = {
      key: periodKey(start, granularity),
      start,
      end: periodEnd(start, granularity),
      sold: 0,
      cancelled: 0,
    }
    periods.push(period)
    byKey.set(period.key, period)
  }
  for (const day of days) {
    const period = byKey.get(periodKey(day.date, granularity))
    if (!period) continue
    period.sold += day.sold
    period.cancelled += day.cancelled
  }
  return periods
}

/** "2026-W37" or "2026-09". */
export function periodKey(date: string, granularity: Granularity): string {
  if (granularity === "month") return date.slice(0, 7)
  const { year, week } = isoWeek(date)
  return `${year}-W${String(week).padStart(2, "0")}`
}

export function periodStart(date: string, granularity: Granularity): string {
  if (granularity === "month") return `${date.slice(0, 7)}-01`
  const day = parse(date)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return format(day)
}

export function addDays(date: string, days: number): string {
  const day = parse(date)
  day.setUTCDate(day.getUTCDate() + days)
  return format(day)
}

export function addMonths(date: string, months: number): string {
  const day = parse(`${date.slice(0, 7)}-01`)
  day.setUTCMonth(day.getUTCMonth() + months)
  return format(day)
}

/** Months fetched per request; "Eerder" loads the next block further back. */
const WINDOW_MONTHS = 12
/** Today on the phone's calendar, yyyy-MM-dd. */
export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/** Page 0 covers the current month and the eleven before it; every next page the twelve months before that. */
export function kpiWindow(page: number, until: string): { from: string; to: string } {
  const firstFrom = addMonths(until, -(WINDOW_MONTHS - 1))
  return {
    from: addMonths(firstFrom, -WINDOW_MONTHS * page),
    to: page === 0 ? until : addDays(addMonths(firstFrom, -WINDOW_MONTHS * (page - 1)), -1),
  }
}

/** The reasons of the sales in one period (or all of them, for null), most frequent first. */
export function reasonsIn(
  reasons: SalesStatsReason[],
  period: Pick<Period, "start" | "end"> | null,
): { reason: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of reasons) {
    if (period && !(r.date && r.date >= period.start && r.date <= period.end)) continue
    counts.set(r.reason, (counts.get(r.reason) ?? 0) + r.count)
  }
  return [...counts]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "nl"))
}

/** Short label under a bar: "wk 37" or "sep". January also shows the year. */
export function shortLabel(period: Period, granularity: Granularity): string {
  if (granularity === "week") return `wk ${Number(period.key.slice(6))}`
  const month = Number(period.start.slice(5, 7)) - 1
  return month === 0 ? `jan '${period.start.slice(2, 4)}` : MONTHS[month]
}

/** "week 37" or "september 2026". */
export function periodTitle(period: Period, granularity: Granularity): string {
  return granularity === "week"
    ? `week ${Number(period.key.slice(6))}`
    : `${MONTHS_LONG[Number(period.start.slice(5, 7)) - 1]} ${period.start.slice(0, 4)}`
}

/** "31 aug – 6 sep 2026" for a week; empty for a month, whose title already says it all. */
export function periodDates(period: Period, granularity: Granularity): string {
  if (granularity === "month") return ""
  const sameMonth = period.start.slice(5, 7) === period.end.slice(5, 7)
  return `${formatDay(period.start, !sameMonth)} – ${formatDay(period.end)} ${period.end.slice(0, 4)}`
}

/** "week 37 · 7 – 13 sep 2026" or "september 2026". */
export function longLabel(period: Period, granularity: Granularity): string {
  const dates = periodDates(period, granularity)
  return dates ? `${periodTitle(period, granularity)} · ${dates}` : periodTitle(period, granularity)
}

/** "7 sep" (or "7" without the month). */
export function formatDay(date: string, withMonth = true): string {
  const day = String(Number(date.slice(8, 10)))
  return withMonth ? `${day} ${MONTHS[Number(date.slice(5, 7)) - 1]}` : day
}

const WEEKDAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"]

/** ZMAdmin's local timestamp "2026-10-02T09:26:35.37" as "vr 2 okt 2026, 09:26". */
export function formatTimestamp(timestamp: string): string {
  const date = timestamp.slice(0, 10)
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
  const time = timestamp.slice(11, 16)
  return `${weekday} ${formatDay(date)} ${date.slice(0, 4)}${time ? `, ${time}` : ""}`
}

/** Share of the sales that has been cancelled, 0..1; null when nothing was sold. */
export function cancelRate(period: Pick<Period, "sold" | "cancelled">): number | null {
  return period.sold > 0 ? period.cancelled / period.sold : null
}

/** "25%", or "–" when nothing was sold. */
export function formatRate(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`
}

/**
 * Most cancellations arrive in the first weeks after a sale. Until the office has entered cancellations up to
 * this many days after a period's last day, its numbers will still go up.
 */
export const SETTLE_DAYS = 28

/** True when cancellations for sales in this period are probably still coming in. */
export function isProvisional(period: Pick<Period, "end">, cancellationsEnteredUntil: string | null): boolean {
  if (!cancellationsEnteredUntil) return true
  return addDays(period.end, SETTLE_DAYS) > cancellationsEnteredUntil.slice(0, 10)
}

function isoWeek(date: string): { year: number; week: number } {
  const day = parse(date)
  // The Thursday of this week decides the year.
  day.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7))
  const year = day.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(year, 0, 4))
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7))
  return { year, week: 1 + Math.round((day.getTime() - firstThursday.getTime()) / (7 * 86_400_000)) }
}

function firstStartOnOrAfter(date: string, granularity: Granularity): string {
  const start = periodStart(date, granularity)
  return start < date ? nextStart(start, granularity) : start
}

function nextStart(start: string, granularity: Granularity): string {
  return granularity === "week" ? addDays(start, 7) : addMonths(start, 1)
}

function periodEnd(start: string, granularity: Granularity): string {
  return granularity === "week" ? addDays(start, 6) : addDays(addMonths(start, 1), -1)
}

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10)
}
