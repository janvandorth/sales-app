// Made-up sales per postcode in the shape of the Contracts API, used until the map endpoint is configured (and by
// the app's dev-only demo mode). Deterministic: the same period always gives the same areas. The postcodes are
// real ones around Amersfoort and Utrecht, so they land on the map. No Deno APIs here.
import type { SalesMap, SalesMapArea } from "./sales-map.ts"
import { streetThresholds } from "./sales-map-view.ts"

const DEMO_RECRUITERS = [
  { number: "0212BB", name: "Jan van Dorth" },
  { number: "0618BB", name: "Sanne de Wit" },
  { number: "1210AP", name: "Mehmet Kaya" },
  { number: "1709DD", name: "Lotte Bakker" },
]

// [PC4, city]: neighbourhoods a team would work through in a few months.
const NEIGHBOURHOODS: [string, string][] = [
  ["3811", "Amersfoort"],
  ["3812", "Amersfoort"],
  ["3813", "Amersfoort"],
  ["3814", "Amersfoort"],
  ["3815", "Amersfoort"],
  ["3816", "Amersfoort"],
  ["3818", "Amersfoort"],
  ["3821", "Amersfoort"],
  ["3822", "Amersfoort"],
  ["3823", "Amersfoort"],
  ["3824", "Amersfoort"],
  ["3825", "Amersfoort"],
  ["3826", "Amersfoort"],
  ["3831", "Leusden"],
  ["3832", "Leusden"],
  ["3511", "Utrecht"],
  ["3512", "Utrecht"],
  ["3513", "Utrecht"],
  ["3514", "Utrecht"],
  ["3521", "Utrecht"],
  ["3522", "Utrecht"],
  ["3523", "Utrecht"],
  ["3531", "Utrecht"],
  ["3532", "Utrecht"],
  ["3581", "Utrecht"],
  ["3582", "Utrecht"],
  ["3583", "Utrecht"],
  ["3584", "Utrecht"],
]

const LETTERS = "ABCDEGHJKLMNPRSTVWXZ"

/** Demo sales per postcode for sale days `from`..`to` (yyyy-MM-dd). */
export function demoSalesMap(from: string, to: string): SalesMap {
  const first = Date.parse(`${from}T00:00:00Z`)
  const last = Date.parse(`${to}T00:00:00Z`)
  const areas: SalesMapArea[] = []

  NEIGHBOURHOODS.forEach(([pc4, city], index) => {
    const random = mulberry32(hash(pc4))
    // The team moves through the list: later neighbourhoods were worked more recently.
    const daysAgo = Math.round((NEIGHBOURHOODS.length - 1 - index) * 6 + random() * 5)
    const day = new Date(last - daysAgo * 86_400_000)
    if (day.getTime() < first) return // Worked before the period.

    const streets = 2 + Math.floor(random() * 6)
    for (let i = 0; i < streets; i++) {
      const letters = LETTERS[Math.floor(random() * LETTERS.length)] + LETTERS[Math.floor(random() * LETTERS.length)]
      const postcode = `${pc4}${letters}`
      if (areas.some((area) => area.postcode === postcode)) continue
      const sold = 1 + Math.floor(random() * random() * 7)
      const lastSoldOn = new Date(day.getTime() - Math.floor(random() * 4) * 86_400_000)
      const recruiter = DEMO_RECRUITERS[Math.floor(random() * DEMO_RECRUITERS.length)]
      const helper = DEMO_RECRUITERS[Math.floor(random() * DEMO_RECRUITERS.length)]
      areas.push({
        postcode,
        city,
        sold,
        lastSoldOn: (lastSoldOn.getTime() < first ? day : lastSoldOn).toISOString().slice(0, 10),
        recruiters:
          sold > 2 && helper !== recruiter
            ? [
                { recruiter: recruiter.number, sold: sold - 1 },
                { recruiter: helper.number, sold: 1 },
              ]
            : [{ recruiter: recruiter.number, sold }],
      })
    }
  })

  areas.sort((a, b) => a.postcode.localeCompare(b.postcode))
  const used = new Set(areas.flatMap((area) => area.recruiters.map((r) => r.recruiter)))
  return {
    salesEnteredUntil: `${to}T12:00:00`,
    areas,
    unplaced: Math.floor(areas.length / 25),
    recruiters: DEMO_RECRUITERS.filter((r) => used.has(r.number)).sort((a, b) => a.name.localeCompare(b.name)),
    streetThresholds: streetThresholds(areas.map((a) => a.sold)),
  }
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
