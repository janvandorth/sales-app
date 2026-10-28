import { addDays, formatDay, today } from "../dashboard/periods"

/** How far back the list goes: today and the 31 days before it. */
export const MAX_DAYS_BACK = 31

const WEEKDAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"]

/** Start and end (exclusive) of a day on the phone's calendar, as ISO timestamps for the `received` column. */
export function dayRange(date: string): { from: string; to: string } {
  return {
    from: new Date(`${date}T00:00:00`).toISOString(),
    to: new Date(`${addDays(date, 1)}T00:00:00`).toISOString(),
  }
}

/** "Vandaag", "Gisteren" or "Zaterdag". */
export function dayTitle(date: string, now = today()): string {
  if (date === now) return "Vandaag"
  if (date === addDays(now, -1)) return "Gisteren"
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
  return weekday.charAt(0).toUpperCase() + weekday.slice(1)
}

/** "di 13 okt". */
export function shortDate(date: string): string {
  return `${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()].slice(0, 2)} ${formatDay(date)}`
}

/** "09:26" on the phone's clock. */
export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
}

/** The day on the phone's calendar a timestamp falls on, yyyy-MM-dd. */
export function localDate(timestamp: string): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
