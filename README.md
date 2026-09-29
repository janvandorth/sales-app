# Bellijst — sales app

Mobile-first PWA that recruiters (wervers) use to register sales. React + Vite + shadcn/ui on Vercel,
Supabase for auth, database, storage and edge functions.

## Structure

```
src/                         Web app
  components/form-page.tsx   Draft autosave, offline outbox, camera scan + fill animation
  components/sales-form.tsx  The form; debounced postcode + IBAN checks
  hooks/use-debounced-check  Spinner immediately, request after 2 s, aborts stale requests
  hooks/use-outbox           Offline queue (IndexedDB), auto-flush when back online
supabase/
  migrations/                profiles, submissions, `scans` storage bucket, RLS
  functions/
    _shared/form-schema.ts   Zod schema shared by web app (`@shared`) and edge functions
    postcode-lookup          Proxy to Zeker en Mobiel postcode API
    iban-validate            Mod-97 check + proxy to Zeker en Mobiel IBAN API
    extract-form             Photo -> Claude -> structured fields
    submit-form              Validates, stores in `submissions`, appends to Google Sheet
    app-config               Feature flags for the client (scan enabled?)
```

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

## Supabase

Project ref: `nrdpixagvynzexwzqtlf`. Sign-ups are disabled; add users in the dashboard
(Authentication → Users). A profile row is created automatically; set wervernaam/wervernr via
user metadata (`{"wervernaam": "...", "wervernr": "..."}`) or by updating `public.profiles`.

Deploy functions:

```bash
supabase functions deploy --use-api --project-ref nrdpixagvynzexwzqtlf
```

Secrets (`supabase secrets set KEY=value --project-ref nrdpixagvynzexwzqtlf`):

| Secret | Purpose |
| --- | --- |
| `ZM_API_KEY` | Zeker en Mobiel contracts API key (postcode + IBAN) |
| `ANTHROPIC_API_KEY` | Enables the camera scan (button is greyed out without it) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account with edit access to the sheet |
| `GOOGLE_SHEET_ID` | Target spreadsheet ID |
| `GOOGLE_SHEET_TAB` | Tab name (default `Sheet1`) |

Rows that could not be written to the sheet have `sheet_synced_at is null` in `submissions`.
