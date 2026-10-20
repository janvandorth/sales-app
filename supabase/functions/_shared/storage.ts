// Shared between the web app (via `@shared`) and the edge functions.

/**
 * Private bucket for scan photos, stored as `<user id>/<uuid>.<ext>`. A scan stays until onboarding has accepted
 * the sale it belongs to; sync-onboarding deletes scans older than SCAN_RETENTION_DAYS (discarded or refused forms).
 */
export const SCANS_BUCKET = "scans"

/** How long a scan may stay in the bucket, also when its sale never reached onboarding. */
export const SCAN_RETENTION_DAYS = 30

/** Whether `path` is a scan in this user's own folder, as the app uploads it. */
export function isOwnScanPath(path: string, userId: string): boolean {
  return new RegExp(`^${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path)
}
