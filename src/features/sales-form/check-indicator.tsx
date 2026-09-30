import { CheckCircle2Icon, XCircleIcon } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import type { CheckState } from "@/hooks/use-debounced-check"

/** Spinner / check / cross shown inside an input while and after a background check runs. */
export function CheckIndicator<T>({ state, isValid }: { state: CheckState<T>; isValid: (data: T) => boolean }) {
  switch (state.status) {
    case "pending":
      return <Spinner aria-label="Bezig met controleren" />
    case "done":
      return isValid(state.data) ? (
        <CheckCircle2Icon className="text-green-600" aria-label="Gecontroleerd" />
      ) : (
        <XCircleIcon className="text-destructive" aria-label="Niet gevonden" />
      )
    case "error":
      return <XCircleIcon className="text-muted-foreground" aria-label="Controle mislukt" />
    default:
      return null
  }
}
