// Pure formatting helpers used by the edge functions; no Deno APIs so they are unit-testable with Vitest.

/** "DEN HAAG" -> "Den Haag", "'S-GRAVENHAGE" -> "'s-Gravenhage" */
export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, separator: string, letter: string) => separator + letter.toUpperCase())
    .replace(/^'S-/i, "'s-")
}

/** "29-09-2026 14:05:31" in Dutch local time. */
export function formatDutchDateTime(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .format(date)
    .replace(",", "")
    .replace(/\s+/, " ")
}

/** ISO date "2026-09-29" -> "29-09-2026". */
export function formatDutchDate(isoDate: string): string {
  return isoDate.split("-").reverse().join("-")
}
