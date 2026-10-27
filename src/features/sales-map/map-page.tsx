import { useEffect, useMemo, useRef, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import * as maplibregl from "maplibre-gl"
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { Protocol } from "pmtiles"
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react"
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSalesMap } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { addDays, formatDay, today } from "../dashboard/periods"
import { aggregate, type MapArea, type MapAreas } from "./aggregate"
import { LEVELS, levelAt, POSTCODE_TILES_URL } from "./levels"
import { AGE_STOPS, age, ageColorExpression, strength } from "./scale"

type Props = { onBack: () => void }

const PERIODS = [
  { days: 30, label: "30 dagen" },
  { days: 90, label: "90 dagen" },
  { days: 365, label: "1 jaar" },
] as const

const SOURCE = "postcodes"

// Registered once: MapLibre reads the single tile file through HTTP range requests.
maplibregl.addProtocol("pmtiles", new Protocol().tile)

/**
 * Where the team sold, per postcode area: red where the newest sale is days old, fading through yellow to grey at
 * the start of the period, and darker where more was sold. PC4 areas for the country, PC5 and PC6 when zoomed in.
 * Everyone sees the whole team.
 */
export function SalesMapPage({ onBack }: Props) {
  const [periodDays, setPeriodDays] = useState<number>(90)
  const until = today()
  const from = addDays(until, -(periodDays - 1))
  const query = useQuery({
    queryKey: ["sales-map", from, until],
    queryFn: () => getSalesMap({ from, to: until }),
    placeholderData: keepPreviousData,
  })
  const map = query.data?.map
  const areas = useMemo(() => aggregate(map?.areas ?? []), [map])
  const names = useMemo(() => new Map(map?.recruiters.map((r) => [r.number, r.name]) ?? []), [map])

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
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Periode">
          {PERIODS.map((p) => (
            <Button
              key={p.days}
              size="sm"
              variant={p.days === periodDays ? "default" : "ghost"}
              aria-pressed={p.days === periodDays}
              onClick={() => setPeriodDays(p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Legend periodDays={periodDays} />
        {query.data?.demo && <Badge variant="secondary">Voorbeeldcijfers</Badge>}
      </div>

      {query.error && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
          <AlertDescription>{getErrorMessage(query.error)}</AlertDescription>
        </Alert>
      )}

      <SalesMap areas={areas} names={names} periodDays={periodDays} until={until} />

      {map && (
        <p className="border-t bg-background px-4 py-1.5 text-xs text-muted-foreground">
          {map.areas.reduce((sum, a) => sum + a.sold, 0)} verkopen op de kaart
          {map.unplaced > 0 && `, ${map.unplaced} zonder bekende postcode`}. Ook opgezegde verkopen tellen mee.
        </p>
      )}
    </div>
  )
}

type MapProps = { areas: MapAreas; names: Map<string, string>; periodDays: number; until: string }

/** The MapLibre map; colours are set as feature state, so new numbers never reload the tiles. */
function SalesMap({ areas, names, periodDays, until }: MapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [tilesMissing, setTilesMissing] = useState(false)
  // Read by the click handler, which is registered once.
  const latest = useRef({ areas, names })
  useEffect(() => {
    latest.current = { areas, names }
  }, [areas, names])

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
          background: {
            type: "raster",
            tiles: ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "Achtergrond: PDOK, Kadaster",
          },
          [SOURCE]: {
            type: "vector",
            url: `pmtiles://${POSTCODE_TILES_URL}`,
            promoteId: "postcode",
            attribution: "Postcodegebieden: CBS, Esri Nederland",
          },
        },
        layers: [
          { id: "background", type: "raster", source: "background" },
          ...LEVELS.flatMap(({ level, minzoom, maxzoom }) => {
            const hasSales: ExpressionSpecification = ["boolean", ["feature-state", "has"], false]
            return [
              {
                id: `${level}-fill`,
                type: "fill" as const,
                source: SOURCE,
                "source-layer": level,
                minzoom,
                maxzoom,
                paint: {
                  "fill-color": ageColorExpression(),
                  "fill-opacity": ["case", hasSales, ["feature-state", "strength"], 0],
                },
              },
              {
                id: `${level}-line`,
                type: "line" as const,
                source: SOURCE,
                "source-layer": level,
                minzoom,
                maxzoom,
                paint: { "line-color": "#334155", "line-width": 0.5, "line-opacity": ["case", hasSales, 0.6, 0.15] },
              },
            ]
          }),
        ] as maplibregl.LayerSpecification[],
      },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    map.on("load", () => setLoaded(true))
    map.on("error", (event) => {
      if ("sourceId" in event && event.sourceId === SOURCE) setTilesMissing(true)
    })

    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
    map.on("click", (event) => {
      const level = levelAt(map.getZoom())
      const [feature] = map.queryRenderedFeatures(event.point, { layers: [`${level}-fill`] })
      const postcode = feature?.id === undefined ? undefined : String(feature.id)
      const area = postcode ? latest.current.areas[level].get(postcode) : undefined
      if (!postcode) return popup.remove()
      popup.setLngLat(event.lngLat).setDOMContent(popupContent(postcode, area, latest.current.names)).addTo(map)
    })
    for (const { level } of LEVELS) {
      map.on("mouseenter", `${level}-fill`, () => (map.getCanvas().style.cursor = "pointer"))
      map.on("mouseleave", `${level}-fill`, () => (map.getCanvas().style.cursor = ""))
    }

    mapRef.current = map
    return () => {
      popup.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Colour every area with sales; areas without sales stay transparent.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    for (const { level } of LEVELS) {
      map.removeFeatureState({ source: SOURCE, sourceLayer: level })
      const maxSold = Math.max(0, ...[...areas[level].values()].map((a) => a.sold))
      for (const area of areas[level].values()) {
        map.setFeatureState(
          { source: SOURCE, sourceLayer: level, id: area.postcode },
          { has: true, age: age(area.lastSoldOn, until, periodDays), strength: strength(area.sold, maxSold) },
        )
      }
    }
  }, [areas, loaded, periodDays, until])

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={container} className="absolute inset-0" />
      {tilesMissing && (
        <Alert className="absolute top-3 left-3 max-w-xs">
          <AlertDescription>
            De postcodegebieden zijn nog niet geladen: nl-postcodes.pmtiles staat nog niet in Storage.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

/** Built as DOM nodes rather than HTML, so a city name from ZMAdmin is never read as markup. */
function popupContent(postcode: string, area: MapArea | undefined, names: Map<string, string>): HTMLElement {
  const root = document.createElement("div")
  root.className = "space-y-1 text-sm"
  const add = (tag: string, text: string, className = "") => {
    const node = document.createElement(tag)
    node.textContent = text
    node.className = className
    root.append(node)
    return node
  }

  add("div", `${formatPostcode(postcode)}${area?.city ? ` · ${area.city}` : ""}`, "font-semibold")
  if (!area) {
    add("div", "Geen verkopen in deze periode", "text-muted-foreground")
    return root
  }
  add("div", `${area.sold} ${area.sold === 1 ? "verkoop" : "verkopen"}, laatste op ${formatDay(area.lastSoldOn)}`)
  const list = add("ul", "", "pt-1")
  for (const r of area.recruiters) {
    const item = document.createElement("li")
    item.textContent = `${names.get(r.recruiter) ?? r.recruiter}: ${r.sold}`
    list.append(item)
  }
  return root
}

/** "1234AB" as "1234 AB"; PC4 and PC5 as they are. */
function formatPostcode(postcode: string): string {
  return postcode.length === 6 ? `${postcode.slice(0, 4)} ${postcode.slice(4)}` : postcode
}

/** The colour ramp in days for the chosen period, and what darkness means. */
function Legend({ periodDays }: { periodDays: number }) {
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
