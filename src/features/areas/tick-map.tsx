import { useEffect, useRef, useState } from "react"
import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl"
import { Button } from "@/components/ui/button"
import { BACKGROUND_SOURCE, maplibregl, postcodeSource } from "../sales-map/map-setup"
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

/** The postcodes of a level with any of the area in them: those inside it, and the larger ones around a part. */
function inArea(codes: string[], level: PostcodeLevel): FilterSpecification {
  const length = Number(level.slice(2))
  const around = codes.filter((c) => c.length > length).map((c) => c.slice(0, length))
  return ["any", coveredBy(codes), oneOf([...new Set(around)])] as FilterSpecification
}

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
 * The area on the map, what was walked filled as finely as the zoom allows, and the postcodes of the level picked
 * outlined: a tap ticks off the PC4, PC5 or PC6 under it, as outlined.
 */
export default function TickMap({ area, bounds, statuses, onTap }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [shown, setShown] = useState<PostcodeLevel>("pc6")
  const [choice, setChoice] = useState<PostcodeLevel>("pc6")
  const level = pickLevel(shown, choice)
  // The click handler is set up once; it reads the latest of these.
  const latest = useRef({ level, onTap })
  latest.current = { level, onTap }

  useEffect(() => {
    if (!container.current) return
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
        },
        layers: [
          { id: "background", type: "raster", source: "background" },
          ...LEVELS.flatMap((l) => {
            const base = { source: l, "source-layer": l, minzoom: MIN_ZOOM[l] }
            // What was walked and the area's own postcodes, at the finest level the zoom has: a PC4 picked shows
            // the PC6s done in it, not the whole PC4 filled.
            const finest = { ...base, maxzoom: MAX_ZOOM[l] }
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
              {
                ...finest,
                id: `${l}-area`,
                type: "line" as const,
                filter: coveredBy(area.postcodes),
                paint: { "line-color": DONE, "line-width": 0.75, "line-opacity": 0.4 },
              },
              // What a tap picks: the postcodes of the level picked; shown for that level only.
              {
                ...base,
                id: `${l}-line`,
                type: "line" as const,
                layout: { visibility: "none" as const },
                filter: inArea(area.postcodes, l),
                paint: { "line-color": DONE, "line-width": 2, "line-opacity": 0.85 },
              },
              // What a tap at this level hits: the area's postcodes, unseen.
              {
                ...base,
                id: `${l}-hit`,
                type: "fill" as const,
                filter: inArea(area.postcodes, l),
                paint: { "fill-color": DONE, "fill-opacity": 0 },
              },
            ]
          }),
        ],
      },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    m.on("load", () => setLoaded(true))
    m.on("zoomend", () => setShown(levelAt(m.getZoom())))
    m.on("click", (event) => {
      const { level, onTap } = latest.current
      const feature = m.queryRenderedFeatures(event.point, { layers: [`${level}-hit`] })[0]
      const postcode = feature?.properties?.postcode
      if (typeof postcode === "string") onTap(codeAt(postcode, level))
    })
    setShown(levelAt(m.getZoom()))
    map.current = m
    return () => m.remove()
  }, [area, bounds])

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

  // The level a tap picks is outlined whatever the zoom: what is outlined is what a tap ticks off.
  useEffect(() => {
    const m = map.current
    if (!m || !loaded) return
    for (const l of LEVELS) m.setLayoutProperty(`${l}-line`, "visibility", l === level ? "visible" : "none")
  }, [level, loaded])

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
