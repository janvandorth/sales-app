// Shared between the recruiters edge function and the web app: ZMAdmin's recruiters (Contracts API,
// GET .../Recruiters), from which an admin picks the werver of a sale. No Deno APIs here.
import { z } from "zod"

/** The Contracts API's answer: active recruiters only. Initials holds the first name, name the surname. */
export const recruitersResponseSchema = z.object({
  recruiters: z.array(z.object({ number: z.string(), initials: z.string(), name: z.string(), company: z.string() })),
})

/** A recruiter as the app shows and submits it; wervernr is the ZMAdmin recruiter code. */
export type ZmRecruiter = { wervernaam: string; wervernr: string; company: string }

/** Recruiters with a code, as wervernaam/wervernr, sorted by name. */
export function toZmRecruiters(response: z.output<typeof recruitersResponseSchema>): ZmRecruiter[] {
  return response.recruiters
    .filter((recruiter) => recruiter.number.trim() !== "")
    .map((recruiter) => ({
      wervernaam: `${recruiter.initials.trim()} ${recruiter.name.trim()}`.trim(),
      wervernr: recruiter.number.trim(),
      company: recruiter.company.trim(),
    }))
    .sort((a, b) => a.wervernaam.localeCompare(b.wervernaam, "nl"))
}
