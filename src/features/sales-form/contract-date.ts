import { formSchema } from "@shared/form-schema"
import { addDays } from "../dashboard/periods"
import { today } from "./form-defaults"

/** A contract date further back than this many days is probably a typo, so the recruiter is asked to confirm it. */
export const MAX_DAYS_OLD = 7

/** True when the contract date lies more than a week before today. */
export function isOldContractDate(datum: string, now = today()): boolean {
  return datum < addDays(now, -MAX_DAYS_OLD)
}

/** True when the contract date lies after today on the phone's calendar. */
export function isFutureContractDate(datum: string, now = today()): boolean {
  return datum > now
}

/**
 * The form schema plus rules that only the app can check. A contract date in the future is refused here, on the
 * phone's own calendar; the server runs on UTC, where just after midnight in the Netherlands it is still yesterday.
 */
export const salesFormSchema = formSchema.refine((values) => !isFutureContractDate(values.datum), {
  path: ["datum"],
  message: "De datum mag niet in de toekomst liggen",
  // Also check while other fields are still invalid, so every error shows at once.
  when: ({ value }) => typeof value === "object" && value !== null && "datum" in value,
})
