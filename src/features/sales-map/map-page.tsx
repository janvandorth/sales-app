import { useEffect, useMemo, useRef, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import * as maplibregl from "maplibre-gl"
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl"
import { ArrowLeftIcon, ZoomInIcon } from "lucide-react"
import { toast } from "sonner"
import { AppMenu } from "@/components/app-menu"
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSalesMap, getSalesOpportunities, lookupPlace } from "@/lib/api"
import { SHOW_AREAS } from "@/lib/deployment"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type { DetailView, MapArea, SalesStreet } from "@shared/sales-map-view"
import type { OpportunitiesView, OpportunityArea, OpportunityDetail, WozBand } from "@shared/sales-opportunities"
import {
  areaTitle,
  firstName,
  centreOf,
  overlaps,
  periodsFor,
  pickArea,
  summarize,
  unionBounds,
  type AreaAssignment,
  type AssignStart,
  type Bounds,
  type PickedArea,
} from "../areas/areas"
import { AssignPanel } from "../areas/assign-panel"
import {
  addHatch,
  applyOverlay,
  codeAt,
  geometryBounds,
  overlayLayers,
  finerThan,
  pickLevel,
  setHover,
  sourceBounds,
  type Overlay,
} from "../areas/map-overlay"
import { useAreaAssignments, useCreateAreaAssignment, useRecruiters } from "../areas/use-areas"
import { addDays, formatDay, today } from "../dashboard/periods"
import { BACKGROUND_SOURCE, postcodeSource } from "./map-setup"
import { AGE_STOPS, fillColor, fillOpacity, KANSEN_COLORS, STREET_OPACITY } from "./scale"

type Props = {
  onBack: () => void
  /** Admins may give out areas: the map gets a "Toewijzen" view. */
  isAdmin?: boolean
  /** Opens on "Toewijzen", for this werver and these days when given (from the planning). */
  assign?: AssignStart
  /** Opens on this area, outlined: a werver's own. */
  focus?: AreaAssignment
}
/** "Toewijzen" is "Kansen" with the areas given out over it and a tap picking areas instead of explaining them. */
type Mode = "sales" | "kansen" | "assign"
type Shading = Exclude<Mode, "assign">
type Level = "pc4" | "pc5" | "pc6"
type Detail = SalesStreet | OpportunityDetail

const PERIODS = [
  { days: 30, label: "30 dagen" },
  { days: 90, label: "90 dagen" },
  { days: 365, label: "1 jaar" },
] as const

/** From this zoom the PC5 areas in view are drawn over the PC4 areas. */
const PC5_ZOOM = 11

/** From this zoom the streets (PC6) in view take the place of the PC5 areas. */
const STREET_ZOOM = 13

/** From this zoom on the way in, a hint says smaller areas come when zooming in further. */
const ZOOM_HINT = 10

/** How strongly the PC4 areas still show under the PC5 areas or streets. */
const FAINT = 0.2

/**
 * Shades kept per level while zoomed in, so panning back needs no new answer; beyond this only the current view's
 * are kept. Zooming out to PC4 or changing the filter lets them all go.
 */
const MAX_KEPT = 40_000

/** Answers for one view are dropped from the query cache this soon after the view is left. */
const VIEW_CACHE_MS = 30_000

const LEVEL_NAMES: Record<Level, string> = { pc4: "PC4", pc5: "PC5", pc6: "PC6" }

/** The badge at the top left of the map, for loading while panning and the zoom hint. */
const BADGE_CLASS =
  "absolute top-3 left-3 z-10 flex items-center gap-2.5 rounded-full bg-background/95 px-4 py-2.5 text-base font-medium shadow-lg"

/** What the map draws for one area: the backend's shade, and on the sales map the newest sale's age. */
type Shade = { level: number; age?: number }

/** The PC5 areas and streets seen while zoomed in, for one filter (`key`). */
type Seen = { key: string; pc5: Map<string, Detail>; pc6: Map<string, Detail> }

const nothingSeen = (key: string): Seen => ({ key, pc5: new Map(), pc6: new Map() })

/** `seen` with the areas of `detail` added; past MAX_KEPT, only these. */
function withDetail(seen: Seen, detail: DetailView<Detail> | undefined): Seen {
  if (!detail) return seen
  const level = detail.level
  const kept = seen[level].size + detail.areas.length > MAX_KEPT ? new Map() : new Map(seen[level])
  for (const area of detail.areas) kept.set(area.postcode, area)
  return { ...seen, [level]: kept }
}

/**
 * Two views of the areas, everything computed by the backend. "Verkopen": where the team sold, red where the newest
 * sale is days old fading to grey, darker where more was sold. "Kansen": where households in streets of a WOZ band
 * are still not a customer, pale to deep blue. A PC4 is shaded like its best street, a PC5 too; zoomed in, the
 * streets in view are drawn by themselves on the national street scale. The outlines are vector tiles; the backend
 * only says what each postcode is coloured by. Only admins also get the numbers, which the backend leaves out for
 * recruiters.
 */
