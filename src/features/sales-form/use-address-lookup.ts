import { useEffect, useRef, useState } from "react"
import { useWatch } from "react-hook-form"
import { POSTCODE_REGEX, normalizePostcode } from "@shared/form-schema"
import { useDebouncedCheck } from "@/hooks/use-debounced-check"
import { lookupPostcode } from "@/lib/api"
import type { SalesFormApi } from "./form-types"

/**
 * Looks up straat + plaats for the entered postcode and huisnummer (2 s after typing stops) and fills them in.
 * The address fields stay read-only unless the lookup fails, the device is offline, or the user chooses to
 * edit them manually.
 */
export function useAddressLookup({ control, setValue }: SalesFormApi) {
  const [postcode, huisnummer] = useWatch({ control, name: ["postcode", "huisnummer"] })
  const lookupKey =
    POSTCODE_REGEX.test(postcode.trim()) && /^\d{1,5}$/.test(huisnummer.trim())
      ? `${normalizePostcode(postcode)}|${huisnummer.trim()}`
      : null
  const check = useDebouncedCheck(lookupKey, (key, signal) => {
    const [pc, nr] = key.split("|")
    return lookupPostcode(pc, nr, signal)
  })
  const [manual, setManual] = useState(false)

  const lookupFailed =
    check.status === "error" || check.status === "offline" || (check.status === "done" && !check.data.found)
  const editable = manual || lookupFailed

  // A changed postcode/huisnummer invalidates the filled-in address until the new lookup answers.
  const previousKey = useRef(lookupKey)
  useEffect(() => {
    if (previousKey.current === lookupKey) return
    previousKey.current = lookupKey
    if (!manual) {
      setValue("straat", "")
      setValue("plaats", "")
    }
  }, [lookupKey, manual, setValue])

  useEffect(() => {
    if (manual || check.status !== "done" || !check.data.found) return
    setValue("straat", check.data.straat, { shouldValidate: true })
    setValue("plaats", check.data.plaats, { shouldValidate: true })
  }, [check, manual, setValue])

  return { check, editable, manual, enableManual: () => setManual(true) }
}
