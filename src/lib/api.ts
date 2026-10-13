// Every call from the app to the backend (Supabase edge functions and storage) goes through this file.
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js"
import type { AdminUser } from "@shared/admin-types"
import type { ExtractedFields, FormInput } from "@shared/form-schema"
import type { KpiRequest, KpiResponse } from "@shared/kpi"
import { SCANS_BUCKET } from "@shared/storage"
import { IS_TEST_DEPLOYMENT, TEST_DEPLOYMENT_HEADER } from "@/lib/deployment"
import { ApiError, AuthError, NetworkError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"

async function invoke<T>(
  name: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  isRetry = false,
): Promise<T> {
  const headers = IS_TEST_DEPLOYMENT ? { [TEST_DEPLOYMENT_HEADER]: "1" } : undefined
  const { data, error } = await supabase.functions.invoke<T>(name, { body, signal, headers })
  if (!error) return data as T

  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    if (response.status === 401 && !isRetry) {
      await recoverSession()
      return invoke(name, body, signal, true)
    }
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(payload.error ?? "Er ging iets mis", response.status)
  }
  if (signal?.aborted) throw signal.reason
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    throw new NetworkError("Geen verbinding met de server")
  }
  throw error
}

/**
 * The server rejected our access token although it may not have expired yet, e.g. because the session was
 * revoked. Try a refresh; if the session is really gone, sign out on this device so the login screen shows.
 */
async function recoverSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession()
  if (!error) return
  if (isAuthRetryableFetchError(error)) throw new NetworkError("Geen verbinding met de server")
  await supabase.auth.signOut({ scope: "local" })
  throw new AuthError("Je sessie is verlopen, log opnieuw in")
}

// --- Sales form ----------------------------------------------------------------------------------

export type PostcodeResult = { found: true; straat: string; plaats: string } | { found: false }

export function lookupPostcode(postcode: string, huisnummer: string, signal?: AbortSignal) {
  return invoke<PostcodeResult>("postcode-lookup", { postcode, huisnummer }, signal)
}

export type IbanResult = { valid: boolean; iban: string; bank?: string | null; bic?: string | null }

export function validateIban(iban: string, signal?: AbortSignal) {
  return invoke<IbanResult>("iban-validate", { iban }, signal)
}

export function submitForm(values: FormInput) {
  return invoke<{ ok: true; rowId: string; duplicate: boolean }>("submit-form", { ...values })
}

/** Uploads a scan photo and has it read; the backend deletes the photo after a successful read. */
export async function extractFromPhoto(
  userId: string,
  photo: File,
): Promise<{ fields: ExtractedFields; mock: boolean }> {
  const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg"
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(SCANS_BUCKET).upload(path, photo, { contentType: photo.type })
  if (error) throw new ApiError("Uploaden van de foto is mislukt", 500)

  return invoke<{ fields: ExtractedFields; mock: boolean }>("extract-form", { path })
}

// --- Dashboard ----------------------------------------------------------------------------------

/**
 * Dev only: open the app with `?demo` (sales manager) or `?demo=werver` to see the dashboard with made-up numbers
 * without logging in. `import.meta.env.DEV` is false in a production build, so none of this ships.
 */
export const DEMO_MODE: "admin" | "werver" | null =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo")
    ? new URLSearchParams(window.location.search).get("demo") === "werver"
      ? "werver"
      : "admin"
    : null

export async function getKpi(request: KpiRequest): Promise<KpiResponse> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoSalesStats } = await import("@shared/kpi-demo")
    const wervernr = DEMO_MODE === "werver" ? "0212BB" : (request.wervernr ?? null)
    await new Promise((resolve) => setTimeout(resolve, 400))
    return { demo: true, wervernr, stats: demoSalesStats(request.from, request.to, wervernr) }
  }
  return invoke<KpiResponse>("kpi", { ...request })
}

// --- Sales per day ------------------------------------------------------------------------------

export type OnboardingStatus = "accepted" | "refused" | "failed" | "skipped"

export type SubmittedSale = {
  rowId: string
  /** When the server received it (ISO timestamp). */
  received: string
  /** The date filled in on the form, yyyy-MM-dd. */
  datum: string
  wervernaam: string
  wervernr: string
  klantnummer: string
  naam: string
  straat: string
  huisnummer: string
  toevoeging: string
  plaats: string
  /** null: not sent to ZMAdmin yet. */
  onboardingStatus: OnboardingStatus | null
  /** ZMAdmin's explanation when it refused or failed. */
  onboardingMessage: string | null
  /** Sent from the test deployment: onboarded on ZMAdmin's TEST, not in the sheet. */
  test: boolean
}

/**
 * One page of the sales received between `from` and `to` (ISO timestamps), oldest first, with the total for the
 * whole range. Row-level security decides whose: a recruiter gets their own, an admin everyone's.
 */
export async function listSales(
  from: string,
  to: string,
  offset: number,
  limit: number,
): Promise<{ sales: SubmittedSale[]; total: number }> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoSales } = await import("@/features/sales-list/demo-sales")
    await new Promise((resolve) => setTimeout(resolve, 300))
    const all = demoSales(from, DEMO_MODE === "admin")
    return { sales: all.slice(offset, offset + limit), total: all.length }
  }
  const { data, count, error } = await supabase
    .from("submissions")
    .select(
      "row_id, received, datum, wervernaam, wervernr, klantnummer, naam, straat, huisnummer, toevoeging, plaats, onboarding_status, onboarding_message:onboarding_response->>message, test",
      { count: "exact" },
    )
    .gte("received", from)
    .lt("received", to)
    // row_id breaks ties, so a row never shows up on two pages.
    .order("received")
    .order("row_id")
    .range(offset, offset + limit - 1)
  if (error) {
    if (!navigator.onLine) throw new NetworkError("Geen verbinding met de server")
    throw new ApiError("De verkopen konden niet worden geladen", 500)
  }
  const sales = data.map((row) => ({
    rowId: row.row_id,
    received: row.received,
    datum: row.datum,
    wervernaam: row.wervernaam,
    wervernr: row.wervernr,
    klantnummer: row.klantnummer,
    naam: row.naam,
    straat: row.straat,
    huisnummer: row.huisnummer,
    toevoeging: row.toevoeging,
    plaats: row.plaats,
    onboardingStatus: row.onboarding_status,
    onboardingMessage: row.onboarding_message ?? null,
    test: row.test,
  }))
  return { sales, total: count ?? sales.length }
}

// --- Admin ---------------------------------------------------------------------------------------

export type AdminProfileInput = { wervernaam: string; wervernr: string; isAdmin: boolean }

export const adminApi = {
  list: () => invoke<{ users: AdminUser[] }>("admin-users", { action: "list" }).then((result) => result.users),
  invite: (email: string, profile: AdminProfileInput) =>
    invoke("admin-users", { action: "invite", email, redirectTo: window.location.origin, ...profile }),
  update: (id: string, profile: AdminProfileInput) => invoke("admin-users", { action: "update", id, ...profile }),
  resendInvite: (id: string) =>
    invoke("admin-users", { action: "resendInvite", id, redirectTo: window.location.origin }),
  setDisabled: (id: string, disabled: boolean) => invoke("admin-users", { action: "setDisabled", id, disabled }),
}