export function SalesMapPage({ onBack, isAdmin = false, assign, focus }: Props) {
  const [mode, setMode] = useState<Mode>(assign ? "assign" : focus ? "kansen" : "sales")
  const shading: Shading = mode === "sales" ? "sales" : "kansen"
  const [periodDays, setPeriodDays] = useState<number>(90)
  const [woz, setWoz] = useState<WozBand>("low")
  /** The map's zoom, and once zoomed in its box and whether PC5 areas or streets fill it. */
  const [view, setView] = useState<MapView>({ zoom: 7, bbox: null, level: "pc5" })
  const { bbox, level } = view
  const until = today()
  const from = addDays(until, -(periodDays - 1))

  const sales = useQuery({
    queryKey: ["sales-map", from, until],
    queryFn: () => fetchSalesMap(from, until),
    placeholderData: keepPreviousData,
    enabled: mode === "sales",
  })
  const salesDetail = useQuery({
    queryKey: ["sales-map-detail", from, until, bbox, level],
    queryFn: () => fetchSalesDetail(from, until, bbox!, level),
    enabled: mode === "sales" && bbox !== null,
    gcTime: VIEW_CACHE_MS,
  })
  const kansen = useQuery({
    queryKey: ["sales-opportunities", woz],
    queryFn: async () => {
      const response = await getSalesOpportunities({ action: "areas", woz })
      if (response.action !== "areas") throw new Error("Onverwacht antwoord")
      return response
    },
    placeholderData: keepPreviousData,
    enabled: shading === "kansen",
    // Customers are counted once a night; no need to ask again while the page is open.
    staleTime: 15 * 60_000,
  })
  const kansenDetail = useQuery({
    queryKey: ["sales-opportunities-detail", woz, bbox, level],
    queryFn: async () => {
      const response = await getSalesOpportunities({ action: level, woz, bbox: bbox! })
      return response.action === level ? response.view : undefined
    },
    enabled: shading === "kansen" && bbox !== null,
    staleTime: 15 * 60_000,
    gcTime: VIEW_CACHE_MS,
  })

  // Giving out areas: what was given out in the chosen days, and a year of sales for "laatste verkoop".
  const assigning = mode === "assign"
  const [periods] = useState(() => periodsFor(until, assign?.days))
  const [period, setPeriod] = useState(
    () =>
      periods.find((p) => p.startsOn === assign?.days?.startsOn && p.endsOn === assign.days.endsOn) ??
      periods.find((p) => p.key === "week")!,
  )
  const [chosen, setChosen] = useState<string[]>(assign?.wervernr ? [assign.wervernr] : [])
  const [picked, setPicked] = useState<PickedArea[]>([])
  // The level areas are picked at; PC6 follows the zoom, a larger one holds at every zoom.
  const [pickAt, setPickAt] = useState<Level>("pc6")
  const [note, setNote] = useState("")
  const [naming, setNaming] = useState(false)
  const recruiters = useRecruiters(assigning)
  const given = useAreaAssignments(period.startsOn, period.endsOn, assigning)
  const create = useCreateAreaAssignment()
  const yearFrom = addDays(until, -364)
  const salesYear = useQuery({
    queryKey: ["sales-map", yearFrom, until],
    queryFn: () => fetchSalesMap(yearFrom, until),
    enabled: assigning,
  })
  const salesYearDetail = useQuery({
    queryKey: ["sales-map-detail", yearFrom, until, bbox, level],
    queryFn: () => fetchSalesDetail(yearFrom, until, bbox!, level),
    enabled: assigning && bbox !== null,
    gcTime: VIEW_CACHE_MS,
  })

  const query = mode === "sales" ? sales : kansen
  const salesMap = sales.data?.map
  const opportunities = kansen.data?.view
  const detailQuery = mode === "sales" ? salesDetail : kansenDetail
  const detail: DetailView<Detail> | undefined = detailQuery.data

  // Every answer for this filter is added to what was seen, so panning back shows its shades at once. Zoomed out to
  // PC4, or with another filter, it all goes.
  const filter = bbox === null ? "" : mode === "sales" ? `sales/${from}/${until}` : `kansen/${woz}`
  // Adjusted while rendering, not in an effect, so the map gets the new shades in the same render.
  const [seen, setSeen] = useState<Seen>(() => nothingSeen(""))
  const [added, setAdded] = useState<DetailView<Detail> | undefined>()
  if (seen.key !== filter || detail !== added) {
    setAdded(detail)
    setSeen(withDetail(seen.key === filter ? seen : nothingSeen(filter), filter === "" ? undefined : detail))
  }
  const current = seen.key === filter ? seen : nothingSeen(filter)

  /** The level the map crossed into while its tiles are not all drawn yet; reported by the map as it zooms. */
  const [drawing, setDrawing] = useState<Level | null>(null)

  // Zoomed in to streets, the PC5 areas stay until the first streets have arrived, so the map never goes blank.
  const shown: Level =
    bbox === null ? "pc4" : level === "pc6" && current.pc6.size === 0 && detailQuery.isFetching ? "pc5" : level
  // Giving out areas, the outlines are those of the level a tap picks.
  const outlined = assigning ? pickLevel(shown, pickAt) : null
  // PC4 fades to a tint only once the finer level has something to show.
  const faint = shown !== "pc4" && current[shown].size > 0
  const fetching = bbox !== null && detailQuery.isFetching
  // A level switch, in or out, shows in the middle until the new level's tiles are drawn and its shades are in; the
  // map reports the drawing, this carries it on through the answer. Panning within a level only shows top left.
  const [switching, setSwitching] = useState<Level | null>(null)
  if (drawing !== null && switching !== drawing) setSwitching(drawing)
  if (drawing === null && switching !== null && !fetching) setSwitching(null)
  const panning = switching === null && fetching ? level : null
  // Close to the next level, or zoomed in on a view too wide for it (the backend refuses those): say where to go.
  const zoomHint =
    (bbox === null && view.zoom >= ZOOM_HINT) || (bbox !== null && detailQuery.isError)
      ? "Zoom verder in voor kleinere gebieden"
      : level === "pc5" && view.zoom >= STREET_ZOOM - 1
        ? "Zoom verder in voor de straten"
        : null

  const salesAreas = useMemo(() => new Map(salesMap?.areas.map((a) => [a.postcode, a]) ?? []), [salesMap])
  const kansenAreas = useMemo(() => new Map(opportunities?.areas.map((a) => [a.postcode, a]) ?? []), [opportunities])
  const names = useMemo(() => new Map(salesMap?.recruiters.map((r) => [r.number, r.name]) ?? []), [salesMap])
  const shades: Map<string, Shade> = mode === "sales" ? salesAreas : kansenAreas

  const yearAreas = useMemo(
    () => new Map(salesYear.data?.map.areas.map((a) => [a.postcode, a]) ?? []),
    [salesYear.data],
  )
  const yearDetail = salesYearDetail.data
  const yearStreets = useMemo(() => new Map(yearDetail?.areas.map((a) => [a.postcode, a]) ?? []), [yearDetail])
  const taken = useMemo(() => given.data?.flatMap((a) => a.postcodes) ?? [], [given.data])
  const busy = useMemo(() => new Set(given.data?.flatMap((a) => a.wervernrs)), [given.data])
  const overlapWith = [
    ...new Set(
      (given.data ?? [])
        .filter((a) => a.postcodes.some((code) => picked.some((p) => overlaps(code, p.code))))
        .flatMap((a) => a.members.map((m) => firstName(m.name))),
    ),
  ]
  const overlay = useMemo<Overlay>(
    () => (assigning ? { picked: picked.map((p) => p.code), taken } : { picked: focus?.postcodes ?? [], taken: [] }),
    [assigning, picked, taken, focus],
  )

  async function assignPicked() {
    const bounds = unionBounds(picked.map((p) => p.bounds))
    setNaming(true)
    const label = bounds ? await lookupPlace(...centreOf(bounds)) : ""
    setNaming(false)
    const { households, open } = summarize(picked)
    const names = (recruiters.data ?? []).filter((r) => chosen.includes(r.wervernr)).map((r) => firstName(r.wervernaam))
    create.mutate(
      {
        postcodes: picked.map((p) => p.code),
        wervernrs: chosen,
        startsOn: period.startsOn,
        endsOn: period.endsOn,
        label,
        note: note.trim(),
        bounds,
        households,
        open,
      },
      {
        onSuccess: () => {
          toast.success(`Toegewezen aan ${names.join(" en ")}`)
          setPicked([])
          setNote("")
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    )
  }

  // Read when the map is tapped; kept current without recreating the map.
  const popup = useRef<PopupFor>({ area: () => document.createElement("div"), detail: () => null })
  useEffect(() => {
    popup.current = {
      // Giving out areas, a tap picks the area with what is known of it now, so its numbers survive panning away.
      pickAt,
      pick: assigning
        ? (postcode, at, bounds) => {
            const area = (at === "pc4" ? kansenAreas.get(postcode) : current[at].get(postcode)) as
              OpportunityArea | OpportunityDetail | undefined
            const kansenKnown = at === "pc4" ? opportunities !== undefined : at === shown && current[at].size > 0
            const salesKnown = at === "pc4" ? salesYear.data !== undefined : yearDetail?.level === at
            const sale = at === "pc4" ? yearAreas.get(postcode) : yearStreets.get(postcode)
            setPicked((before) =>
              pickArea(before, {
                code: postcode,
                bounds,
                households: area?.households,
                open: area ? area.open : kansenKnown ? 0 : undefined,
                lastSold: sale ? sale.lastSoldOn : salesKnown ? null : undefined,
              }),
            )
            // A whole PC5 picked while zoomed in on streets: its numbers are asked for that area alone.
            // Kept on it only if it is still picked when they arrive.
            if (at === "pc5" && at !== shown) {
              void pc5Numbers(postcode, bounds, woz, yearFrom, until).then((numbers) =>
                setPicked((now) => now.map((p) => (p.code === postcode ? { ...p, ...numbers } : p))),
              )
            }
          }
        : undefined,
      area:
        mode === "sales"
          ? (postcode) => salesPopup(postcode, salesAreas.get(postcode), names)
          : (postcode) => kansenPopup(postcode, kansenAreas.get(postcode), woz),
      detail: (postcode, at) => {
        const area = current[at].get(postcode)
        if (!area) return null
        if (at === "pc5") {
          return mode === "sales"
            ? salesPc5Popup(area as SalesStreet, names)
            : kansenPc5Popup(area as OpportunityDetail)
        }
        return mode === "sales"
          ? salesStreetPopup(area as SalesStreet, names)
          : kansenStreetPopup(area as OpportunityDetail)
      },
    }
  }, [
    mode,
    salesAreas,
    kansenAreas,
    names,
    woz,
    current,
    assigning,
    pickAt,
    shown,
    yearFrom,
    until,
    opportunities,
    salesYear.data,
    yearAreas,
    yearDetail,
    yearStreets,
  ])

  return (
    <div className="flex h-svh flex-col bg-muted">
      <PageHeader
        start={
          <Button variant="ghost" size="icon" className={HEADER_BUTTON_CLASS} aria-label="Terug" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        }
        title="Verkoopkaart"
        end={<AppMenu />}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-2">
        <Choice
          label="Weergave"
          options={[
            { value: "sales", label: "Verkopen" },
            { value: "kansen", label: "Kansen" },
            ...(isAdmin && SHOW_AREAS ? [{ value: "assign" as const, label: "Toewijzen" }] : []),
          ]}
          value={mode}
          onChange={setMode}
        />
        {assigning && (
          <Choice
            label="Selecteren"
            options={LEVELS.map((l) => ({ value: l, label: l.toUpperCase(), disabled: finerThan(l, shown) }))}
            value={outlined ?? pickAt}
            onChange={setPickAt}
          />
        )}
        {focus && !assigning && (
          <Badge className="border-orange-600 bg-orange-50 text-orange-800">{areaTitle(focus)}</Badge>
        )}
        {mode === "sales" ? (
          <>
            <Choice
              label="Periode"
              options={PERIODS.map((p) => ({ value: p.days, label: p.label }))}
              value={periodDays}
              onChange={setPeriodDays}
            />
            <SalesLegend periodDays={periodDays} />
          </>
        ) : (
          <>
            <Choice label="WOZ-waarde" options={wozOptions(opportunities)} value={woz} onChange={setWoz} />
            <KansenLegend />
          </>
        )}
        {query.data?.demo && <Badge variant="secondary">Voorbeeldcijfers</Badge>}
      </div>

      {query.error && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
          <AlertDescription>{getErrorMessage(query.error)}</AlertDescription>
        </Alert>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <SalesMap
          mode={shading}
          shades={shades}
          seen={current}
          shown={shown}
          outlined={outlined}
          faint={faint}
          popup={popup}
          overlay={overlay}
          fitTo={focus?.bounds ?? null}
          onView={setView}
          onDrawing={setDrawing}
        />
        {switching ? (
          // In the middle of the map, where the eye is while zooming; taps go through to the map. A pulse of opacity
          // only: the browser runs it on the compositor, without JavaScript or repainting the map.
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div
              role="status"
              className="flex animate-pulse items-center gap-3 rounded-2xl bg-background/95 px-6 py-4 text-lg font-semibold shadow-xl motion-reduce:animate-none"
            >
              <span className="size-3 rounded-full bg-primary" />
              {LEVEL_NAMES[switching]} laden…
            </div>
          </div>
        ) : panning ? (
          <div role="status" className={cn(BADGE_CLASS, "animate-pulse motion-reduce:animate-none")}>
            <span className="size-2.5 rounded-full bg-primary" />
            {LEVEL_NAMES[panning]} laden…
          </div>
        ) : (
          zoomHint && (
            <div className={cn(BADGE_CLASS, "text-muted-foreground")}>
              <ZoomInIcon className="size-5" />
              {zoomHint}
            </div>
          )
        )}
      </div>

      {mode === "sales" && salesMap?.detailed && (
        <p className="border-t bg-background px-4 py-1.5 text-xs text-muted-foreground">
          {salesMap.areas.reduce((sum, a) => sum + (a.sold ?? 0), 0)} verkopen op de kaart
          {(salesMap.unplaced ?? 0) > 0 && `, ${salesMap.unplaced} zonder bekende postcode`}. Ook opgezegde verkopen
          tellen mee.
        </p>
      )}
      {mode === "kansen" && opportunities && (
        <p className="border-t bg-background px-4 py-1.5 text-xs text-muted-foreground">
          {opportunities.detailed && `${totalOpen(opportunities)} huishoudens nog geen klant op de kaart. `}
          Huishoudens en WOZ per straat: {opportunities.statistics}. Een gebied is zo donker als zijn beste straat; zoom
          in voor de straten.
        </p>
      )}
      {assigning && (
        <AssignPanel
          picked={picked}
          recruiters={recruiters.data}
          chosen={chosen}
          onChoose={setChosen}
          periods={periods}
          period={period}
          onPeriod={setPeriod}
          busy={busy}
          overlapWith={overlapWith}
          note={note}
          onNote={setNote}
          assigning={naming || create.isPending}
          onAssign={() => void assignPicked()}
        />
      )}
    </div>
  )
}

async function fetchSalesMap(from: string, to: string) {
  const response = await getSalesMap({ from, to })
  if (!("map" in response)) throw new Error("Onverwacht antwoord")
  return response
}

/**
 * The "kansen" numbers and the last sale in a year of one PC5, asked for its own box. Whatever does not arrive stays
 * unknown.
 */
async function pc5Numbers(code: string, bounds: Bounds, woz: WozBand, from: string, to: string) {
  const bbox = bounds.map((n) => n.toFixed(4)).join(",")
  const [kansen, sales] = await Promise.allSettled([
    getSalesOpportunities({ action: "pc5", woz, bbox }),
    fetchSalesDetail(from, to, bbox, "pc5"),
  ])
  const numbers: Partial<PickedArea> & { code: string } = { code }
  if (kansen.status === "fulfilled" && kansen.value.action === "pc5") {
    const area = kansen.value.view.areas.find((a) => a.postcode === code)
    numbers.households = area?.households
    numbers.open = area?.open ?? 0
  }
  if (sales.status === "fulfilled" && sales.value) {
    numbers.lastSold = sales.value.areas.find((a) => a.postcode === code)?.lastSoldOn ?? null
  }
  return numbers
}

async function fetchSalesDetail(from: string, to: string, bbox: string, level: "pc5" | "pc6") {
  const response = await getSalesMap({ from, to, bbox, level })
  return "detail" in response ? response.detail : undefined
}

type PopupFor = {
  area: (postcode: string) => HTMLElement
  detail: (postcode: string, level: "pc5" | "pc6") => HTMLElement | null
  /** Set while giving out areas: a tap picks or drops the area under it instead of explaining it. */
  pick?: (postcode: string, level: Level, bounds: Bounds) => void
  /** The level a tap picks at, when larger than the map's. */
  pickAt?: Level
}

type MapProps = {
  mode: Shading
  /** PC4 shades. */
  shades: Map<string, Shade>
  /** PC5 and street shades seen while zoomed in. */
  seen: Seen
  /** Which level is drawn in full besides PC4. */
  shown: Level
  /** Giving out areas: the only level outlined, whatever the zoom. */
  outlined: Level | null
  /** Whether PC4 is only a tint under it. */
  faint: boolean
  popup: { current: PopupFor }
  /** Areas picked or given out, drawn over the shades. */
  overlay: Overlay
  /** Where the map opens instead of the whole country. */
  fitTo: Bounds | null
  /** Called a moment after the map stops moving. */
  onView: (view: MapView) => void
  /** Called as soon as zooming crosses into another level, and with null once its tiles are all drawn. */
  onDrawing: (level: Level | null) => void
}

/**
 * The map's zoom, its box ("minLon,minLat,maxLon,maxLat") from PC5_ZOOM on (else null), and which postcodes fill
 * the box: PC5 areas, or from STREET_ZOOM on the streets.
 */
type MapView = { zoom: number; bbox: string | null; level: "pc5" | "pc6" }

const LEVELS: Level[] = ["pc4", "pc5", "pc6"]

/**
 * The MapLibre map. All three levels are vector tiles (map-setup's TILES_URL), coloured by feature state, so new numbers
 * never reload an outline. MapLibre keeps only the tiles near the view in memory.
 */
function SalesMap({ mode, shades, seen, shown, outlined, faint, popup, overlay, fitTo, onView, onDrawing }: MapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const viewChanged = useRef(onView)
  const drawingChanged = useRef(onDrawing)
  const shownRef = useRef(shown)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    viewChanged.current = onView
    drawingChanged.current = onDrawing
    shownRef.current = shown
  }, [onView, onDrawing, shown])

  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      center: [5.3, 52.15],
      zoom: 7,
      minZoom: 6,
      maxBounds: [
        [2.5, 50.5],
        [8, 54],
      ],
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          background: BACKGROUND_SOURCE,
          // The same map's names alone, on a transparent background, drawn again over the coloured areas so a street
          // stays readable under the darkest shade.
          labels: {
            type: "raster",
            tiles: ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/labels/EPSG:3857/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
          },
          pc4: postcodeSource("pc4"),
          pc5: postcodeSource("pc5"),
          pc6: postcodeSource("pc6"),
        },
        layers: [
          { id: "background", type: "raster", source: "background" },
          ...LEVELS.flatMap((level) => [
            {
              id: `${level}-fill`,
              type: "fill" as const,
              source: level,
              "source-layer": level,
              minzoom: MIN_ZOOM[level],
              layout: { visibility: level === "pc4" ? ("visible" as const) : ("none" as const) },
              paint: statePaint("sales", false),
            },
            {
              id: `${level}-line`,
              type: "line" as const,
              source: level,
              "source-layer": level,
              minzoom: MIN_ZOOM[level],
              layout: { visibility: level === "pc4" ? ("visible" as const) : ("none" as const) },
              paint: {
                "line-color": "#334155",
                "line-width": lineWidth(level),
                "line-opacity": LINE_OPACITY,
              },
            },
          ]),
          ...LEVELS.flatMap((level) => overlayLayers(level, MIN_ZOOM[level], MAX_ZOOM[level])),
          { id: "labels", type: "raster", source: "labels", minzoom: PC5_ZOOM },
        ],
      },
    })
    // The hatching of areas given out is drawn here rather than shipped as an image.
    map.setMissingStyleImageResolver((id) => {
      if (id === "hatch" && !map.hasImage("hatch")) addHatch(map)
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    // A trackpad pinch arrives as scroll events at this rate (MapLibre's default is 1/100): twice as fast, so a few
    // pinches reach the streets. The mouse wheel and touch pinch keep their own speed.
    map.scrollZoom.setZoomRate(1 / 50)
    map.on("load", () => setLoaded(true))

    // Say at once when zooming crosses into another level: one comparison per frame, and the page only hears of a
    // change. Cleared once the map is idle (all tiles drawn), but not before the view below has been sent, so the
    // badge carries on into the answer's loading without flickering off in between.
    let crossed = levelAt(map.getZoom())
    let viewPending = false
    map.on("zoom", () => {
      const now = levelAt(map.getZoom())
      if (now === crossed) return
      crossed = now
      drawingChanged.current(now)
    })
    map.on("idle", () => {
      if (!viewPending) drawingChanged.current(null)
    })

    // Tell the page the zoom and, zoomed in, which areas to ask for; a moment after the map stops, not every frame.
    let wait: ReturnType<typeof setTimeout> | undefined
    map.on("moveend", () => {
      clearTimeout(wait)
      viewPending = true
      wait = setTimeout(() => {
        viewPending = false
        const zoom = map.getZoom()
        const level = zoom >= STREET_ZOOM ? "pc6" : "pc5"
        if (zoom < PC5_ZOOM) viewChanged.current({ zoom, bbox: null, level })
        else {
          const b = map.getBounds()
          const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(3)).join(",")
          viewChanged.current({ zoom, bbox, level })
        }
        if (map.areTilesLoaded()) drawingChanged.current(null)
      }, 400)
    })

    const info = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
    // Giving out areas: the area a tap would pick at a point, at the zoom's level or the larger one chosen.
    const target = (point: maplibregl.PointLike) => {
      const shownLevel = shownRef.current
      const [feature] = map.queryRenderedFeatures(point, { layers: [`${shownLevel}-fill`] })
      if (feature?.id === undefined) return null
      const at = pickLevel(shownLevel, popup.current.pickAt ?? "pc6")
      return { feature, at, code: codeAt(String(feature.id), at), own: at === shownLevel }
    }
    let hovered: string | null = null
    const hover = (code: string | null) => {
      if (code === hovered) return
      hovered = code
      setHover(map, LEVELS, code)
      map.getCanvas().style.cursor = code ? "pointer" : ""
    }
    map.on("mousemove", (event) => hover(popup.current.pick ? (target(event.point)?.code ?? null) : null))
    map.on("mouseout", () => hover(null))

    map.on("click", (event) => {
      const level = shownRef.current
      const pick = popup.current.pick
      if (pick) {
        info.remove()
        const hit = target(event.point)
        if (!hit) return
        const own = geometryBounds(hit.feature.geometry)
        pick(hit.code, hit.at, hit.own ? own : (sourceBounds(map, hit.at, hit.code) ?? own))
        return
      }
      if (level !== "pc4") {
        const [detail] = map.queryRenderedFeatures(event.point, { layers: [`${level}-fill`] })
        const content = detail?.id !== undefined ? popup.current.detail(String(detail.id), level) : null
        if (content) return void info.setLngLat(event.lngLat).setDOMContent(content).addTo(map)
      }
      const [area] = map.queryRenderedFeatures(event.point, { layers: ["pc4-fill"] })
      if (area?.id === undefined) return void info.remove()
      info
        .setLngLat(event.lngLat)
        .setDOMContent(popup.current.area(String(area.id)))
        .addTo(map)
    })
    map.on("mouseenter", "pc4-fill", () => {
      if (!popup.current.pick) map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", "pc4-fill", () => {
      if (!popup.current.pick) map.getCanvas().style.cursor = ""
    })

    mapRef.current = map
    return () => {
      clearTimeout(wait)
      info.remove()
      map.remove()
      mapRef.current = null
    }
  }, [popup])

  // The colours per mode, which level is drawn in full, and which is outlined.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    for (const level of LEVELS) {
      const paint = statePaint(mode, level === "pc4" && faint)
      map.setPaintProperty(`${level}-fill`, "fill-color", paint["fill-color"])
      map.setPaintProperty(`${level}-fill`, "fill-opacity", paint["fill-opacity"])
      const drawn = level === "pc4" || level === shown
      map.setLayoutProperty(`${level}-fill`, "visibility", drawn ? "visible" : "none")
      const lined = outlined === null ? drawn : level === outlined
      map.setLayoutProperty(`${level}-line`, "visibility", lined ? "visible" : "none")
      // A larger level outlined over the shades of a smaller one needs a firm line to read as the boxes to pick.
      const firm = level === outlined && level !== shown
      map.setPaintProperty(`${level}-line`, "line-width", firm ? 1.5 : lineWidth(level))
      map.setPaintProperty(`${level}-line`, "line-opacity", firm ? 0.8 : LINE_OPACITY)
    }
  }, [mode, shown, outlined, faint, loaded])

  // Shade every PC4 area the backend sent; the others stay transparent.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    map.removeFeatureState({ source: "pc4", sourceLayer: "pc4" })
    for (const [postcode, shade] of shades) {
      map.setFeatureState(
        { source: "pc4", sourceLayer: "pc4", id: postcode },
        { shaded: true, level: shade.level, age: shade.age ?? 1 },
      )
    }
  }, [shades, loaded])

  useEffect(() => {
    const map = mapRef.current
    if (map && loaded) applyOverlay(map, LEVELS, overlay)
  }, [overlay, loaded])

  // Opening on an area: once, when the map is ready.
  useEffect(() => {
    const map = mapRef.current
    if (map && loaded && fitTo) map.fitBounds(fitTo, { padding: 48, maxZoom: 15, duration: 0 })
  }, [fitTo, loaded])

  // The PC5 areas and streets seen while zoomed in: only the new ones are set, and all are cleared with the filter.
  const applied = useRef<Seen>(nothingSeen(""))
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    for (const level of ["pc5", "pc6"] as const) {
      const before = applied.current.key === seen.key ? applied.current[level] : undefined
      // A new filter, or the kept shades started over: clear what is no longer known.
      const restart = !before || before.size > seen[level].size
      if (restart) map.removeFeatureState({ source: level, sourceLayer: level })
      for (const [postcode, area] of seen[level]) {
        if (!restart && before.get(postcode) === area) continue
        const age = "age" in area ? area.age : 1
        map.setFeatureState(
          { source: level, sourceLayer: level, id: postcode },
          { shaded: true, level: area.level, age },
        )
      }
    }
    applied.current = seen
  }, [seen, loaded])

  // The container itself fills the space: MapLibre's stylesheet makes it position: relative, so absolute won't hold.
  return <div ref={container} className="min-h-0 flex-1" />
}

