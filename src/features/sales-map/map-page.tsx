import { useEffect, useMemo, useRef, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import * as maplibregl from "maplibre-gl"
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import { ArrowLeftIcon, RefreshCwIcon, ZoomInIcon } from "lucide-react"
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { getSalesMap, getSalesOpportunities } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type { MapArea, SalesStreet, StreetsView } from "@shared/sales-map-view"
import type { OpportunitiesView, OpportunityArea, OpportunityStreet, WozBand } from "@shared/sales-opportunities"
import { addDays, formatDay, today } from "../dashboard/periods"
import { AGE_STOPS, fillColor, fillOpacity, KANSEN_COLORS } from "./scale"

type Props = { onBack: () => void }
type Mode = "sales" | "kansen"

const PERIODS = [
  { days: 30, label: "30 dagen" },
  { days: 90, label: "90 dagen" },
  { days: 365, label: "1 jaar" },
] as const

/** public/nl-pc4.geojson from scripts/build-pc4-areas.mjs, with the PC4 code in `postcode`. */
const PC4_AREAS_URL = "/nl-pc4.geojson"

/** From this zoom the streets (PC6) in view are drawn over the PC4 areas. */
const STREET_ZOOM = 14

/** From this zoom on the way in, a hint says the streets come when zooming in further. */
const ZOOM_HINT = 11

/** How strongly the PC4 areas still show under the streets. */
const FAINT = 0.2

/** The badge at the top left of the map: large enough to notice while panning. */
const BADGE_CLASS =
  "absolute top-3 left-3 z-10 flex items-center gap-2.5 rounded-full bg-background/95 px-4 py-2.5 text-base font-medium shadow-lg"

const EMPTY: StreetsView<never>["features"] = { type: "FeatureCollection", features: [] }

// MapLibre looks for its worker next to its own module, which Vite moves; give it the worker's real address.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

/** What the map draws for one PC4: the backend's shade, and on the sales map the newest sale's age. */
type Shade = { level: number; age?: number }

/**
 * Two views of the areas, everything computed by the backend. "Verkopen": where the team sold, red where the newest
 * sale is days old fading to grey, darker where more was sold. "Kansen": where households in streets of a WOZ band
 * are still not a customer, pale to deep blue. A PC4 is shaded like its best street; zoomed in, the streets in view
 * are drawn by themselves on the same scale. Only admins also get the numbers, which the backend leaves out for
 * recruiters.
 */
export function SalesMapPage({ onBack }: Props) {
  const [mode, setMode] = useState<Mode>("sales")
  const [periodDays, setPeriodDays] = useState<number>(90)
  const [woz, setWoz] = useState<WozBand>("low")
  /** The map's zoom, and its box once zoomed in to streets (else null). */
  const [view, setView] = useState<MapView>({ zoom: 7, bbox: null })
  const bbox = view.bbox
  const until = today()
  const from = addDays(until, -(periodDays - 1))

  const sales = useQuery({
    queryKey: ["sales-map", from, until],
    queryFn: async () => {
      const response = await getSalesMap({ from, to: until })
      if (!("map" in response)) throw new Error("Onverwacht antwoord")
      return response
    },
    placeholderData: keepPreviousData,
    enabled: mode === "sales",
  })
  const salesStreets = useQuery({
    queryKey: ["sales-map-streets", from, until, bbox],
    queryFn: async () => {
      const response = await getSalesMap({ from, to: until, bbox: bbox! })
      return "streets" in response ? response.streets : undefined
    },
    placeholderData: keepPreviousData,
    enabled: mode === "sales" && bbox !== null,
  })
  const kansen = useQuery({
    queryKey: ["sales-opportunities", woz],
    queryFn: async () => {
      const response = await getSalesOpportunities({ action: "areas", woz })
      if (response.action !== "areas") throw new Error("Onverwacht antwoord")
      return response
    },
    placeholderData: keepPreviousData,
    enabled: mode === "kansen",
    // Customers are counted once a night; no need to ask again while the page is open.
    staleTime: 15 * 60_000,
  })
  const kansenStreets = useQuery({
    queryKey: ["sales-opportunities-streets", woz, bbox],
    queryFn: async () => {
      const response = await getSalesOpportunities({ action: "pc6", woz, bbox: bbox! })
      return response.action === "pc6" ? response.view : undefined
    },
    placeholderData: keepPreviousData,
    enabled: mode === "kansen" && bbox !== null,
    staleTime: 15 * 60_000,
  })

  const query = mode === "sales" ? sales : kansen
  const salesMap = sales.data?.map
  const opportunities = kansen.data?.view
  const streets: StreetsView<SalesStreet | OpportunityStreet> | undefined =
    bbox === null ? undefined : mode === "sales" ? salesStreets.data : kansenStreets.data
  // The first look at a spot waits for PDOK's outlines, a few seconds: say so, or the map seems stuck.
  const streetsQuery = mode === "sales" ? salesStreets : kansenStreets
  const streetsLoading = bbox !== null && streetsQuery.isFetching
  // Close to street level, or zoomed in on a view too wide for it (the backend refuses those): say where to go.
  const zoomHint = (view.zoom >= ZOOM_HINT && bbox === null) || (bbox !== null && streetsQuery.isError)

  const salesAreas = useMemo(() => new Map(salesMap?.areas.map((a) => [a.postcode, a]) ?? []), [salesMap])
  const kansenAreas = useMemo(() => new Map(opportunities?.areas.map((a) => [a.postcode, a]) ?? []), [opportunities])
  const names = useMemo(() => new Map(salesMap?.recruiters.map((r) => [r.number, r.name]) ?? []), [salesMap])
  const shades: Map<string, Shade> = mode === "sales" ? salesAreas : kansenAreas

  // Read when the map is tapped; kept current without recreating the map.
  const popup = useRef<PopupFor>({ area: () => document.createElement("div"), street: () => null })
  useEffect(() => {
    const byPostcode = new Map((streets?.streets ?? []).map((s) => [s.postcode, s]))
    const levels = new Map((streets?.features.features ?? []).map((f) => [f.properties.postcode, f.properties.level]))
    popup.current = {
      area:
        mode === "sales"
          ? (postcode) => salesPopup(postcode, salesAreas.get(postcode), names)
          : (postcode) => kansenPopup(postcode, kansenAreas.get(postcode), woz),
      street: (postcode) => {
        const street = byPostcode.get(postcode)
        if (!street) return null
        const level = levels.get(postcode) ?? 1
        return mode === "sales"
          ? salesStreetPopup(street as SalesStreet, level, names)
          : kansenStreetPopup(street as OpportunityStreet, level)
      },
    }
  }, [mode, salesAreas, kansenAreas, names, woz, streets])

  return (
    <div className="flex h-svh flex-col bg-muted">
      <PageHeader
        start={
          <Button
            variant="ghost"
            size="icon"
            className={HEADER_BUTTON_CLASS}
            aria-label="Terug naar formulier"
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </Button>
        }
        title="Verkoopkaart"
        end={
          <Button
            variant="ghost"
            size="icon"
            className={HEADER_BUTTON_CLASS}
            aria-label="Vernieuwen"
            onClick={() => void query.refetch()}
          >
            <RefreshCwIcon className={query.isFetching ? "animate-spin" : undefined} />
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-2">
        <Choice
          label="Weergave"
          options={[
            { value: "sales", label: "Verkopen" },
            { value: "kansen", label: "Kansen" },
          ]}
          value={mode}
          onChange={setMode}
        />
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
        <SalesMap mode={mode} shades={shades} streets={streets} popup={popup} onView={setView} />
        {streetsLoading ? (
          <div role="status" className={BADGE_CLASS}>
            <Spinner className="size-5" />
            Straten laden…
          </div>
        ) : (
          zoomHint && (
            <div className={cn(BADGE_CLASS, "text-muted-foreground")}>
              <ZoomInIcon className="size-5" />
              Zoom verder in voor de straten
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
    </div>
  )
}

type PopupFor = { area: (postcode: string) => HTMLElement; street: (postcode: string) => HTMLElement | null }

type MapProps = {
  mode: Mode
  shades: Map<string, Shade>
  streets: StreetsView<unknown> | undefined
  popup: { current: PopupFor }
  /** Called a moment after the map stops moving. */
  onView: (view: MapView) => void
}

/** The map's zoom, and its box ("minLon,minLat,maxLon,maxLat") from STREET_ZOOM on, else null. */
type MapView = { zoom: number; bbox: string | null }

/**
 * The MapLibre map. PC4 shades are set as feature state, so new numbers never reload the areas; once the backend's
 * street outlines for a zoomed-in view have arrived, they take over and the areas stay only as a faint tint, so the
 * map is never empty while the streets load.
 */
function SalesMap({ mode, shades, streets, popup, onView }: MapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const viewChanged = useRef(onView)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    viewChanged.current = onView
  }, [onView])
  const streetsShown = streets !== undefined

  useEffect(() => {
    if (!container.current) return
    const shaded: ExpressionSpecification = ["boolean", ["feature-state", "shaded"], false]
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
          background: {
            type: "raster",
            tiles: ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "Achtergrond: PDOK, Kadaster",
          },
          pc4: {
            type: "geojson",
            data: PC4_AREAS_URL,
            promoteId: "postcode",
            attribution: "Postcodegebieden en huishoudens: CBS, Esri Nederland",
          },
          pc6: { type: "geojson", data: EMPTY, promoteId: "postcode" },
        },
        layers: [
          { id: "background", type: "raster", source: "background" },
          { id: "pc4-fill", type: "fill", source: "pc4", paint: pc4Paint("sales", shaded, false) },
          {
            id: "pc4-line",
            type: "line",
            source: "pc4",
            paint: { "line-color": "#334155", "line-width": 0.5, "line-opacity": ["case", shaded, 0.6, 0.15] },
          },
          { id: "pc6-fill", type: "fill", source: "pc6", minzoom: STREET_ZOOM, paint: pc6Paint("sales") },
          {
            id: "pc6-line",
            type: "line",
            source: "pc6",
            minzoom: STREET_ZOOM,
            paint: { "line-color": "#334155", "line-width": 0.4, "line-opacity": 0.5 },
          },
        ],
      },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    map.on("load", () => setLoaded(true))

    // Tell the page the zoom and, zoomed in, which streets to ask for; a moment after the map stops, not every frame.
    let wait: ReturnType<typeof setTimeout> | undefined
    map.on("moveend", () => {
      clearTimeout(wait)
      wait = setTimeout(() => {
        const zoom = map.getZoom()
        if (zoom < STREET_ZOOM) return viewChanged.current({ zoom, bbox: null })
        const b = map.getBounds()
        const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(3)).join(",")
        viewChanged.current({ zoom, bbox })
      }, 400)
    })

    const info = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
    map.on("click", (event) => {
      const [street] =
        map.getZoom() >= STREET_ZOOM ? map.queryRenderedFeatures(event.point, { layers: ["pc6-fill"] }) : []
      const content = street?.id !== undefined ? popup.current.street(String(street.id)) : null
      if (content) return void info.setLngLat(event.lngLat).setDOMContent(content).addTo(map)
      const [area] = map.queryRenderedFeatures(event.point, { layers: ["pc4-fill"] })
      if (area?.id === undefined) return void info.remove()
      info
        .setLngLat(event.lngLat)
        .setDOMContent(popup.current.area(String(area.id)))
        .addTo(map)
    })
    map.on("mouseenter", "pc4-fill", () => (map.getCanvas().style.cursor = "pointer"))
    map.on("mouseleave", "pc4-fill", () => (map.getCanvas().style.cursor = ""))

    mapRef.current = map
    return () => {
      clearTimeout(wait)
      info.remove()
      map.remove()
      mapRef.current = null
    }
  }, [popup])

  // Shade every area the backend sent; the others stay transparent.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const shaded: ExpressionSpecification = ["boolean", ["feature-state", "shaded"], false]
    const pc4 = pc4Paint(mode, shaded, streetsShown)
    const pc6 = pc6Paint(mode)
    map.setPaintProperty("pc4-fill", "fill-color", pc4["fill-color"])
    map.setPaintProperty("pc4-fill", "fill-opacity", pc4["fill-opacity"])
    map.setPaintProperty("pc6-fill", "fill-color", pc6["fill-color"])
    map.setPaintProperty("pc6-fill", "fill-opacity", pc6["fill-opacity"])
    map.removeFeatureState({ source: "pc4" })
    for (const [postcode, shade] of shades) {
      map.setFeatureState({ source: "pc4", id: postcode }, { shaded: true, level: shade.level, age: shade.age ?? 1 })
    }
  }, [mode, shades, loaded, streetsShown])

  // The streets of the view, or none when zoomed out.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    ;(map.getSource("pc6") as GeoJSONSource).setData((streets?.features ?? EMPTY) as never)
  }, [streets, loaded])

  // The container itself fills the space: MapLibre's stylesheet makes it position: relative, so absolute won't hold.
  return <div ref={container} className="min-h-0 flex-1" />
}

