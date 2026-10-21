import { useState } from "react"
import type { FormValues } from "@shared/form-schema"

/**
 * A form that `needsConfirmation` may still be submitted, but the recruiter has to confirm it first:
 * `guardSubmit` holds the values until they do, then passes them on to `next`.
 */
export function useSubmitConfirmation(
  needsConfirmation: (values: FormValues) => boolean,
  next: (values: FormValues) => void,
) {
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<FormValues | null>(null)

  return {
    guardSubmit: (values: FormValues) => {
      if (needsConfirmation(values)) setAwaitingConfirmation(values)
      else next(values)
    },
    awaitingConfirmation,
    confirm: () => {
      if (awaitingConfirmation) next(awaitingConfirmation)
      setAwaitingConfirmation(null)
    },
    cancel: () => setAwaitingConfirmation(null),
  }
}