/** The level a zoom shows. */
const levelAt = (zoom: number): Level => (zoom >= STREET_ZOOM ? "pc6" : zoom >= PC5_ZOOM ? "pc5" : "pc4")

/** Where each level's tiles start; a level is drawn from there until the next one takes over. */
const MIN_ZOOM: Record<Level, number> = { pc4: 0, pc5: PC5_ZOOM, pc6: STREET_ZOOM }

/** Where the next level takes over. */
const MAX_ZOOM: Record<Level, number> = { pc4: PC5_ZOOM, pc5: STREET_ZOOM, pc6: 24 }

const SHADED: ExpressionSpecification = ["boolean", ["feature-state", "shaded"], false]

/** Outlines are clearer around shaded areas than around empty ones. */
const LINE_OPACITY: ExpressionSpecification = ["case", SHADED, 0.6, 0.15]

const lineWidth = (level: Level) => (level === "pc6" ? 0.4 : 0.5)

type FillPaint = { "fill-color": ExpressionSpecification; "fill-opacity": ExpressionSpecification }

/**
 * Areas by feature state; only a faint tint for PC4 once a finer level is drawn over it. From street zoom on every
 * shade is see-through (STREET_OPACITY), so streets, buildings and names show under even the darkest one; the colour
 * keeps the ranking.
 */