type FillPaint = { "fill-color": ExpressionSpecification; "fill-opacity": ExpressionSpecification }

/** PC4 areas by feature state; only a faint tint once the streets of the view are drawn over them. */
function pc4Paint(mode: Mode, shaded: ExpressionSpecification, faint: boolean): FillPaint {
  const level: ExpressionSpecification = ["feature-state", "level"]
  const opacity = faint ? (["*", FAINT, fillOpacity(mode, level)] as ExpressionSpecification) : fillOpacity(mode, level)
  return {
    "fill-color": fillColor(mode, level, ["feature-state", "age"]),
    "fill-opacity": ["case", shaded, opacity, 0],
  }
}

/** Streets by the properties the backend put on them. */
function pc6Paint(mode: Mode): FillPaint {
  const level: ExpressionSpecification = ["get", "level"]
  return { "fill-color": fillColor(mode, level, ["get", "age"]), "fill-opacity": fillOpacity(mode, level) }
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

function salesStreetPopup(street: SalesStreet, level: number, names: Map<string, string>): HTMLElement {
  const [root, add] = popupRoot()
  add("div", `${pc6Label(street.postcode)}${street.city ? ` · ${street.city}` : ""}`, "font-semibold")
  add("div", `Laatste verkoop op ${formatDay(street.lastSoldOn)}`)
  add("div", RANKS[level], "text-muted-foreground")
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

function kansenStreetPopup(street: OpportunityStreet, level: number): HTMLElement {
  const [root, add] = popupRoot()
  add("div", pc6Label(street.postcode), "font-semibold")
  add("div", RANKS[level])
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
  options: { value: T; label: string }[]
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
