type Props = { reasons: { reason: string; count: number }[] }

/** How often each cancellation reason was given, as horizontal bars with the count and share at the end. */
export function ReasonList({ reasons }: Props) {
  const total = reasons.reduce((sum, r) => sum + r.count, 0)
  if (total === 0) return <p className="py-2 text-sm text-muted-foreground">Nog geen opzeggingen.</p>

  const max = Math.max(...reasons.map((r) => r.count))
  return (
    <ul className="flex flex-col gap-2.5">
      {reasons.map((r) => (
        <li key={r.reason} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm">
          <span className="truncate" title={r.reason}>
            {r.reason}
          </span>
          <div className="flex items-center gap-2">
            <div className="h-3 rounded-r-[4px] bg-opgezegd" style={{ width: `${(r.count / max) * 75}%` }} />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {r.count} · {Math.round((r.count / total) * 100)}%
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