function statePaint(mode: Shading, faint: boolean): FillPaint {
  const level: ExpressionSpecification = ["feature-state", "level"]
  const opacity = faint ? (["*", FAINT, fillOpacity(mode, level)] as ExpressionSpecification) : fillOpacity(mode, level)
  const shaded = (value: ExpressionSpecification): ExpressionSpecification => ["case", SHADED, value, 0]
  return {
    "fill-color": fillColor(mode, level, ["feature-state", "age"]),
    "fill-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      STREET_ZOOM - 0.5,
      shaded(opacity),
      STREET_ZOOM,
      shaded(["*", STREET_OPACITY, opacity]),
    ],
  }
}

/** A level as words, so a recruiter sees how a street ranks without a number. */
const RANKS = [
  "",
  "Gewoon",
  "Boven het midden",
  "Top 25% van de straten",
  "Top 10% van de straten",
  "Top 3% van de straten",
]

/** A popup's root and a helper adding text nodes, never HTML, so names from ZMAdmin are never read as markup. */
function popupRoot(): [
  HTMLElement,
  (tag: string, text: string, className?: string, parent?: HTMLElement) => HTMLElement,
] {
  const root = document.createElement("div")
  root.className = "space-y-1 text-sm"
  const add = (tag: string, text: string, className = "", parent: HTMLElement = root) => {
    const node = document.createElement(tag)
    node.textContent = text
    node.className = className
    parent.append(node)
    return node
  }
  return [root, add]
}

