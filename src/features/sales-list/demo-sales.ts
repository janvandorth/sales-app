// Dev only (see DEMO_MODE in lib/api.ts): made-up sales so the list can be seen without logging in.
import type { OnboardingStatus, SubmittedSale } from "@/lib/api"
import { addDays } from "../dashboard/periods"
import { localDate } from "./days"

const RECRUITERS = [
  { wervernaam: "Jan van Dorth", wervernr: "0212BB" },
  { wervernaam: "Sanne Bakker", wervernr: "0305KL" },
  { wervernaam: "Mo El Amrani", wervernr: "0411TR" },
]
const CUSTOMERS = [
  ["P.J. Jansen", "Kerkstraat", "12", "", "Utrecht"],
  ["A. van der Berg", "Dorpsweg", "4", "A", "Zeist"],
  ["M. de Vries", "Molenlaan", "88", "", "Amersfoort"],
  ["K. Yilmaz", "Stationsplein", "1", "", "Houten"],
  ["L. Smit", "Bosrand", "23", "bis", "Bilthoven"],
]
const STATUSES: (OnboardingStatus | null)[] = ["accepted", "accepted", "refused", "accepted", null, "failed"]

export function demoSales(from: string, team: boolean): SubmittedSale[] {
  const date = localDate(from)
  const seed = Number(date.slice(8, 10))
  const recruiters = team ? RECRUITERS : RECRUITERS.slice(0, 1)
  return recruiters
    .flatMap((recruiter, r) =>
      Array.from({ length: (seed + r) % 4 }, (_, i) => {
        const [naam, straat, huisnummer, toevoeging, plaats] = CUSTOMERS[(seed + r + i) % CUSTOMERS.length]
        const status = STATUSES[(seed + r * 2 + i) % STATUSES.length]
        return {
          rowId: `${date}-${r}-${i}`,
          received: new Date(
            `${date}T${String(10 + i * 2 + r).padStart(2, "0")}:${String((seed * 7 + i * 13) % 60).padStart(2, "0")}:00`,
          ).toISOString(),
          // Now and then a form filled in the day before (sent later, or a wrong date).
          datum: (seed + i) % 5 === 0 ? addDays(date, -1) : date,
          ...recruiter,
          klantnummer: String(100200 + seed * 10 + r * 3 + i),
          naam,
          straat,
          huisnummer,
          toevoeging,
          plaats,
          onboardingStatus: status,
          onboardingMessage: status === "refused" ? "IBAN is ongeldig" : status === "failed" ? "Interne fout" : null,
          test: false,
        }
      }),
    )
    .sort((a, b) => a.received.localeCompare(b.received))
}
