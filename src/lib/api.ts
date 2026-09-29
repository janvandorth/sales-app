import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js"
import type { ExtractedFields, FormInput } from "@shared/form-schema"
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

async function invoke<T>(name: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body, signal })
  if (!error) return data as T

  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(payload.error ?? "Er ging iets mis", response.status)
  }
  if (signal?.aborted) throw signal.reason
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    throw new NetworkError("Geen verbinding met de server")
  }
  throw error
}

export type PostcodeResult = { found: true; straat: string; plaats: string } | { found: false }

export function lookupPostcode(postcode: string, huisnummer: string, signal?: AbortSignal) {
  return invoke<PostcodeResult>("postcode-lookup", { postcode, huisnummer }, signal)
}

export type IbanResult = { valid: boolean; iban: string; bank?: string | null; bic?: string | null }

export function validateIban(iban: string, signal?: AbortSignal) {
  return invoke<IbanResult>("iban-validate", { iban }, signal)
}

export function getAppConfig() {
  return invoke<{ scanEnabled: boolean; scanMock: boolean }>("app-config", {})
}

export function submitForm(values: FormInput) {
  return invoke<{ ok: true; rowId: string; duplicate: boolean }>("submit-form", { ...values })
}

export async function extractFromPhoto(userId: string, photo: File): Promise<{ fields: ExtractedFields; mock: boolean }> {
  const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg"
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from("scans").upload(path, photo, { contentType: photo.type })
  if (error) throw new ApiError("Uploaden van de foto is mislukt", 500)

  return invoke<{ fields: ExtractedFields; mock: boolean }>("extract-form", { path })
}