/** "1234AB" as "1234 AB", "1234A" as "1234 A". */
const pc6Label = (postcode: string) => `${postcode.slice(0, 4)} ${postcode.slice(4)}`

function salesPopup(postcode: string, area: MapArea | undefined, names: Map<string, string>): HTMLElement {
  const [root, add] = popupRoot()
  add("div", `${postcode}${area?.city ? ` · ${area.city}` : ""}`, "font-semibold")
  if (!area) {
    add("div", "Geen verkopen in deze periode", "text-muted-foreground")
    return root
  }
  add("div", `Laatste verkoop op ${formatDay(area.lastSoldOn)}`)
  add("div", `Drukste straat: ${RANKS[area.level].toLowerCase()}`, "text-muted-foreground")
  if (area.sold !== undefined) {
    add("div", `${area.sold} ${area.sold === 1 ? "verkoop" : "verkopen"}, drukste straat ${area.bestStreetSold}`)
    const list = add("ul", "", "pt-1")
    for (const r of area.recruiters ?? []) add("li", `${names.get(r.recruiter) ?? r.recruiter}: ${r.sold}`, "", list)
  }
  add("div", "Zoom in om de straten te zien", "pt-1 text-xs text-muted-foreground")
  return root
}

function salesPc5Popup(area: SalesStreet, names: Map<string, string>): HTMLElement {
  const [root, add] = popupRoot()
  add("div", `${pc6Label(area.postcode)}${area.city ? ` · ${area.city}` : ""}`, "font-semibold")
  add("div", `Laatste verkoop op ${formatDay(area.lastSoldOn)}`)
  add("div", `Drukste straat: ${RANKS[area.level].toLowerCase()}`, "text-muted-foreground")
  if (area.sold !== undefined) {
    add("div", `${area.sold} ${area.sold === 1 ? "verkoop" : "verkopen"}, drukste straat ${area.bestStreetSold}`)
    const list = add("ul", "", "pt-1")
    for (const r of area.recruiters ?? []) add("li", `${names.get(r.recruiter) ?? r.recruiter}: ${r.sold}`, "", list)
  }
  add("div", "Zoom in om de straten te zien", "pt-1 text-xs text-muted-foreground")
  return root
}

