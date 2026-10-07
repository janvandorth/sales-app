import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { PAGE_WIDTH } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { Granularity } from "./periods"

type Props = {
  granularity: Granularity
  onGranularity: (granularity: Granularity) => void
  /** "Week 41" or "Oktober 2026". */
  title: string
  /** "5 – 11 okt 2026" for a week; empty for a month. */
  subtitle: string
  canPrevious: boolean
  canNext: boolean
  loadingPrevious: boolean
  onPrevious: () => void
  onNext: () => void
  onLatest: () => void
}

/**
 * One sticky row under the header: per week or per month, and which week or month. Every card below shows that
 * period, so the choice sits above all of them rather than inside one card.
 */
export function PeriodBar(props: Props) {
  const { granularity, onGranularity, title, subtitle, canPrevious, canNext, loadingPrevious } = props
  const unit = granularity === "week" ? "week" : "maand"

  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b bg-background/95 backdrop-blur">
      <div className={`mx-auto flex items-center gap-2 px-4 py-2 ${PAGE_WIDTH}`}>
        <div
          role="group"
          aria-label="Alle cijfers per week of per maand"
          className="flex shrink-0 rounded-lg bg-muted p-1"
        >
          {(["week", "month"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={granularity === option}
              onClick={() => onGranularity(option)}
              className={cn(
                "h-9 rounded-md px-2.5 text-sm font-medium text-muted-foreground",
                granularity === option && "bg-background text-foreground shadow-sm",
              )}
            >
              {option === "week" ? "Week" : "Maand"}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 items-center lg:w-96 lg:flex-none">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label={`Vorige ${unit}`}
            disabled={!canPrevious || loadingPrevious}
            onClick={props.onPrevious}
          >
            {loadingPrevious ? <Spinner /> : <ChevronLeftIcon className="size-5" />}
          </Button>
          <div className="flex min-w-0 flex-1 flex-col items-center leading-tight" aria-live="polite">
            <span className="truncate text-sm font-semibold">{title}</span>
            {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
          </div>
          {canNext && (
            <button
              type="button"
              className="mx-1 shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
              aria-label={`Naar deze ${unit}`}
              onClick={props.onLatest}
            >
              Nu
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label={`Volgende ${unit}`}
            disabled={!canNext}
            onClick={props.onNext}
          >
            <ChevronRightIcon className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
