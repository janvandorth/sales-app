import { useEffect, useLayoutEffect, useRef } from "react"
import { ChevronLeftIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { longLabel, shortLabel, type Granularity, type Period } from "./periods"

type Props = {
  periods: Period[]
  granularity: Granularity
  selectedKey: string | undefined
  onSelect: (key: string) => void
  isProvisional: (period: Period) => boolean
  canLoadMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}

const PLOT_HEIGHT = 140
/** Room above the plot for the selected column's value. */
const HEADROOM = 16

/**
 * Stacked columns per week or month: netto (sales that stayed) at the bottom, opgezegd on top, so the whole column
 * is the bruto number. Newest on the right; scroll left to go back in time. Tapping a column selects that period.
 */
export function PeriodChart(props: Props) {
  const { periods, granularity, selectedKey, onSelect, isProvisional, canLoadMore, loadingMore, onLoadMore } = props
  const scroller = useRef<HTMLDivElement>(null)
  const fromRight = useRef(0)

  // Start at the newest period, and keep the same spot when older periods are added on the left.
  useLayoutEffect(() => {
    const element = scroller.current
    if (element) element.scrollLeft = element.scrollWidth - element.clientWidth - fromRight.current
  }, [periods.length, granularity])

  // Keep the selected column in view when the period is changed with the arrows above.
  useEffect(() => {
    // Horizontally only: scrollIntoView would also scroll the page to the chart.
    const container = scroller.current
    const column = container?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!container || !column) return
    const left = column.offsetLeft - container.scrollLeft
    if (left < 0) container.scrollBy({ left: left - 8, behavior: "smooth" })
    else if (left + column.offsetWidth > container.clientWidth) {
      container.scrollBy({ left: left + column.offsetWidth - container.clientWidth + 8, behavior: "smooth" })
    }
  }, [selectedKey])

  const max = niceMax(Math.max(1, ...periods.map((p) => p.sold)))
  const slot = granularity === "week" ? 34 : 44

  return (
    <div className="flex">
      {/* Y axis, outside the scroller so it stays put. */}
      <div
        className="relative mr-1 w-6 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums"
        style={{ height: HEADROOM + PLOT_HEIGHT }}
      >
        <span className="absolute right-0 -translate-y-1/2" style={{ top: HEADROOM }}>
          {max}
        </span>
        <span className="absolute right-0 -translate-y-1/2" style={{ top: HEADROOM + PLOT_HEIGHT / 2 }}>
          {max / 2}
        </span>
        <span className="absolute right-0 -translate-y-1/2" style={{ top: HEADROOM + PLOT_HEIGHT }}>
          0
        </span>
      </div>

      <div
        ref={scroller}
        className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]"
        onScroll={(event) => {
          const element = event.currentTarget
          fromRight.current = element.scrollWidth - element.clientWidth - element.scrollLeft
        }}
      >
        <div className="relative flex w-max items-start">
          {/* Gridlines: hairlines at 0, half and max. */}
          {[0, 0.5, 1].map((fraction) => (
            <div
              key={fraction}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 border-t border-border"
              style={{ top: HEADROOM + PLOT_HEIGHT * (1 - fraction) }}
            />
          ))}

          {canLoadMore && (
            <div className="flex shrink-0 items-center px-1" style={{ height: HEADROOM + PLOT_HEIGHT }}>
              <Button
                variant="outline"
                size="sm"
                className="h-auto flex-col gap-1 px-2 py-2 text-xs"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? <Spinner /> : <ChevronLeftIcon />}
                Eerder
              </Button>
            </div>
          )}

          {periods.map((period) => {
            const selected = period.key === selectedKey
            const netto = period.sold - period.cancelled
            const provisional = isProvisional(period)
            return (
              <button
                key={period.key}
                type="button"
                onClick={() => onSelect(period.key)}
                aria-pressed={selected}
                aria-label={`${longLabel(period, granularity)}: ${period.sold} bruto, ${period.cancelled} opgezegd${provisional ? ", nog niet compleet" : ""}`}
                title={`${longLabel(period, granularity)}\nBruto ${period.sold} · opgezegd ${period.cancelled} · netto ${netto}`}
                className={cn(
                  "group relative flex shrink-0 flex-col items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  provisional && "bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--color-border)_5px_6px)]",
                )}
                style={{ width: slot }}
              >
                <div
                  className="flex w-full flex-col items-center justify-end"
                  style={{ height: HEADROOM + PLOT_HEIGHT }}
                >
                  {selected && period.sold > 0 && (
                    <span className="mb-0.5 text-[11px] font-semibold text-foreground tabular-nums">{period.sold}</span>
                  )}
                  {period.cancelled > 0 && (
                    <div
                      className="w-5 rounded-t-[4px] bg-opgezegd"
                      style={{ height: (period.cancelled / max) * PLOT_HEIGHT }}
                    />
                  )}
                  {period.cancelled > 0 && netto > 0 && <div className="h-[2px] w-5 shrink-0" />}
                  {netto > 0 && (
                    <div
                      className={cn("w-5 bg-netto", period.cancelled === 0 && "rounded-t-[4px]")}
                      style={{ height: Math.max(1, (netto / max) * PLOT_HEIGHT - (period.cancelled > 0 ? 2 : 0)) }}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "mt-1 rounded px-0.5 text-[10px] leading-4 whitespace-nowrap text-muted-foreground",
                    selected && "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {shortLabel(period, granularity)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** A round axis maximum of at least the value, with a whole number halfway: 2, 4, 6, 8, 10, 20, 30, 40, 50, 60, 80, … */
function niceMax(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value))
  const factors = power === 1 ? [2, 4, 6, 8, 10] : [1, 2, 3, 4, 5, 6, 8, 10]
  return factors.map((factor) => factor * power).find((candidate) => candidate >= value) ?? 10 * power
}
