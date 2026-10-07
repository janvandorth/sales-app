# Z&M Sales — sales app

Mobile-first web app (installable PWA) that recruiters ("wervers") of Zeker en Mobiel use to register sales on
the street, also offline. A sale is stored in Supabase, appended to a Google Sheet for the back office and sent to
the onboarding endpoint of the Contracts API, which creates the customer in ZMAdmin.

- **Frontend:** React 19 + Vite + TypeScript, shadcn/ui (Tailwind v4), react-hook-form + zod, TanStack Query.
  Hosted on Vercel; every push to `main` deploys.
- **Backend:** Supabase — Auth, Postgres (row level security), Storage, and Deno edge functions.
- **External:** Zeker en Mobiel contracts API (postcode + IBAN), Claude (reading photographed paper forms),
  Google Sheets (via an Apps Script web app), ZMSuite Contracts API onboarding (`Onboarding/2026.1/Appeee/Paper`).

## Getting started

```bash
npm install
cp .env.example .env   # Supabase URL + publishable key (public values)
npm run dev
```

| Command                   | What it does                                                           |
| ------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`             | Dev server on http://localhost:5173 (or `$PORT`)                       |
| `npm run check`           | Everything CI runs: lint, format check, typecheck, tests, `deno check` |
| `npm run test`            | Unit tests (Vitest) for the app and the shared backend modules         |
| `npm run format`          | Format with Prettier                                                   |
| `npm run check:functions` | Type-check all edge functions with Deno                                |

## Architecture

```
 Phone (PWA)                              Supabase                                   External
 ─────────────                            ────────                                   ────────
 React app ──── login (Supabase Auth) ──▶ auth.users ──trigger──▶ profiles
     │
     ├─ postcode / IBAN check ──────────▶ postcode-lookup, iban-validate ──────────▶ ZM contracts API
     ├─ camera scan: upload photo ──────▶ storage bucket "scans"
     │               then read ─────────▶ extract-form ─────────────────────────────▶ Claude
     ├─ submit (or queue when offline) ─▶ submit-form ──▶ submissions table
     │                                         ├───────────────────────────────────▶ Google Sheet (Apps Script)
     │                                         └───────────────────────────────────▶ Contracts API onboarding
     │                                    sync-sheet (hourly, pg_cron) appends rows not in the sheet yet
     │                                    sync-onboarding (hourly, pg_cron) sends rows without an onboarding answer
     ├─ dashboard ──────────────────────▶ kpi ─────────────────────────────────────────▶ Contracts API stats (ZMAdmin)
     └─ admin page (admins only) ───────▶ admin-users ──▶ auth admin API, profiles, profile_changes
```

The browser only talks to Supabase. All calls to external services go through edge functions, so secrets
never reach the phone and there are no CORS issues with third parties.

## Project structure

```
src/
  App.tsx                       Chooses the screen: loading, login, set password, form or admin
  main.tsx                      React root, TanStack Query provider, service worker registration
  features/                     One folder per feature; it owns its pages, components, hooks and storage
    auth/                       Login, set/reset password, session hook (incl. invite links)
    sales-form/                 The form page
      form-page.tsx             Composes header, form, outbox dialog and scan overlay
      sales-form.tsx            The form: four sections + Wissen/Versturen bar
      sections/                 Klant, Adres, Contact, Contract cards
      fields/                   Reusable form fields bound to react-hook-form
      use-address-lookup.ts     Postcode + huisnummer → straat + plaats
      use-iban-check.ts         Background IBAN check + confirm-before-submit when invalid
      use-draft.ts              Restore/autosave the unfinished form (IndexedDB)
      use-scan-fill.ts          Camera scan → Claude → typing animation into the form
    outbox/                     Offline queue ("Wachtrij"): storage, auto-send hook, dialog
    dashboard/                  Results: sales per week/month, cancellations and their reasons (account menu)
    admin/                      Recruiter management (list, invite, edit, block)
  components/                   Shared UI: page-header.tsx and shadcn components in ui/ (generated)
  hooks/                        Generic hooks: useOnline, useDebouncedCheck, useProfile
  lib/                          api.ts (every backend call), errors, Supabase client, IndexedDB, PWA
