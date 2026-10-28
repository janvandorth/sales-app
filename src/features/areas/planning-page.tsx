import { useState } from "react"
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { HEADER_BUTTON_CLASS, PAGE_WIDTH, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { addDays, formatDay, periodStart, today } from "../dashboard/periods"
import {
  areaTitle,
  firstName,
  codesLabel,
  isoWeek,
  runsOn,
  spanLabel,
  tooBig,
  weekday,
  type AreaAssignment,
  type AreaMember,
  type AssignStart,
} from "./areas"
import { useAreaAssignments, useDeleteAreaAssignment, useRecruiters } from "./use-areas"

type Props = {
  onBack: () => void
  /** Opens the map to give out an area. */
  onAssign: (start: AssignStart) => void
  /** Opens the map on an area. */
  onShow: (area: AreaAssignment) => void
  /** Opens a werver's own list of areas, as they see it. */
  onViewAs: (werver: AreaMember) => void
}

/** Monday to Saturday. */
const DAYS = 6

/**
 * The sales manager's week: per day who works where, and who has nothing yet. A day's count says how many wervers
 * have an area that day, so a gap shows before the day is picked.
 */
export function PlanningPage({ onBack, onAssign, onShow, onViewAs }: Props) {
  const now = today()
  const [monday, setMonday] = useState(periodStart(now, "week"))
  const days = Array.from({ length: DAYS }, (_, i) => addDays(monday, i))
  const [picked, setDay] = useState(now)
  const day = days.includes(picked) ? picked : days[0]
  const areas = useAreaAssignments(monday, days.at(-1)!)
  const recruiters = useRecruiters(true)

  const onDay = (date: string) => (areas.data ?? []).filter((a) => runsOn(a, date))
  const working = (date: string) => new Set(onDay(date).flatMap((a) => a.wervernrs))
  const total = recruiters.data?.length ?? 0
  const free = (recruiters.data ?? []).filter((r) => !working(day).has(r.wervernr))
  const week = isoWeek(monday)

  return (
    <div className="min-h-svh bg-muted pb-24">
      <PageHeader
        start={
          <Button variant="ghost" size="icon" className={HEADER_BUTTON_CLASS} aria-label="Terug" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        }
        title="Planning"
        end={
          <Button
            variant="ghost"
            size="icon"
            className={HEADER_BUTTON_CLASS}
            aria-label="Vernieuwen"
            onClick={() => void areas.refetch()}
          >
            <RefreshCwIcon className={areas.isFetching ? "animate-spin" : undefined} />
          </Button>
        }
      />

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b bg-background/95 backdrop-blur">
        <div className={`mx-auto space-y-2 px-4 py-2 ${PAGE_WIDTH}`}>
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Vorige week" onClick={() => setMonday(addDays(monday, -7))}>
              <ChevronLeftIcon />
            </Button>
            <span className="w-20 text-center font-semibold">Week {week}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Volgende week"
              onClick={() => setMonday(addDays(monday, 7))}
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <div className="grid grid-cols-6 gap-1" role="group" aria-label="Dag">
            {days.map((date) => {
              const count = working(date).size
              const short = total > 0 && count < total && date >= now
              return (
                <button
                  key={date}
                  type="button"
                  aria-pressed={date === day}
                  aria-label={`${weekday(date)} ${formatDay(date)}, ${count} van ${total} ingepland`}
                  onClick={() => setDay(date)}
                  className={cn(
                    "flex flex-col items-center rounded-lg py-1.5",
                    date === day ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  <span className="text-xs">{weekday(date)}</span>
                  <span className="text-lg font-semibold">{formatDay(date, false)}</span>
                  <span className={cn("text-[11px]", short && date !== day && "font-semibold text-orange-700")}>
                    {areas.data && recruiters.data ? `${count}/${total}` : " "}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className={`mx-auto space-y-2.5 px-4 py-4 ${PAGE_WIDTH}`}>
        {areas.error && (
          <Alert variant="destructive">
            <AlertDescription>{getErrorMessage(areas.error)}</AlertDescription>
          </Alert>
        )}
        {areas.isPending && (
          <div className="flex justify-center py-8">
            <Spinner className="size-6" />
          </div>
        )}
        {onDay(day).map((area) => (
          <AreaCard key={area.id} area={area} onShow={() => onShow(area)} onViewAs={onViewAs} />
        ))}
        {day >= now &&
          free.map((r) => (
            <div
              key={r.wervernr}
              className="flex items-center justify-between rounded-xl border border-dashed bg-background px-4 py-3"
            >
              <WerverName werver={{ wervernr: r.wervernr, name: r.wervernaam }} onViewAs={onViewAs} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAssign({ wervernr: r.wervernr, days: { startsOn: day, endsOn: day } })}
              >
                Gebied kiezen
              </Button>
            </div>
          ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button className={`mx-auto flex h-12 w-full text-base shadow-lg ${PAGE_WIDTH}`} onClick={() => onAssign({})}>
          <PlusIcon /> Nieuwe opdracht
        </Button>
      </div>
    </div>
  )
}

type AreaCardProps = { area: AreaAssignment; onShow: () => void; onViewAs: (werver: AreaMember) => void }

function AreaCard({ area, onShow, onViewAs }: AreaCardProps) {
  const remove = useDeleteAreaAssignment()
  const needs = tooBig(area)
  const days = area.startsOn === area.endsOn ? null : spanLabel(area.startsOn, area.endsOn, true)
  return (
    <div className="space-y-1.5 rounded-xl border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-x-1">
          {area.members.map((m, i) => (
            <span key={m.wervernr} className="flex items-center gap-x-1">
              {i > 0 && <span className="font-semibold">+</span>}
              <WerverName werver={m} onViewAs={onViewAs} />
            </span>
          ))}
        </span>
        {days && <Badge variant="secondary">{days}</Badge>}
      </div>
      <div className="text-sm">
        {areaTitle(area)}
        {area.label && <span className="text-muted-foreground"> · {codesLabel(area.postcodes)}</span>}
      </div>
      {area.note && <p className="text-sm text-muted-foreground">{area.note}</p>}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {area.open !== null && (
          <span className="font-semibold text-blue-700">{area.open.toLocaleString("nl-NL")} open</span>
        )}
        <span>{area.sold} verkocht</span>
        <span className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Op de kaart" onClick={onShow}>
          <MapIcon />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Opdracht verwijderen" disabled={remove.isPending}>
              <Trash2Icon />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opdracht verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                {areaTitle(area)} verdwijnt bij {area.members.map((m) => firstName(m.name)).join(" en ")} uit Mijn
                gebieden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => remove.mutate(area.id, { onError: (error) => toast.error(getErrorMessage(error)) })}
              >
                Verwijderen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {needs && (
        <p className="rounded-md bg-orange-50 px-2.5 py-1.5 text-xs text-orange-800">
          Te groot voor {needs} {needs === 1 ? "dag" : "dagen"}
        </p>
      )}
    </div>
  )
}

/** A werver's first name; tapping it shows their list of areas as they see it. */
function WerverName({ werver, onViewAs }: { werver: AreaMember; onViewAs: (werver: AreaMember) => void }) {
  return (
    <button
      type="button"
      className="font-semibold underline-offset-4 hover:underline"
      aria-label={`Gebieden van ${werver.name}`}
      onClick={() => onViewAs(werver)}
    >
      {firstName(werver.name)}
    </button>
  )
}
