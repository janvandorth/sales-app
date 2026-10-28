import { useEffect, useMemo, useRef, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import * as maplibregl from "maplibre-gl"
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react"
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSalesMap, getSalesOpportunities } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import type { MapArea } from "@shared/sales-map-view"
import type { OpportunitiesView, OpportunityArea, WozBand } from "@shared/sales-opportunities"
import { addDays, formatDay, today } from "../dashboard/periods"
import { AGE_STOPS, ageColorExpression, OPPORTUNITY_COLOR, strength } from "./scale"

type Props = { onBack: () => void }
type Mode = "sales" | "kansen"

const PERIODS = [
  { days: 30, label: "30 dagen" },
  { days: 90, label: "90 dagen" },
  { days: 365, label: "1 jaar" },
] as const

/** public/nl-pc4.geojson from scripts/build-pc4-areas.mjs, with the PC4 code in `postcode`. */
const PC4_AREAS_URL = "/nl-pc4.geojson"
const SOURCE = "pc4"

// MapLibre looks for its worker next to its own module, which Vite moves; give it the worker's real address.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

/** What the map draws for one PC4: the backend's shade, and on the sales map the newest sale's age. */
type Shade = { level: number; age?: number }

/**
 * Two views of the PC4 areas, everything computed by the backend. "Verkopen": where the team sold, red where the
 * newest sale is days old fading to grey, darker where more was sold. "Kansen": where households in streets of a
 * WOZ band are still not a customer, in blue, darker where more are open; tapping an area lists its best streets.
 * Everyone sees the whole team; only admins also get the numbers, which the backend leaves out for recruiters.
 */
export function SalesMapPage({ onBack }: Props) {
  const [mode, setMode] = useState<Mode>("sales")
  const [periodDays, setPeriodDays] = useState<number>(90)
  const [woz, setWoz] = useState<WozBand>("low")
  const until = today()
  const from = addDays(until, -(periodDays - 1))

  const sales = useQuery({
    queryKey: ["sales-map", from, until],
    queryFn: () => getSalesMap({ from, to: until }),
    placeholderData: keepPreviousData,
    enabled: mode === "sales",
  })
  const kansen = useQuery({
    queryKey: ["sales-opportunities", woz],
    queryFn: async () => {
      const response = await getSalesOpportunities({ action: "areas", woz })
      if (response.action !== "areas") throw new Error("Onverwacht antwoord")
      return { demo: response.demo, view: response.view }
    },
    placeholderData: keepPreviousData,
    enabled: mode === "kansen",
    // Customers are counted once a night; no need to ask again while the page is open.
    staleTime: 15 * 60_000,
  })
  const query = mode === "sales" ? sales : kansen
  const salesMap = sales.data?.map
  const opportunities = kansen.data?.view

  const salesAreas = useMemo(() => new Map(salesMap?.areas.map((a) => [a.postcode, a]) ?? []), [salesMap])
  const kansenAreas = useMemo(() => new Map(opportunities?.areas.map((a) => [a.postcode, a]) ?? []), [opportunities])
  const names = useMemo(() => new Map(salesMap?.recruiters.map((r) => [r.number, r.name]) ?? []), [salesMap])
  const shades: Map<string, Shade> = mode === "sales" ? salesAreas : kansenAreas

  // Read when an area is tapped; kept current without recreating the map.
  const popup = useRef<(postcode: string) => HTMLElement>(() => document.createElement("div"))
  useEffect(() => {
    popup.current =
      mode === "sales"
        ? (postcode) => salesPopup(postcode, salesAreas.get(postcode), names)
        : (postcode) => kansenPopup(postcode, kansenAreas.get(postcode), woz)
  }, [mode, salesAreas, kansenAreas, names, woz])

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

      <SalesMap mode={mode} shades={shades} popup={popup} />

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
          Huishoudens en WOZ per straat: {opportunities.statistics}. Tik op een gebied voor de beste straten.
        </p>
      )}
    </div>
  )
}

type MapProps = { mode: Mode; shades: Map<string, Shade>; popup: { current: (postcode: string) => HTMLElement } }

