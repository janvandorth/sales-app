import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js"
import type { AdminUser } from "@shared/admin-types"
import type { ExtractedFields, FormInput } from "@shared/form-schema"
import { SCANS_BUCKET } from "@shared/storage"
import { supabase } from "@/lib/supabase"

/** Thrown when the request never reached the server (offline, DNS, timeout). Safe to retry later. */
export class NetworkError extends Error {}

/** Thrown when the server answered with an error. Retrying the same request will not help. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Thrown when the session is no longer valid (e.g. revoked). The user has been signed out on this device. */
export class AuthError extends Error {}

async function invoke<T>(name: string, body: Record<string, unknown>, signal?: AbortSignal, isRetry = false): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body, signal })
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

export async function extractFromPhoto(userId: string, photo: File): Promise<{ fields: ExtractedFields; mock: boolean }> {
  const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg"
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(SCANS_BUCKET).upload(path, photo, { contentType: photo.type })
  if (error) throw new ApiError("Uploaden van de foto is mislukt", 500)

  return invoke<{ fields: ExtractedFields; mock: boolean }>("extract-form", { path })
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