supabase/
  migrations/                   Database schema, RLS policies, triggers — apply in order
  functions/                    Edge functions (Deno), one folder each; identical deno.json files
    _shared/                    Code shared by functions; files without Deno APIs are also used by the app
      form-schema.ts            THE form definition (zod) — used by the app (`@shared/…`) and the server
      submission-record.ts      Form values → database record → Google Sheet row
  templates/                    Dutch invite / password reset emails
  google-sheets-webhook.gs      Apps Script that lives in the Google Sheet
scripts/                        check-functions.sh and repo-level tests
```

## Key flows

**Submitting a form.** The app validates with `formSchema`, then `useOutbox().submit()` sends it to
`submit-form`. The server validates again with the same schema, adds the recruiter from the caller's profile,
stores the row and appends it to the sheet. If the phone is offline or the session expired, the form goes to the
outbox (IndexedDB) and is sent automatically later. Every form has a `rowId` generated on the phone, so sending
it twice never creates a duplicate.

**Postcode and IBAN checks.** `useDebouncedCheck` shows a spinner immediately, waits until typing has stopped
for 2 s, then calls the edge function and aborts calls for outdated input. Straat and plaats are read-only
unless the lookup fails, the phone is offline or the recruiter taps "Aanpassen". An invalid IBAN may be sent,
but online the recruiter has to confirm it first.

**Camera scan.** The photo is downscaled, uploaded to the private `scans` bucket and read by `extract-form`
with Claude (structured output generated from `extractionSchema`). The photo is deleted after a successful read.
Without `ANTHROPIC_API_KEY` the function returns demo data.

**Dashboard.** Account menu → "Mijn resultaten" (recruiters) or "Resultaten team" (admins). The `kpi` function
reads ZMAdmin through the Contracts API (`GET …/Sales/2026.1/Stats`, ZMSuite branch `Jan/feature/sales-stats`):
gross sales per day and recruiter, with each cancellation counted on the day of the sale, plus the cancelled
customers with their reason. A recruiter always gets their own wervernr (which must be their ZMAdmin recruiter
code); only admins may pick another recruiter or the whole team. "Opzeggingen bijgewerkt t/m" is the most recent
cancellation entered in ZMAdmin; periods ending less than four weeks before that are hatched as not complete. The
app loads a year at a time going back ("Eerder"). Without `STATS_API_URL`/`STATS_API_KEY` the function returns
made-up numbers and the page says so. In development, open `http://localhost:5173/?demo` (sales manager) or
`?demo=werver` to see the dashboard with demo data without logging in.

**Login.** Accounts are invite-only (sign-ups are disabled). An invite or password-reset email opens the app on
the set-password screen. If the server rejects a session (e.g. revoked), the app refreshes it once and
otherwise signs out on that device only.

## Security model

- **Identity comes from the verified token, never from the request body.** `requireUser()` checks the token;
  user id, wervernaam and wervernr are taken from the caller's own profile (see `submission-record.ts`).
- **Row level security:** recruiters can read only their own profile, submissions and scan photos. They can
  upload photos only to their own folder and cannot write to `profiles` or `submissions` directly; those writes
  go through edge functions.
- **Submitted sales are immutable:** a database trigger blocks changes and deletes, also for the service role;
  only the back-office status columns, `sheet_synced_at` and the `onboarding_*` columns may change. A reused `rowId` of another recruiter is
  rejected.
- **Auditing:** every profile change is written to `profile_changes` with the acting admin.
- **CORS** is limited to `ALLOWED_ORIGINS`; `sync-sheet` and `sync-onboarding` require `CRON_SECRET`.
- **Scan photos** are deleted after they have been read successfully.

## Glossary

The UI and the business terms are Dutch; code structure and comments are English. Dutch domain terms are kept
as-is in code so they match the Google Sheet and the back office.

| Term                           | Meaning                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| werver / wervernaam / wervernr | Recruiter (sales agent), their display name and recruiter number               |
| klantnummer                    | Customer number                                                                |
| geslacht                       | Gender (Man / Vrouw)                                                           |
| voorletters + naam             | Initials + surname, e.g. "P.J. Jansen"                                         |
| huisnummer / toevoeging        | House number / addition (e.g. "A")                                             |
| straat / plaats                | Street / city                                                                  |
| landcode                       | Country dialling code, e.g. "+31"                                              |
| per post                       | Customer has no email and receives mail by post                                |
| contracttype                   | Service or Zakelijk (business)                                                 |
| betaaltermijn / betaalperiode  | Payment term and method (machtiging = direct debit, acceptgiro = payment slip) |
| opmerkingen                    | Remarks (digital only, not on the paper form)                                  |
| bruto / netto                  | Sales written / sales that were not cancelled                                  |
| opzegging / opgezegd / uitval  | Cancellation / cancelled / share of the sales that was cancelled               |
| wachtrij / outbox              | Forms waiting to be sent (`features/outbox`)                                   |
| Bellijst                       | Former name of the app ("call list"); now called Z&M Sales                     |

