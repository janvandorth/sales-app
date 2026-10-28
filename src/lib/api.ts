// Every call from the app to a backend (Supabase edge functions, database and storage; PDOK's address search) goes
// through this file.
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js"
import type { AdminUser } from "@shared/admin-types"
import type { ExtractedFields, FormInput } from "@shared/form-schema"
import type { KpiRequest, KpiResponse } from "@shared/kpi"
import type { SalesMapRequest } from "@shared/sales-map"
import type { SalesMapResponse } from "@shared/sales-map-view"
import type { SalesOpportunitiesRequest, SalesOpportunitiesResponse } from "@shared/sales-opportunities"
import { SCANS_BUCKET } from "@shared/storage"
import type { Recruiter } from "@shared/submission-record"
import {
  placeLabel,
  type AreaAssignment,
  type AreaMember,
  type Bounds,
  type NewAreaAssignment,
} from "@/features/areas/areas"
import {
  toevoeging,
  type Door,
  type DoorVisit,
  type Outcome,
  type PostcodePlace,
  type Street,
} from "@/features/areas/doors"
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

/** Admins only: the app's recruiters that are not admins, to book a sale on someone else or give an area to. */
export async function listRecruiters(): Promise<Recruiter[]> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { DEMO_RECRUITERS } = await import("@/features/areas/demo-areas")
    return DEMO_RECRUITERS
  }
  return invoke<{ recruiters: Recruiter[] }>("recruiters", {}).then((result) => result.recruiters)
}

/**
 * Uploads a scan photo and has it read. The photo stays in storage: its `path` goes with the form, so onboarding
 * can file it with the customer in ZMAdmin.
 */
export async function extractFromPhoto(
  userId: string,
  photo: File,
): Promise<{ fields: ExtractedFields; mock: boolean; path: string }> {
  const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg"
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(SCANS_BUCKET).upload(path, photo, { contentType: photo.type })
  if (error) throw new ApiError("Uploaden van de foto is mislukt", 500)

  const result = await invoke<{ fields: ExtractedFields; mock: boolean }>("extract-form", { path })
  return { ...result, path }
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

export async function getSalesMap(request: SalesMapRequest): Promise<SalesMapResponse> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoSalesMap } = await import("@shared/sales-map-demo")
    const { salesMapView, salesPc5View, salesStreetsView } = await import("@shared/sales-map-view")
    const detailed = DEMO_MODE === "admin"
    await new Promise((resolve) => setTimeout(resolve, 400))
    // The demo has nothing zoomed in: there, only the outlines show.
    if (request.bbox && request.level === "pc5") {
      return { demo: true, detail: salesPc5View({ areaThresholds: [], areas: [] }, detailed, "", "") }
    }
    if (request.bbox) {
      return { demo: true, detail: salesStreetsView({ streetThresholds: [], streets: [] }, detailed, "", "") }
    }
    const map = demoSalesMap(request.from, request.to)
    return { demo: true, map: salesMapView(map, detailed, request.from, request.to) }
  }
  return invoke<SalesMapResponse>("sales-map", { ...request })
}

export async function getSalesOpportunities(request: SalesOpportunitiesRequest): Promise<SalesOpportunitiesResponse> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const demo = await import("@shared/sales-opportunities-demo")
    const shared = await import("@shared/sales-opportunities")
    const detailed = DEMO_MODE === "admin"
    await new Promise((resolve) => setTimeout(resolve, 300))
    if (request.action === "areas") {
      return {
        demo: true,
        action: "areas",
        view: shared.opportunitiesView(demo.demoOpportunityAreas(request.woz), detailed),
      }
    }
    if (request.action === "streets") {
      const streets = demo.demoOpportunityStreets(request.pc4, request.woz)
      return { demo: true, action: "streets", view: shared.opportunityStreetsView(streets, detailed) }
    }
    if (request.action === "pc5") {
      return { demo: true, action: "pc5", view: shared.opportunityPc5View({ areaThresholds: [], areas: [] }, detailed) }
    }
    return {
      demo: true,
      action: "pc6",
      view: shared.opportunityPc6View({ streetThresholds: [], streets: [] }, detailed),
    }
  }
  return invoke<SalesOpportunitiesResponse>("sales-opportunities", { ...request })
}

// --- Sales per day ------------------------------------------------------------------------------

export type OnboardingStatus = "accepted" | "refused" | "failed" | "skipped" | "unconfirmed"

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

// --- Areas --------------------------------------------------------------------------------------

type AreaAssignmentRow = {
  id: string
  postcodes: string[]
  wervernrs: string[]
  starts_on: string
  ends_on: string
  label: string
  note: string
  bbox: number[] | null
  households: number | null
  open: number | null
  members: AreaMember[]
  sold: number
  visited: number
}

/**
 * The areas given out that run on any day from..to: all of them for an admin, a werver's own otherwise (the
 * database function decides), with who works each and what they sold there.
 */
