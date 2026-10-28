// Made-up "kansen" in the shape of the Contracts API, used until the endpoint is configured (and by the app's
// dev-only demo mode). Deterministic per band. No Deno APIs here.
import type { OpportunityAreas, OpportunityStreets, WozBand } from "./sales-opportunities.ts"

const PC4S = ["3811", "3812", "3813", "3814", "3815", "3816", "3818", "3821", "3822", "3823", "3824", "3825"]
const STREETS = ["Kerkstraat", "Molenweg", "Lindelaan", "Beukenhof", "Schoolstraat", "Dorpsweg", "Parklaan"]
const LETTERS = "ABCDEGHJKLMNPRST"

export function demoOpportunityAreas(woz: WozBand): OpportunityAreas {
  const random = mulberry32(hash(woz))
  return {
    statistics: "Voorbeeld",
    lowBelow: 285,
    highFrom: 450,
    customersCountedAt: null,
    areas: PC4S.map((postcode) => {
      const households = 200 + Math.floor(random() * 1800)
      const customers = Math.floor(households * random() * 0.12)
      return { postcode, households, customers, open: households - customers }
    }),
  }
}

export function demoOpportunityStreets(pc4: string, woz: WozBand): OpportunityStreets {
  const random = mulberry32(hash(pc4 + woz))
  const streets = Array.from({ length: 8 }, (_, i) => {
    const households = 15 + Math.floor(random() * 60)
    const customers = Math.floor(households * random() * 0.15)
    return {
      postcode: `${pc4}${LETTERS[i * 2]}${LETTERS[i * 2 + 1]}`,
      streets: STREETS[Math.floor(random() * STREETS.length)],
      city: "Amersfoort",
      households,
      customers,
      open: households - customers,
      woz: 200 + Math.floor(random() * 400),
    }
  })
  return { postcode: pc4, streets: streets.sort((a, b) => b.open - a.open) }
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