## Conventions

- **Where code goes:** feature-specific code lives in `src/features/<feature>/`; shared UI in
  `src/components/`, generic hooks in `src/hooks/`, infrastructure in `src/lib/`. Every backend call is in
  `src/lib/api.ts`.
- **Server state** (profile, admin list, outbox) uses TanStack Query; form state uses react-hook-form.
- **Errors:** throw `NetworkError` / `AuthError` / `ApiError` (`src/lib/errors.ts`); show them with
  `getErrorMessage()`. In edge functions throw `HttpError`; `serve()` turns it into a JSON response.
- **Environment variables in functions:** `requireEnv()` / `optionalEnv()`, never `Deno.env.get(…)!`.
- **shadcn components** in `src/components/ui/` are generated; add new ones with `npx shadcn add <name>`.

**Adding a form field:** add it to `formSchema` (and to `extractionSchema` if it is on the paper form), to
`createEmptyForm()`, to a section in `sections/`, to `SubmissionRecord` + a migration for the column, and to
`SheetRow` / `SHEET_COLUMNS` if the sheet should get it. TypeScript and the tests catch most omissions.

## Deployment

- **Frontend:** push to `main` → Vercel builds and deploys. Env vars `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` are set in the Vercel project.
- **Edge functions:** `supabase functions deploy --use-api --project-ref nrdpixagvynzexwzqtlf`
- **Database:** add a file to `supabase/migrations/` and apply it (`supabase db push`, or through the Supabase
  dashboard/MCP; keep the file name's version equal to the applied version).
- **Auth URLs** (Site URL, redirect URLs) and **email templates** are configured in the Supabase dashboard;
  `supabase/config.toml` and `supabase/templates/` mirror them.

### Supabase project and secrets

Project ref `nrdpixagvynzexwzqtlf`. Set secrets with
`supabase secrets set NAME=value --project-ref nrdpixagvynzexwzqtlf`.

| Secret                   | Purpose                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `ZM_API_KEY`             | Zeker en Mobiel contracts API key (postcode + IBAN)                                                    |
| `ANTHROPIC_API_KEY`      | Enables real camera scans (without it, scans return demo data)                                         |
| `ANTHROPIC_WORKSPACE_ID` | Only needed when the API key is not scoped to a workspace                                              |
| `SHEETS_WEBHOOK_URL`     | Apps Script web app URL of the Google Sheet (see `supabase/google-sheets-webhook.gs`)                  |
| `SHEETS_WEBHOOK_SECRET`  | Shared secret; must equal `SECRET` in the Apps Script                                                  |
| `SHEETS_TAB`             | Optional tab name (default: first tab)                                                                 |
| `ALLOWED_ORIGINS`        | Browser origins allowed to call the functions (comma separated, `*` wildcard)                          |
| `CRON_SECRET`            | Shared secret for the hourly `sync-sheet` call (pg_cron); also in Vault as `sync_sheet_cron_secret`    |
| `ONBOARDING_API_URL`     | Contracts API onboarding endpoint, e.g. `http://test.zekerenmobiel.nl/Onboarding/2026.1/Appeee/Paper`  |
| `ONBOARDING_API_KEY`     | `X-API-Key` for the Contracts API onboarding endpoint                                                  |
| `STATS_API_URL`          | Contracts API stats endpoint for the dashboard, e.g. `http://test.zekerenmobiel.nl/Sales/2026.1/Stats` |
| `STATS_API_KEY`          | `X-API-Key` for the stats endpoint; without URL and key the dashboard shows demo numbers               |

### Recruiters

Admins manage recruiters in the app (account menu → "Beheer wervers"). A profile row is created automatically
for every new user from the invite metadata (`wervernaam`, `wervernr`).
