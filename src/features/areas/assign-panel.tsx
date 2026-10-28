import type { Recruiter } from "@shared/submission-record"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { today } from "../dashboard/periods"
import { firstName, summarize, type PeriodPreset, type PickedArea } from "./areas"

type Props = {
  picked: PickedArea[]
  recruiters: Recruiter[] | undefined
  /** The wervers the area goes to; two or more work it together. */
  chosen: string[]
  onChoose: (wervernrs: string[]) => void
  periods: PeriodPreset[]
  period: PeriodPreset
  onPeriod: (period: PeriodPreset) => void
  /** Wervers who already have an area in the period. */
  busy: Set<string>
  /** First names of whoever already has part of the selection in the period. */
  overlapWith: string[]
  note: string
  onNote: (note: string) => void
  assigning: boolean
  onAssign: () => void
}

const CHIP = "h-9 shrink-0 rounded-full px-3"

/**
 * Under the map while giving out areas: who, when, what the tapped areas hold and the button. Everything the map
 * already shows (which areas, who has them) is left to the map.
 */
export function AssignPanel(props: Props) {
  const { picked, recruiters, chosen, onChoose, periods, period, onPeriod, busy, overlapWith } = props
  const summary = summarize(picked)
  const toggle = (nr: string) => onChoose(chosen.includes(nr) ? chosen.filter((c) => c !== nr) : [...chosen, nr])
  const label =
    picked.length === 0
      ? "Tik gebieden aan op de kaart"
      : chosen.length === 0
        ? "Kies een werver"
        : overlapWith.length
          ? `Toewijzen · overlapt met ${overlapWith.join(" en ")}`
          : "Toewijzen"

  return (
    <div className="space-y-2.5 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Werver">
        {recruiters === undefined && <Spinner />}
        {recruiters?.map((r) => (
          <Button
            key={r.wervernr}
            size="sm"
            variant={chosen.includes(r.wervernr) ? "default" : "outline"}
            className={CHIP}
            aria-pressed={chosen.includes(r.wervernr)}
            onClick={() => toggle(r.wervernr)}
          >
            {firstName(r.wervernaam)}
            {!busy.has(r.wervernr) && (
              <span className="size-2 rounded-full bg-green-600" role="img" aria-label="vrij in deze periode" />
            )}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wanneer">
        {periods.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={p.key === period.key ? "default" : "outline"}
            className={CHIP}
            aria-pressed={p.key === period.key}
            onClick={() => onPeriod(p)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {picked.length > 0 && (
        <>
          <dl className="grid grid-cols-4 gap-2 rounded-lg border px-3 py-2">
            <Stat
              value={String(picked.length)}
              label={picked.every((p) => p.code.length === 6) ? "straten" : "gebieden"}
            />
            <Stat value={nl(summary.households)} label="adressen" />
            <Stat value={nl(summary.open)} label="open" className="text-blue-700" />
            <Stat value={sinceLabel(summary.lastSold)} label="laatste verkoop" />
          </dl>
          <Input
            value={props.note}
            maxLength={500}
            placeholder="Notitie voor de werver"
            aria-label="Notitie voor de werver"
            onChange={(event) => props.onNote(event.target.value)}
          />
        </>
      )}

      <Button
        className="h-12 w-full text-base"
        disabled={picked.length === 0 || chosen.length === 0 || props.assigning}
        onClick={props.onAssign}
      >
        {props.assigning && <Spinner />}
        {label}
      </Button>
    </div>
  )
}

function Stat({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg font-bold", className)}>{value}</dd>
    </div>
  )
}

const nl = (n: number | null) => (n === null ? "–" : n.toLocaleString("nl-NL"))

/** "vandaag", "12 d" or "> 1 jr" for the newest sale; "–" when not known. */
function sinceLabel(date: string | null | undefined): string {
  if (date === undefined) return "–"
  if (date === null) return "> 1 jr"
  const days = Math.round((Date.parse(`${today()}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000)
  return days <= 0 ? "vandaag" : `${days} d`
}