function salesStreetPopup(street: SalesStreet, names: Map<string, string>): HTMLElement {
  const [root, add] = popupRoot()
  add("div", `${pc6Label(street.postcode)}${street.city ? ` · ${street.city}` : ""}`, "font-semibold")
  add("div", `Laatste verkoop op ${formatDay(street.lastSoldOn)}`)
  add("div", RANKS[street.level], "text-muted-foreground")
  if (street.sold !== undefined) {
    add("div", `${street.sold} ${street.sold === 1 ? "verkoop" : "verkopen"}`)
    const list = add("ul", "", "pt-1")
    for (const r of street.recruiters ?? []) add("li", `${names.get(r.recruiter) ?? r.recruiter}: ${r.sold}`, "", list)
  }
  return root
}

/** The area's numbers (admins) and, once the backend answers, its best streets in the band. */
function kansenPopup(postcode: string, area: OpportunityArea | undefined, woz: WozBand): HTMLElement {
  const [root, add] = popupRoot()
  add("div", postcode, "font-semibold")
  if (!area) {
    add("div", "Hier zijn in deze WOZ-groep geen huishoudens meer te winnen", "text-muted-foreground")
    return root
  }
  add("div", `Beste straat: ${RANKS[area.level].toLowerCase()}`, "text-muted-foreground")
  if (area.open !== undefined && area.households !== undefined && area.share !== undefined) {
    add("div", `${nl(area.open)} van ${nl(area.households)} huishoudens nog geen klant (${percent(area.share)} klant)`)
    add("div", `Beste straat: ${nl(area.bestStreetOpen ?? 0)} nog geen klant`)
  }
  const status = add("div", "Beste straten laden…", "pt-1 text-muted-foreground")
  void getSalesOpportunities({ action: "streets", pc4: postcode, woz })
    .then((response) => {
      if (response.action !== "streets") return
      status.textContent = response.view.streets.length ? "Beste straten" : "Geen straten gevonden"
      status.className = "pt-1 font-medium"
      const list = add("ol", "", "list-decimal pl-5")
      for (const s of response.view.streets) {
        const where = `${s.streets || "Onbekende straat"} (${pc6Label(s.postcode)})`
        const numbers = s.open !== undefined ? ` · ${s.open} open${s.woz ? ` · WOZ €${s.woz}k` : ""}` : ""
        add("li", where + numbers, "", list)
      }
    })
    .catch((error: unknown) => {
      status.textContent = getErrorMessage(error)
      status.className = "pt-1 text-destructive"
    })
  return root
}