/** The MapLibre map; shades are set as feature state, so new numbers never reload the areas. */
function SalesMap({ mode, shades, popup }: MapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false)

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
          [SOURCE]: {
            type: "geojson",
            data: PC4_AREAS_URL,
            promoteId: "postcode",
            attribution: "Postcodegebieden en huishoudens: CBS, Esri Nederland",
          },
        },
        layers: [
          { id: "background", type: "raster", source: "background" },
          {
            id: "pc4-fill",
            type: "fill",
            source: SOURCE,
            paint: {
              "fill-color": ageColorExpression(),
              "fill-opacity": ["case", shaded, ["feature-state", "strength"], 0],
            },
          },
          {
            id: "pc4-line",
            type: "line",
            source: SOURCE,
            paint: { "line-color": "#334155", "line-width": 0.5, "line-opacity": ["case", shaded, 0.6, 0.15] },
          },
        ],
      },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    map.on("load", () => setLoaded(true))

    const info = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
    map.on("click", "pc4-fill", (event) => {
      const id = event.features?.[0]?.id
      if (id === undefined) return
      info
        .setLngLat(event.lngLat)
        .setDOMContent(popup.current(String(id)))
        .addTo(map)
    })
    map.on("mouseenter", "pc4-fill", () => (map.getCanvas().style.cursor = "pointer"))
    map.on("mouseleave", "pc4-fill", () => (map.getCanvas().style.cursor = ""))

    mapRef.current = map
    return () => {
      info.remove()
      map.remove()
      mapRef.current = null
    }
  }, [popup])

  // Shade every area the backend sent; the others stay transparent. Blue on "kansen", by age on the sales map.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    map.setPaintProperty("pc4-fill", "fill-color", mode === "sales" ? ageColorExpression() : OPPORTUNITY_COLOR)
    map.removeFeatureState({ source: SOURCE })
    for (const [postcode, shade] of shades) {
      map.setFeatureState(
        { source: SOURCE, id: postcode },
        { shaded: true, age: shade.age ?? 1, strength: strength(shade.level) },
      )
    }
  }, [mode, shades, loaded])

  // The container itself fills the space: MapLibre's stylesheet makes it position: relative, so absolute won't hold.
  return <div ref={container} className="min-h-0 flex-1" />
}

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

function salesPopup(postcode: string, area: MapArea | undefined, names: Map<string, string>): HTMLElement {
  const [root, add] = popupRoot()
  add("div", `${postcode}${area?.city ? ` · ${area.city}` : ""}`, "font-semibold")
  if (!area) {
    add("div", "Geen verkopen in deze periode", "text-muted-foreground")
    return root
  }
  if (area.sold === undefined) {
    add("div", `Laatste verkoop op ${formatDay(area.lastSoldOn)}`)
    return root
  }
  add("div", `${area.sold} ${area.sold === 1 ? "verkoop" : "verkopen"}, laatste op ${formatDay(area.lastSoldOn)}`)
  const list = add("ul", "", "pt-1")
  for (const r of area.recruiters ?? []) add("li", `${names.get(r.recruiter) ?? r.recruiter}: ${r.sold}`, "", list)
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
  if (area.open !== undefined && area.households !== undefined && area.share !== undefined) {
    add("div", `${nl(area.open)} van ${nl(area.households)} huishoudens nog geen klant (${percent(area.share)} klant)`)
  }
  const status = add("div", "Beste straten laden…", "pt-1 text-muted-foreground")
  void getSalesOpportunities({ action: "streets", pc4: postcode, woz })
    .then((response) => {
      if (response.action !== "streets") return
      status.textContent = response.view.streets.length ? "Beste straten" : "Geen straten gevonden"
      status.className = "pt-1 font-medium"
      const list = add("ol", "", "list-decimal pl-5")
      for (const s of response.view.streets) {
        const where = `${s.streets || "Onbekende straat"} (${s.postcode.slice(0, 4)} ${s.postcode.slice(4)})`
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
        <span className="h-2.5 w-2.5 rounded-sm bg-red-600/25" />
        <span className="h-2.5 w-2.5 rounded-sm bg-red-600/85" />
        <span>donkerder = meer verkopen</span>
      </div>
    </div>
  )
}

function KansenLegend() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-sm bg-blue-700/25" />
      <span className="h-2.5 w-2.5 rounded-sm bg-blue-700/85" />
      <span>donkerder = meer huishoudens nog geen klant</span>
    </div>
  )
}