export async function listAreaAssignments(from: string, to: string): Promise<AreaAssignment[]> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoAssignments } = await import("@/features/areas/demo-areas")
    await new Promise((resolve) => setTimeout(resolve, 300))
    return demoAssignments(from, to, DEMO_MODE === "werver" ? "0212BB" : null)
  }
  const { data, error } = await supabase.rpc("list_area_assignments", { p_from: from, p_to: to })
  if (error) {
    if (!navigator.onLine) throw new NetworkError("Geen verbinding met de server")
    throw new ApiError("De gebieden konden niet worden geladen", 500)
  }
  return (data as AreaAssignmentRow[]).map((row) => ({
    id: row.id,
    postcodes: row.postcodes,
    wervernrs: row.wervernrs,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    label: row.label,
    note: row.note,
    bounds: row.bbox?.length === 4 ? (row.bbox as Bounds) : null,
    households: row.households,
    open: row.open,
    members: row.members,
    sold: row.sold,
    visited: row.visited,
  }))
}

/** Admins only (row-level security): gives out an area. */
export async function createAreaAssignment(input: NewAreaAssignment): Promise<void> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoCreate } = await import("@/features/areas/demo-areas")
    return demoCreate(input)
  }
  const { error } = await supabase.from("area_assignments").insert({
    postcodes: input.postcodes,
    wervernrs: input.wervernrs,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    label: input.label,
    note: input.note,
    bbox: input.bounds,
    households: input.households,
    open: input.open,
  })
  if (error) {
    if (!navigator.onLine) throw new NetworkError("Geen verbinding met de server")
    throw new ApiError("Het gebied kon niet worden toegewezen", 500)
  }
}

/** Admins only (row-level security): takes an area back. */
export async function deleteAreaAssignment(id: string): Promise<void> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoDelete } = await import("@/features/areas/demo-areas")
    return demoDelete(id)
  }
  const { error } = await supabase.from("area_assignments").delete().eq("id", id)
  if (error) {
    if (!navigator.onLine) throw new NetworkError("Geen verbinding met de server")
    throw new ApiError("Het gebied kon niet worden verwijderd", 500)
  }
}

/**
 * The neighbourhood and town at a point, from PDOK's address search (free, no key), e.g. "Overvecht, Utrecht".
 * Empty when PDOK has no answer; an area is then named by its postcodes.
 */
export async function lookupPlace(lon: number, lat: number): Promise<string> {
  try {
    const url = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse")
    url.search = new URLSearchParams({
      lon: lon.toFixed(5),
      lat: lat.toFixed(5),
      type: "adres",
      rows: "1",
      fl: "wijknaam,woonplaatsnaam",
    }).toString()
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return ""
    const body = (await response.json()) as { response?: { docs?: { wijknaam?: string; woonplaatsnaam?: string }[] } }
    const doc = body.response?.docs?.[0]
    return placeLabel(doc?.wijknaam, doc?.woonplaatsnaam)
  } catch {
    return ""
  }
}

// --- Walking an area -----------------------------------------------------------------------------

const PDOK_SEARCH = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"

/** PDOK returns at most 100 per request; more pages than this means an area too large to walk anyway. */
const PDOK_PAGE = 100
const PDOK_MAX_PAGES = 10

/** Every document of a PDOK search, page by page. */
async function pdokAll<T>(filters: string[], fields: string): Promise<T[]> {
  const docs: T[] = []
  for (let page = 0; page < PDOK_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      q: "*:*",
      rows: String(PDOK_PAGE),
      start: String(page * PDOK_PAGE),
      fl: fields,
    })
    for (const filter of filters) params.append("fq", filter)
    const response = await fetch(`${PDOK_SEARCH}?${params}`, { signal: AbortSignal.timeout(10_000) }).catch(() => {
      throw new NetworkError("Geen verbinding met de adressenlijst")
    })
    if (!response.ok) throw new ApiError("De adressenlijst gaf geen antwoord", response.status)
    const body = (await response.json()) as { response: { numFound: number; docs: T[] } }
    docs.push(...body.response.docs)
    if (docs.length >= body.response.numFound || body.response.docs.length < PDOK_PAGE) break
  }
  return docs
}

/** "POINT(5.11 52.12)" as [5.11, 52.12]. */
function point(wkt: string): [number, number] {
  const [lon, lat] = wkt
    .replace(/^POINT\(|\)$/g, "")
    .split(" ")
    .map(Number)
  return [lon, lat]
}

/** The postcodes in an area (codes of any level) with their street and where they lie, from the BAG. */
export async function areaPostcodes(codes: string[]): Promise<PostcodePlace[]> {
  type Doc = { postcode: string; straatnaam?: string; woonplaatsnaam?: string; centroide_ll: string }
  const lists = await Promise.all(
    codes.map((code) =>
      pdokAll<Doc>(
        ["type:postcode", `postcode:${code}${code.length < 6 ? "*" : ""}`],
        "postcode,straatnaam,woonplaatsnaam,centroide_ll",
      ),
    ),
  )
  return lists.flat().map((d) => {
    const [lon, lat] = point(d.centroide_ll)
    return { postcode: d.postcode, straat: d.straatnaam ?? "", plaats: d.woonplaatsnaam ?? "", lon, lat }
  })
}

