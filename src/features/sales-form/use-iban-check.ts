import { useState } from "react"
import { useWatch } from "react-hook-form"
import { normalizeIban, type FormValues } from "@shared/form-schema"
import { useDebouncedCheck } from "@/hooks/use-debounced-check"
import { validateIban } from "@/lib/api"
import type { SalesFormApi } from "./form-types"

const MIN_IBAN_LENGTH = 15

/**
 * Validates the IBAN in the background (2 s after typing stops). An invalid IBAN may still be submitted,
 * but when online the recruiter has to confirm it first: `guardSubmit` holds the values until they do.
 */
export function useIbanCheck({ control }: SalesFormApi, onSubmit: (values: FormValues) => void) {
  const normalized = normalizeIban(useWatch({ control, name: "iban" }))
  const check = useDebouncedCheck(normalized.length >= MIN_IBAN_LENGTH ? normalized : null, validateIban)
  const [checkingOnSubmit, setCheckingOnSubmit] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<FormValues | null>(null)

  async function isValidForSubmit(iban: string): Promise<boolean | null> {
    if (check.status === "done" && check.data.iban === iban) return check.data.valid
    setCheckingOnSubmit(true)
    try {
      return (await validateIban(iban, AbortSignal.timeout(8000))).valid
    } catch {
      return null // Check unavailable; don't block the recruiter.
    } finally {
      setCheckingOnSubmit(false)
    }
  }

  async function guardSubmit(values: FormValues) {
    if (!navigator.onLine) return onSubmit(values) // Offline: no check possible, submit as-is.
    if ((await isValidForSubmit(values.iban)) === false) setAwaitingConfirmation(values)
    else onSubmit(values)
  }

  return {
    normalized,
    check,
    checkingOnSubmit,
    guardSubmit,
    awaitingConfirmation,
    confirm: () => {
      if (awaitingConfirmation) onSubmit(awaitingConfirmation)
      setAwaitingConfirmation(null)
    },
    cancel: () => setAwaitingConfirmation(null),
  }
}
