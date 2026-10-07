// Made-up sales statistics in the shape of the Contracts API, used until the stats endpoint is configured (and by
// the app's dev-only demo mode). Deterministic: the same day and recruiter always give the same numbers, so pages
// loaded separately fit together. No Deno APIs here.
import type { SalesStats, SalesStatsCancellation } from "./kpi.ts"

const DEMO_RECRUITERS = [
  { number: "0212BB", name: "Jan van Dorth", level: 3.2 },
  { number: "0618BB", name: "Sanne de Wit", level: 4.1 },
  { number: "1210AP", name: "Mehmet Kaya", level: 2.6 },
  { number: "1709DD", name: "Lotte Bakker", level: 3.6 },
  { number: "2107TD", name: "Daan Visser", level: 1.8 },
  { number: "2303GM", name: "Noor Hendriks", level: 2.9 },
]

// Roughly the mix in ZMAdmin's TerminationReasons.
const REASONS: [reason: string, weight: number, details: string[]][] = [
  ["Niet nodig", 22, [""]],
  ["Bedacht", 22, ["", "", "partner wilde het niet"]],
  ["Onbekend", 16, [""]],
  ["Geen gebruik", 7, [""]],
  ["Te duur", 7, ["", "vindt het te veel per maand"]],
  ["Verkeerd voorgelicht", 6, ["", "dacht dat het eenmalig was", "dacht dat het van de gemeente was"]],
  ["Partner niet eens", 4, [""]],
  ["Verhuizing", 4, ["huur", "buitenland", ""]],
  ["Anders", 3, ["al lid", "afstand", "wegens omstandigheden"]],
  ["Overleden", 2, [""]],
]

const INITIALS = [
  "A.",
  "B.",
  "C.J.",
  "D.",
  "E.M.",
  "F.",
  "G.",
  "H.A.",
  "J.",
  "K.",
  "L.",
  "M.",
  "N.",
  "P.J.",
  "R.",
  "S.",
  "T.",
  "W.",
]
const SURNAMES = [
  "de Vries",
  "Jansen",
  "de Boer",
  "Smit",
  "Mulder",
  "de Graaf",
  "Bos",
  "Vos",
  "Peters",
  "Dekker",
  "Meijer",
  "van Leeuwen",
  "Brouwer",
  "de Groot",
  "Willems",
  "Kok",
  "van Dam",
  "Prins",
]
const CITIES = [
  "Utrecht",
  "Amersfoort",
  "Zwolle",
  "Apeldoorn",
  "Deventer",
  "Ede",
  "Arnhem",
  "Nijmegen",
  "Hilversum",
  "Zeist",
]

/** Demo statistics for sale days `from`..`to` (yyyy-MM-dd), for one recruiter code or (null) the whole team. */
export function demoSalesStats(from: string, to: string, recruiter: string | null, now = new Date()): SalesStats {
  const recruiters = recruiter
    ? [DEMO_RECRUITERS.find((r) => r.number === recruiter) ?? { number: recruiter, name: "Demo werver", level: 3 }]
    : DEMO_RECRUITERS

  // The office is a few days behind: cancellations entered until 15:42 on the last weekday at least 3 days ago.
  const entered = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 3))
  while (entered.getUTCDay() === 0 || entered.getUTCDay() === 6) entered.setUTCDate(entered.getUTCDate() - 1)
  const enteredDay = toIso(entered)
  const today = toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))

  const days: SalesStats["days"] = []
  const cancellations: SalesStatsCancellation[] = []
  const reasonCounts = new Map<string, number>()

  for (let day = parseIso(from); toIso(day) <= to && toIso(day) <= today; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = toIso(day)
    const weekday = day.getUTCDay()
    if (weekday === 0) continue // Nobody works on Sunday.

    for (const r of recruiters) {
      const random = mulberry32(hash(`${date}|${r.number}`))
      if (random() < 0.3) continue // A day off.
      const seasonal = 1 + 0.25 * Math.sin((day.getUTCMonth() / 12) * 2 * Math.PI)
      const sold = Math.max(0, Math.round(r.level * seasonal * (weekday === 6 ? 0.6 : 1) + (random() - 0.5) * 3))
      if (sold === 0) continue

      let cancelled = 0
      for (let i = 0; i < sold; i++) {
        if (random() > 0.42) continue
        // Most cancellations arrive within the first weeks; some only around the renewal a year later.
        const delay = random() < 0.9 ? 2 + Math.floor(random() * 28) : 330 + Math.floor(random() * 40)
        const cancelledOn = new Date(day)
        cancelledOn.setUTCDate(cancelledOn.getUTCDate() + delay)
        if (cancelledOn.getUTCDay() === 0) cancelledOn.setUTCDate(cancelledOn.getUTCDate() + 1)
        if (cancelledOn.getUTCDay() === 6) cancelledOn.setUTCDate(cancelledOn.getUTCDate() + 2)
        if (toIso(cancelledOn) > enteredDay) continue // Not entered yet.

        cancelled++
        const [reason, , details] = pick(random, REASONS)
        reasonCounts.set(`${date}|${reason}`, (reasonCounts.get(`${date}|${reason}`) ?? 0) + 1)
        if (recruiter) {
          const hour = 9 + Math.floor(random() * 7)
          const minute = Math.floor(random() * 60)
          cancellations.push({
            regNr: `${1 + Math.floor(random() * 9)}${String(Math.floor(random() * 1e6)).padStart(6, "0")}`,
            name: `${INITIALS[Math.floor(random() * INITIALS.length)]} ${SURNAMES[Math.floor(random() * SURNAMES.length)]}`,
            city: CITIES[Math.floor(random() * CITIES.length)],
            soldOn: date,
            cancelledOn: `${toIso(cancelledOn)}T${pad(hour)}:${pad(minute)}:00`,
            reason,
            detail: details[Math.floor(random() * details.length)],
          })
        }
      }
      days.push({ date, recruiter: r.number, sold, cancelled })
    }
  }

  cancellations.sort((a, b) => (b.cancelledOn ?? "").localeCompare(a.cancelledOn ?? ""))
  return {
    cancellationsEnteredUntil: `${enteredDay}T15:42:00`,
    salesEnteredUntil: `${today}T12:00:00`,
    days,
    recruiters: recruiters
      .filter((r) => days.some((d) => d.recruiter === r.number))
      .map(({ number, name }) => ({ number, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    cancellations,
    reasons: [...reasonCounts]
      .map(([key, count]) => ({ date: key.slice(0, 10), reason: key.slice(11), count }))
      .sort((a, b) => a.date.localeCompare(b.date) || b.count - a.count),
  }
}

function pick<T extends [string, number, ...unknown[]]>(random: () => number, items: T[]): T {
  const total = items.reduce((sum, item) => sum + item[1], 0)
  let roll = random() * total
  for (const item of items) {
    roll -= item[1]
    if (roll < 0) return item
  }
  return items[items.length - 1]
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number) => String(n).padStart(2, "0")
const toIso = (date: Date) => date.toISOString().slice(0, 10)
const parseIso = (iso: string) => new Date(`${iso}T00:00:00Z`)
