import { useEffect, useRef, useState } from "react"
import type { FilterSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import { Button } from "@/components/ui/button"
import { BACKGROUND_SOURCE, maplibregl, postcodeSource } from "../sales-map/map-setup"
import { areaOutline, type Piece } from "./area-outline"
import type { AreaAssignment, Bounds } from "./areas"
import { codeAt, coveredBy, finerThan, pickLevel, type PostcodeLevel } from "./map-overlay"
import type { Status } from "./tick"

const LEVELS: PostcodeLevel[] = ["pc4", "pc5", "pc6"]

/** Where each level's tiles start, and where the next one takes over, as on the sales map. */
const MIN_ZOOM: Record<PostcodeLevel, number> = { pc4: 0, pc5: 11, pc6: 13 }
const MAX_ZOOM: Record<PostcodeLevel, number> = { pc4: 11, pc5: 13, pc6: 24 }

const levelAt = (zoom: number): PostcodeLevel => (zoom >= MIN_ZOOM.pc6 ? "pc6" : zoom >= MIN_ZOOM.pc5 ? "pc5" : "pc4")

const DONE = "#12293b"

const oneOf = (codes: string[]): FilterSpecification => ["in", ["get", "postcode"], ["literal", codes]]

const EMPTY = { type: "FeatureCollection" as const, features: [] }

type Props = {
  area: AreaAssignment
  /** Where the map opens: around the area's doors. */
  bounds: Bounds | null
  /** Every code with doors done, and whether all of them are. */
  statuses: Map<string, Status>
  /** A tap on a postcode of the area, at the level picked. */
  onTap: (code: string) => void
}

/**
 * The area on the map: what was walked filled as finely as the zoom allows, and the area's edge outlined per PC4,
 * PC5 or PC6 picked. A tap inside the area ticks off the part of it in that outline.
 */
export default function TickMap({ area, bounds, statuses, onTap }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [shown, setShown] = useState<PostcodeLevel>("pc6")
  const [choice, setChoice] = useState<PostcodeLevel>("pc6")
  const level = pickLevel(shown, choice)
  // The map's handlers are set up once; they read the latest of these.
  const latest = useRef({ level, onTap })
  latest.current = { level, onTap }
  /** Merges the outline again, for another level picked; set once the map is there. */
  const redraw = useRef<() => void>(() => {})

  useEffect(() => {
    if (!container.current) return
    const inArea = coveredBy(area.postcodes)
    const m = new maplibregl.Map({
      container: container.current,
      ...(bounds
        ? { bounds, fitBoundsOptions: { padding: 24, maxZoom: 16 } }
        : { center: [5.12, 52.09] as [number, number], zoom: 12 }),
      style: {
        version: 8,
        sources: {
          background: BACKGROUND_SOURCE,
          pc4: postcodeSource("pc4"),
          pc5: postcodeSource("pc5"),
          pc6: postcodeSource("pc6"),
          outline: { type: "geojson", data: EMPTY },
        },
        layers: [
          { id: "background", type: "raster", source: "background" },
          ...LEVELS.flatMap((l) => {
            const finest = { source: l, "source-layer": l, minzoom: MIN_ZOOM[l], maxzoom: MAX_ZOOM[l] }
            return [
              {
                ...finest,
                id: `${l}-part`,
                type: "fill" as const,
                filter: oneOf([]),
                paint: { "fill-color": DONE, "fill-opacity": 0.18 },
              },
              {
                ...finest,
                id: `${l}-done`,
                type: "fill" as const,
                filter: oneOf([]),
                paint: { "fill-color": DONE, "fill-opacity": 0.55 },
              },
              // What a tap hits: the area's postcodes, unseen. On at every zoom from the level's start, so its tiles
              // are loaded for the outline.
              {
                source: l,
                "source-layer": l,
                minzoom: MIN_ZOOM[l],
                id: `${l}-hit`,
                type: "fill" as const,
                filter: inArea,
                paint: { "fill-color": DONE, "fill-opacity": 0 },
              },
            ]
          }),
          {
            id: "outline",
            type: "line",
            source: "outline",
            paint: { "line-color": DONE, "line-width": 2.5, "line-opacity": 0.9 },
          },
        ],
      },
    })

    /**
     * The area's edge per code of the level picked. Each part comes from the shape it was given out as (a PC5
     * "3561A" as its PC5), or the level picked where that is smaller: merged PC6s would leave the streets between
     * them as gaps. Where the zoom has no tiles for that level yet, the smallest it has.
     */
    let drawn = ""
    function outline() {
      const { level } = latest.current
      const length = Number(level.slice(2))
      const finest = Number(levelAt(m.getZoom()).slice(2))
      const parts: Piece[] = area.postcodes.flatMap((code) => {
        const source = `pc${Math.min(Math.max(code.length, length), finest)}`
        return m
          .querySourceFeatures(source, { sourceLayer: source, filter: coveredBy([code]) })
          .flatMap((f) =>
            typeof f.properties.postcode === "string"
              ? [{ postcode: f.properties.postcode, geometry: f.geometry }]
              : [],
          )
      })
      // Once per level and set of shapes: panning over loaded tiles changes nothing.
      const key = `${level}|${finest}|${parts.length}`
      if (key === drawn) return
      drawn = key
      const merged = areaOutline(parts, length)
      ;(m.getSource("outline") as GeoJSONSource | undefined)?.setData(merged as Parameters<GeoJSONSource["setData"]>[0])
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(outline, 150)
    }

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    m.on("load", () => setLoaded(true))
    m.on("zoomend", () => setShown(levelAt(m.getZoom())))
    m.on("moveend", later)
    m.on("sourcedata", (event) => {
      if (event.sourceId !== "outline" && event.isSourceLoaded) later()
    })
    m.on("click", (event) => {
      const { level, onTap } = latest.current
      const feature = m.queryRenderedFeatures(event.point, { layers: [`${levelAt(m.getZoom())}-hit`] })[0]
      const postcode = feature?.properties?.postcode
      if (typeof postcode === "string") onTap(codeAt(postcode, level))
    })
    setShown(levelAt(m.getZoom()))
    map.current = m
    redraw.current = () => {
      drawn = ""
      outline()
    }
    return () => {
      clearTimeout(timer)
      m.remove()
    }
  }, [area, bounds])

  useEffect(() => {
    if (loaded) redraw.current()
  }, [level, loaded])

  useEffect(() => {
    const m = map.current
    if (!m || !loaded) return
    for (const l of LEVELS) {
      const length = Number(l.slice(2))
      const of = (status: Status) =>
        [...statuses].filter(([code, s]) => s === status && code.length === length).map(([code]) => code)
      m.setFilter(`${l}-done`, oneOf(of("done")))
      m.setFilter(`${l}-part`, oneOf(of("part")))
    }
  }, [statuses, loaded])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* MapLibre's stylesheet makes the container position: relative, so it fills by flex, not by inset. */}
      <div ref={container} className="min-h-0 flex-1" />
      <div className="absolute top-3 left-3 flex rounded-md border bg-background p-0.5 shadow-sm" role="group">
        {LEVELS.map((l) => (
          <Button
            key={l}
            size="sm"
            variant={l === level ? "default" : "ghost"}
            aria-pressed={l === level}
            disabled={finerThan(l, shown)}
            onClick={() => setChoice(l)}
          >
            {l.toUpperCase()}
          </Button>
        ))}
      </div>
    </div>
  )
}
