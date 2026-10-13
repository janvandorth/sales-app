import { BuildingIcon, CalendarIcon, CheckIcon, ClockIcon, CloudOffIcon, TriangleAlertIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { OnboardingStatus, SubmittedSale } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatDay } from "../dashboard/periods"
import { formatTime } from "./days"

type Props = {
  sale: Pick<SubmittedSale, "naam" | "klantnummer" | "datum" | "straat" | "huisnummer" | "toevoeging" | "plaats"> &
    Partial<Pick<SubmittedSale, "onboardingMessage" | "test">>
  /** The day it was sent on; the form's own date is pointed out when it differs. */
  day: string
  /** Received time; absent for a form still in the outbox. */
  received?: string
  status: OnboardingStatus | null | "queued"
}

/** One submitted sale: who, where, what, and whether ZMAdmin took it. */
export function SaleItem({ sale, day, received, status }: Props) {
  const address = [sale.straat, `${sale.huisnummer}${sale.toevoeging ? ` ${sale.toevoeging}` : ""}`].join(" ").trim()
  const otherDate = sale.datum !== day
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{sale.naam || "Naamloos"}</span>
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {received ? formatTime(received) : "niet verstuurd"}
        </span>
      </div>
      <span className="text-sm text-muted-foreground">{[address, sale.plaats].filter(Boolean).join(", ")}</span>
      <span className="text-sm">
        Klantnr. <span className="tabular-nums">{sale.klantnummer || "—"}</span>
      </span>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={status} />
        {sale.test && <Badge className="bg-amber-500 text-black">TEST</Badge>}
        <Badge
          variant="outline"
          className={cn(
            "ml-auto",
            otherDate && "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
          )}
        >
          <CalendarIcon /> Contractdatum {formatDay(sale.datum)}
        </Badge>
      </div>
      {status === "refused" && sale.onboardingMessage && (
        <p className="text-xs text-destructive">{sale.onboardingMessage}</p>
      )}
    </li>
  )
}

function StatusBadge({ status }: { status: Props["status"] }) {
  switch (status) {
    case "accepted":
      return (
        <Badge className="bg-green-600/10 text-green-700 dark:text-green-400">
          <CheckIcon /> Verwerkt
        </Badge>
      )
    case "skipped":
      return (
        <Badge variant="secondary">
          <CheckIcon /> Via de sheet
        </Badge>
      )
    case "refused":
      return (
        <Badge variant="destructive">
          <TriangleAlertIcon /> Geweigerd door ZMAdmin
        </Badge>
      )
    case "failed":
      return (
        // ZMAdmin's technical error means nothing to a recruiter; what matters is that the office picks it up.
        <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">
          <BuildingIcon /> Kantoor handelt dit af
        </Badge>
      )
    case "queued":
      return (
        <Badge variant="outline">
          <CloudOffIcon /> In de wachtrij
        </Badge>
      )
    default:
      return (
        <Badge variant="secondary">
          <ClockIcon /> Ontvangen
        </Badge>
      )
  }
}