function kansenPc5Popup(area: OpportunityDetail): HTMLElement {
  const [root, add] = popupRoot()
  add("div", pc6Label(area.postcode), "font-semibold")
  add("div", `Beste straat: ${RANKS[area.level].toLowerCase()}`, "text-muted-foreground")
  if (area.open !== undefined && area.households !== undefined) {
    add("div", `${nl(area.open)} van ${nl(area.households)} huishoudens nog geen klant`)
    add("div", `Beste straat: ${nl(area.bestStreetOpen ?? 0)} nog geen klant`)
  }
  add("div", "Zoom in om de straten te zien", "pt-1 text-xs text-muted-foreground")
  return root
}

function kansenStreetPopup(street: OpportunityDetail): HTMLElement {
  const [root, add] = popupRoot()
  add("div", pc6Label(street.postcode), "font-semibold")
  add("div", RANKS[street.level])
  if (street.open !== undefined && street.households !== undefined) {
    add("div", `${street.open} van ${street.households} huishoudens nog geen klant`)
    if (street.woz) add("div", `Gemiddelde WOZ €${street.woz}k`, "text-muted-foreground")
  }
  return root
}

function totalOpen(view: OpportunitiesView): string {
  return nl(view.areas.reduce((sum, a) => sum + (a.open ?? 0), 0))
}

