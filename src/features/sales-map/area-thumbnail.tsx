import { useEffect, useRef } from "react"
import type { AreaAssignment } from "../areas/areas"
import { addHatch, applyOverlay, overlayLayers, type PostcodeLevel } from "../areas/map-overlay"
import { BACKGROUND_SOURCE, maplibregl, postcodeSource } from "./map-setup"

const LEVELS: PostcodeLevel[] = ["pc4", "pc5", "pc6"]

/** Where each level's outlines start, as on the full map. */
const MIN_ZOOM: Record<PostcodeLevel, number> = { pc4: 0, pc5: 11, pc6: 13 }

/**
 * A still map of one area, its postcodes outlined and filled as when it was picked: a glance at where today is.
 * Not interactive; the card around it opens the full map.
 */
export default function AreaThumbnail({ area }: { area: AreaAssignment }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current || !area.bounds) return
    const map = new maplibregl.Map({
      container: container.current,
      bounds: area.bounds,
      fitBoundsOptions: { padding: 20, maxZoom: 16 },
      interactive: false,
      // Too small for MapLibre's attribution box; the sources are credited in one line below.
      attributionControl: false,
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
          ...LEVELS.flatMap((level) => overlayLayers(level, MIN_ZOOM[level], 24)),
        ],
      },
    })
    map.setMissingStyleImageResolver((id) => {
      if (id === "hatch" && !map.hasImage("hatch")) addHatch(map)
    })
    map.on("load", () => applyOverlay(map, LEVELS, { picked: area.postcodes, taken: [] }))
    return () => map.remove()
  }, [area])

  // Sized by its own classes: MapLibre's stylesheet makes the container position: relative.
  return (
    <>
      <div ref={container} className="h-full w-full" />
      <span className="absolute bottom-1 left-1.5 text-[10px] text-muted-foreground">PDOK, Kadaster · CBS, Esri</span>
    </>
  )
}
