import { cancelRate, formatRate, type Period } from "./periods"

/** The selected period in four numbers. The colored dots tie Netto and Opgezegd to the chart. */
export function StatTiles({ period }: { period: Period }) {
  const tiles = [
    { label: "Bruto", value: String(period.sold) },
    { label: "Opgezegd", value: String(period.cancelled), swatch: "bg-opgezegd" },
    { label: "Netto", value: String(period.sold - period.cancelled), swatch: "bg-netto" },
    { label: "Uitval", value: formatRate(cancelRate(period)) },
  ]
  return (
    <dl className="grid grid-cols-4 gap-2">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted px-2 py-2">
          <dt className="flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs">
            {tile.swatch && <span aria-hidden className={`size-2 shrink-0 rounded-full ${tile.swatch}`} />}
            {tile.label}
          </dt>
          <dd className="text-xl font-semibold tabular-nums">{tile.value}</dd>
        </div>
      ))}
    </dl>
  )
}