/** Every address of a street within its postcodes in the area, from the BAG. */
export async function streetDoors(street: Street): Promise<Door[]> {
  type Doc = {
    postcode: string
    huisnummer: number
    huisletter?: string
    huisnummertoevoeging?: string
    straatnaam: string
    woonplaatsnaam: string
  }
  const quoted = street.name.replace(/(["\\])/g, "\\$1")
  const docs = await pdokAll<Doc>(
    ["type:adres", `postcode:(${street.postcodes.join(" OR ")})`, `straatnaam:"${quoted}"`],
    "postcode,huisnummer,huisletter,huisnummertoevoeging,straatnaam,woonplaatsnaam",
  )
  return docs.map((d) => ({
    postcode: d.postcode,
    huisnummer: d.huisnummer,
    toevoeging: toevoeging(d.huisletter, d.huisnummertoevoeging),
    straat: d.straatnaam,
    plaats: d.woonplaatsnaam,
  }))
}

type DoorVisitRow = {
  id: string
  postcode: string
  huisnummer: number
  toevoeging: string
  straat: string
  outcome: Outcome
  visited_at: string
  wervernr: string
}

/** How far back earlier visits to a door still show. */
const VISITS_DAYS_BACK = 90

/**
 * The doors rung in these postcodes in the past three months that the werver may see: their own, and those of
 * whoever walks the same areas (row-level security decides).
 */
export async function listDoorVisits(postcodes: string[]): Promise<DoorVisit[]> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoVisits } = await import("@/features/areas/demo-areas")
    return demoVisits(postcodes)
  }
  const since = new Date(Date.now() - VISITS_DAYS_BACK * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from("door_visits")
    .select("id, postcode, huisnummer, toevoeging, straat, outcome, visited_at, wervernr")
    .in("postcode", postcodes)
    .gte("visited_at", since)
  if (error) {
    if (!navigator.onLine) throw new NetworkError("Geen verbinding met de server")
    throw new ApiError("De deuren konden niet worden geladen", 500)
  }
  return (data as DoorVisitRow[]).map((row) => ({
    id: row.id,
    postcode: row.postcode,
    huisnummer: row.huisnummer,
    toevoeging: row.toevoeging,
    straat: row.straat,
    plaats: "",
    outcome: row.outcome,
    visitedAt: row.visited_at,
    wervernr: row.wervernr,
  }))
}

/** Logs how it went at a door; returns the visit's id, for "Ongedaan". */
export async function recordDoorVisit(
  visit: Door & { outcome: Outcome; assignmentId: string; wervernr: string },
): Promise<string> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoRecordVisit } = await import("@/features/areas/demo-areas")
    return demoRecordVisit(visit)
  }
  const { data, error } = await supabase
    .from("door_visits")
    .insert({
      assignment_id: visit.assignmentId,
      wervernr: visit.wervernr,
      postcode: visit.postcode,
      huisnummer: visit.huisnummer,
      toevoeging: visit.toevoeging,
      straat: visit.straat,
      outcome: visit.outcome,
    })
    .select("id")
    .single()
  if (error) {
    if (!navigator.onLine) throw new NetworkError("Geen verbinding: deze deur is niet opgeslagen")
    console.error("door_visits insert", error)
    throw new ApiError("De deur kon niet worden opgeslagen", 500)
  }
  return (data as { id: string }).id
}

/** Takes back a door logged today. */
export async function deleteDoorVisit(id: string): Promise<void> {
  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoDeleteVisit } = await import("@/features/areas/demo-areas")
    return demoDeleteVisit(id)
  }
  const { error } = await supabase.from("door_visits").delete().eq("id", id)
  if (error) throw new ApiError("Ongedaan maken lukte niet", 500)
}

// --- Admin ---------------------------------------------------------------------------------------

export type AdminProfileInput = { wervernaam: string; wervernr: string; isAdmin: boolean; scanContactFields: boolean }

export const adminApi = {
  list: () => invoke<{ users: AdminUser[] }>("admin-users", { action: "list" }).then((result) => result.users),
  invite: (email: string, profile: AdminProfileInput) => invoke("admin-users", { action: "invite", email, ...profile }),
  update: (id: string, profile: AdminProfileInput) => invoke("admin-users", { action: "update", id, ...profile }),
  resendInvite: (id: string) =>
    invoke("admin-users", { action: "resendInvite", id, redirectTo: window.location.origin }),
  setDisabled: (id: string, disabled: boolean) => invoke("admin-users", { action: "setDisabled", id, disabled }),
}
