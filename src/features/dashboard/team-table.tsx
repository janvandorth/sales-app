import { ChevronRightIcon } from "lucide-react"
import type { SalesStats } from "@shared/kpi"
import { cancelRate, formatRate, type Period } from "./periods"

type Props = {
  stats: SalesStats
  period: Period
  onPick: (wervernr: string) => void
}

/** Sales manager: every recruiter's numbers for the selected period, most sales first. Tap to open one. */
export function TeamTable({ stats, period, onPick }: Props) {
  const names = new Map(stats.recruiters.map((r) => [r.number, r.name]))
  const totals = new Map<string, { sold: number; cancelled: number }>()
  for (const day of stats.days) {
    if (day.date < period.start || day.date > period.end) continue
    const total = totals.get(day.recruiter) ?? { sold: 0, cancelled: 0 }
    total.sold += day.sold
    total.cancelled += day.cancelled
    totals.set(day.recruiter, total)
  }
  const rows = [...totals]
    .map(([number, total]) => ({ number, name: names.get(number) ?? number, ...total }))
    .sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name, "nl"))

  if (rows.length === 0) return <p className="py-2 text-sm text-muted-foreground">Geen verkopen in deze periode.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="pb-2 text-left font-normal">Werver</th>
          <th className="pb-2 text-right font-normal">Bruto</th>
          <th className="pb-2 text-right font-normal">Opgezegd</th>
          <th className="pb-2 text-right font-normal">Uitval</th>
          <th className="w-6" />
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((row) => (
          <tr key={row.number} className="cursor-pointer hover:bg-muted/60" onClick={() => onPick(row.number)}>
            <td className="py-3 pr-2">
              {/* The click bubbles to the row; the button makes it reachable by keyboard. */}
              <button type="button" className="text-left outline-none focus-visible:underline">
                <span className="font-medium">{row.name}</span>
                <span className="block text-xs text-muted-foreground">{row.number}</span>
              </button>
            </td>
            <td className="py-3 text-right tabular-nums">{row.sold}</td>
            <td className="py-3 text-right tabular-nums">{row.cancelled}</td>
            <td className="py-3 text-right tabular-nums">{formatRate(cancelRate(row))}</td>
            <td className="py-3 text-right text-muted-foreground">
              <ChevronRightIcon className="ml-auto size-4" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
