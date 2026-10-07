import type { SalesStatsCancellation } from "@shared/kpi"
import { formatDay } from "./periods"

/** The recruiter's own cancelled sales, with what the customer said, so they can learn from them. */
export function CancellationList({ items }: { items: SalesStatsCancellation[] }) {
  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Geen opzeggingen van verkopen in deze periode.</p>
  }
  return (
    <ul className="-my-2 divide-y">
      {items.map((item, index) => (
        <li key={`${item.regNr}-${index}`} className="flex flex-col gap-1 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">
              {item.name || "Onbekende klant"}
              {item.city && <span className="font-normal text-muted-foreground"> · {item.city}</span>}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.regNr}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              <span aria-hidden className="size-2 rounded-full bg-opgezegd" />
              {item.reason}
            </span>
            {item.detail && <span className="text-sm text-foreground italic">“{item.detail}”</span>}
          </div>
          <span className="text-xs text-muted-foreground">
            Verkocht {formatDay(item.soldOn)}
            {item.cancelledOn && ` · opgezegd ${formatDay(item.cancelledOn.slice(0, 10))}`}
          </span>
        </li>
      ))}
    </ul>
  )
}
