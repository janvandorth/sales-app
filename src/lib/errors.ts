/** The request never reached the server (offline, DNS, timeout). Safe to retry later. */
export class NetworkError extends Error {}

/** The session is no longer valid (e.g. revoked); the user has been signed out on this device. */
export class AuthError extends Error {}

/** The server answered with an error; retrying the same request will not help. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Errors that say nothing about the request itself, so the same request may succeed later. */
export function isRetryable(error: unknown): boolean {
  return error instanceof NetworkError || error instanceof AuthError
}

/** A message that is safe to show to the user. */
export function getErrorMessage(error: unknown, fallback = "Er ging iets mis"): string {
  if (error instanceof ApiError || error instanceof NetworkError || error instanceof AuthError) return error.message
  return fallback
}
