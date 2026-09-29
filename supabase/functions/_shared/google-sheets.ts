import { SHEET_COLUMNS, type SheetRow } from "./form-schema.ts"

type ServiceAccount = { client_email: string; private_key: string }

/** True when all Google Sheets secrets are configured. */
export function isSheetsConfigured(): boolean {
  return Boolean(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") && Deno.env.get("GOOGLE_SHEET_ID"))
}

/** Appends one row to the configured sheet tab, in SHEET_COLUMNS order. */
export async function appendSheetRow(row: SheetRow): Promise<void> {
  const account = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!) as ServiceAccount
  const sheetId = Deno.env.get("GOOGLE_SHEET_ID")!
  const tab = Deno.env.get("GOOGLE_SHEET_TAB") ?? "Sheet1"

  const token = await getAccessToken(account)
  const range = encodeURIComponent(`${tab}!A1`)
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [SHEET_COLUMNS.map((column) => row[column])] }),
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!response.ok) throw new Error(`Google Sheets append failed: ${response.status} ${await response.text()}`)
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )
  const unsigned = `${header}.${claims}`

  const pem = account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    }),
  })
  if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`)
  return ((await response.json()) as { access_token: string }).access_token
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
