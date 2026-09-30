import { optionalEnv, requireEnv } from "./env.ts"
import { SHEET_COLUMNS, type SheetRow } from "./form-schema.ts"

// Rows are appended through an Apps Script web app bound to the sheet (see supabase/google-sheets-webhook.gs).
// This avoids a Google Cloud project and service-account keys; a shared secret authenticates the backend.

/** True when the sheet webhook is configured. */
export function isSheetsConfigured(): boolean {
  return Boolean(optionalEnv("SHEETS_WEBHOOK_URL") && optionalEnv("SHEETS_WEBHOOK_SECRET"))
}

/** Appends one row to the sheet, in SHEET_COLUMNS order. */
export async function appendSheetRow(row: SheetRow): Promise<void> {
  // Apps Script answers POSTs with a redirect to the result; fetch follows it (as a GET), which is intended.
  const response = await fetch(requireEnv("SHEETS_WEBHOOK_URL"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: requireEnv("SHEETS_WEBHOOK_SECRET"),
      tab: optionalEnv("SHEETS_TAB") ?? "",
      row: SHEET_COLUMNS.map((column) => row[column]),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  // Apps Script always answers 200; the outcome is in the body.
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok !== true) {
    throw new Error(`Sheet append failed: ${response.status} ${JSON.stringify(result)}`)
  }
}
