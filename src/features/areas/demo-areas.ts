import type { Recruiter } from "@shared/submission-record"
import { addDays, periodStart, today } from "../dashboard/periods"
import { runsDuring, type AreaAssignment, type NewAreaAssignment } from "./areas"
import type { Door, DoorVisit, Outcome } from "./doors"

// Dev only (`?demo`): made-up wervers and areas around Utrecht, kept in memory so giving out an area shows up in
// the planning until the page reloads. The demo werver is 0212BB, as in the rest of the demo.

export const DEMO_RECRUITERS: Recruiter[] = [
  { wervernaam: "Jan van Dorth", wervernr: "0212BB" },
  { wervernaam: "Sanne de Wit", wervernr: "0144SV" },
  { wervernaam: "Daan Smit", wervernr: "0187DS" },
  { wervernaam: "Lotte Bakker", wervernr: "0301LB" },
  { wervernaam: "Yara Haddou", wervernr: "0322YH" },
]

const nameOf = (nr: string) => DEMO_RECRUITERS.find((r) => r.wervernr === nr)?.wervernaam ?? nr

function seed(): AreaAssignment[] {
  const now = today()
  const monday = periodStart(now, "week")
  const make = (
    id: string,
    wervernrs: string[],
    startsOn: string,
    endsOn: string,
    label: string,
    postcodes: string[],
    bounds: AreaAssignment["bounds"],
    open: number,
    sold: number,
    note = "",
  ): AreaAssignment => ({
    id,
    postcodes,
    wervernrs,
    startsOn,
    endsOn,
    label,
    note,
    bounds,
    households: Math.round(open * 2.4),
    open,
    members: wervernrs.map((nr) => ({ wervernr: nr, name: nameOf(nr) })),
    sold,
    // Walked about as far as sold in: none where nothing was sold yet.
    visited: sold ? Math.round(open * 2.4 * 0.38) : 0,
  })
  return [
    make(
      "a1",
      ["0212BB"],
      addDays(now, -1),
      addDays(now, 1),
      "Overvecht, Utrecht",
      ["3561A", "3561BA", "3561BB"],
      [5.108, 52.112, 5.125, 52.121],
      214,
      2,
      "Begin bij de Lijsterlaan, de even kant is vorige keer overgeslagen.",
    ),
    make(
      "a2",
      ["0144SV", "0187DS"],
      now,
      now,
      "Overvecht, Utrecht",
      ["3561BC", "3561BD"],
      [5.113, 52.115, 5.119, 52.118],
      31,
      0,
    ),
    make(
      "a3",
      ["0301LB", "0212BB"],
      addDays(now, 2),
      addDays(now, 2),
      "Zuilen, Utrecht",
      ["3555K"],
      [5.094, 52.108, 5.103, 52.113],
      96,
      0,
    ),
    make(
      "a4",
      ["0212BB"],
      addDays(monday, 7),
      addDays(monday, 12),
      "Lombok, Utrecht",
      ["3531H"],
      [5.096, 52.089, 5.104, 52.093],
      58,
      0,
    ),
    make(
      "a5",
      ["0212BB"],
      addDays(monday, -7),
      addDays(monday, -2),
      "Wittevrouwen, Utrecht",
      ["3572"],
      [5.128, 52.093, 5.142, 52.101],
      140,
      3,
    ),
  ]
}

let store: AreaAssignment[] | undefined

export function demoAssignments(from: string, to: string, wervernr: string | null): AreaAssignment[] {
  store ??= seed()
  return store
    .filter((a) => runsDuring(a, from, to) && (wervernr === null || a.wervernrs.includes(wervernr)))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
}

export function demoCreate(input: NewAreaAssignment): void {
  store ??= seed()
  store.push({
    ...input,
    id: crypto.randomUUID(),
    members: input.wervernrs.map((nr) => ({ wervernr: nr, name: nameOf(nr) })),
    sold: 0,
    visited: 0,
  })
}

export function demoDelete(id: string): void {
  store = (store ?? seed()).filter((a) => a.id !== id)
}

let visits: DoorVisit[] = []

export function demoVisits(postcodes: string[]): DoorVisit[] {
  return visits.filter((v) => postcodes.includes(v.postcode))
}

export function demoRecordVisit(visit: Door & { outcome: Outcome; wervernr: string }): string {
  const id = crypto.randomUUID()
  visits.push({ ...visit, id, visitedAt: new Date().toISOString() })
  return id
}

export function demoDeleteVisit(id: string): void {
  visits = visits.filter((v) => v.id !== id)
}
