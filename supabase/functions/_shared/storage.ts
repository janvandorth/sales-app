// Shared between the web app (via `@shared`) and the edge functions.

/** Private bucket for scan photos, stored as `<user id>/<uuid>.<ext>`; deleted after a successful read. */
export const SCANS_BUCKET = "scans"