const nl = (n: number) => n.toLocaleString("nl-NL")
const percent = (share: number) => `${(share * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`

/** The bands with their limits once the backend has sent them, e.g. "Laag (< €285k)". */
function wozOptions(view: OpportunitiesView | undefined): { value: WozBand; label: string }[] {
  return [
    { value: "low", label: view ? `Laag (< €${view.lowBelow}k)` : "Laag" },
    { value: "mid", label: "Midden" },
    { value: "high", label: view ? `Hoog (≥ €${view.highFrom}k)` : "Hoog" },
    { value: "all", label: "Alles" },
  ]
}

type ChoiceProps<T extends string | number> = {
  label: string
  options: { value: T; label: string; disabled?: boolean }[]
  value: T
  onChange: (value: T) => void
}

/** A row of buttons of which one is chosen. */
function Choice<T extends string | number>({ label, options, value, onChange }: ChoiceProps<T>) {
  return (
    <div className="flex rounded-md border p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <Button
          key={o.value}
          size="sm"
          variant={o.value === value ? "default" : "ghost"}
          aria-pressed={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

/** The colour ramp in days for the chosen period, and what darkness means. */
function SalesLegend({ periodDays }: { periodDays: number }) {
  const gradient = `linear-gradient(to right, ${AGE_STOPS.map(([a, color]) => `${color} ${a * 100}%`).join(", ")})`
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span>vandaag</span>
        <span className="h-2.5 w-24 rounded-sm" style={{ background: gradient }} />
        <span>{periodDays} dagen geleden</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-red-600/30" />
        <span className="h-2.5 w-2.5 rounded-sm bg-red-600/90" />
        <span>donkerder = drukkere straat</span>
      </div>
    </div>
  )
}

function KansenLegend() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {KANSEN_COLORS.map((color) => (
        <span key={color} className="h-2.5 w-3.5 rounded-sm" style={{ background: color }} />
      ))}
      <span>gewoon → top 3% van de straten, naar huishoudens nog geen klant</span>
    </div>
  )
}
