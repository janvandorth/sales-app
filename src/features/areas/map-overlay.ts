import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  MapGeoJSONFeature,
  Map as MapLibreMap,
} from "maplibre-gl"
import { partlyPicked, type Bounds } from "./areas"

/**
 * The areas drawn over the shades: those given out to someone else in the chosen period (hatched), the selection
 * (a thick orange outline) and the larger areas that hold part of it (dashed). Drawn by filters on the postcode
 * in the tiles, so nothing is fetched and every level shows a code of any level.
 */

export type Overlay = { picked: string[]; taken: string[] }

export const PICKED_COLOR = "#ea580c"

const POSTCODE: ExpressionSpecification = ["get", "postcode"]

/** Features covered by any of `codes`: their postcode starts with one. */
export function coveredBy(codes: string[]): FilterSpecification {
  const ofLength = (n: number) => codes.filter((c) => c.length === n)
  return [
    "any",
    ["in", ["slice", POSTCODE, 0, 4], ["literal", ofLength(4)]],
    ["in", ["slice", POSTCODE, 0, 5], ["literal", ofLength(5)]],
    ["in", POSTCODE, ["literal", ofLength(6)]],
  ]
}

/** Features whose postcode is one of `codes`. */
const oneOf = (codes: string[]): FilterSpecification => ["in", POSTCODE, ["literal", codes]]

/**
 * The overlay layers of one level's source, drawn from `minzoom` like its shades. The hatching stops at `maxzoom`,
 * where the next level takes over, so stripes never stack; outlines stay, so a picked PC4 keeps its border.
 */
export function overlayLayers(level: string, minzoom: number, maxzoom: number): LayerSpecification[] {
  const base = { source: level, "source-layer": level, minzoom, filter: oneOf([]) }
  return [
    { ...base, id: `${level}-taken`, type: "fill", maxzoom, paint: { "fill-pattern": "hatch" } },
    {
      ...base,
      id: `${level}-part`,
      type: "line",
      paint: { "line-color": PICKED_COLOR, "line-width": 2, "line-dasharray": [2, 1.5] },
    },
    { ...base, id: `${level}-picked`, type: "line", paint: { "line-color": PICKED_COLOR, "line-width": 3.5 } },
  ]
}

/**
 * Points every level's overlay at the current selection and the areas taken. A picked code is outlined by its own
 * level's layer only: zoomed in, a picked PC4 shows as one border, not as every street in it.
 */
export function applyOverlay(map: MapLibreMap, levels: readonly ("pc4" | "pc5" | "pc6")[], overlay: Overlay): void {
  const part = partlyPicked(overlay.picked)
  for (const level of levels) {
    const length = Number(level.slice(2)) // "pc5" → 5
    map.setFilter(`${level}-taken`, coveredBy(overlay.taken))
    map.setFilter(`${level}-part`, oneOf(part))
    map.setFilter(`${level}-picked`, oneOf(overlay.picked.filter((c) => c.length === length)))
  }
}

/** The box around a tapped feature's shape (as far as its tile holds it, which is near enough to open a map on). */
export function geometryBounds(geometry: MapGeoJSONFeature["geometry"]): Bounds {
  const box: Bounds = [Infinity, Infinity, -Infinity, -Infinity]
  const add = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return
    if (typeof coordinates[0] === "number") {
      const [lon, lat] = coordinates as number[]
      box[0] = Math.min(box[0], lon)
      box[1] = Math.min(box[1], lat)
      box[2] = Math.max(box[2], lon)
      box[3] = Math.max(box[3], lat)
      return
    }
    for (const inner of coordinates) add(inner)
  }
  if (geometry.type !== "GeometryCollection") add(geometry.coordinates)
  else {
    for (const part of geometry.geometries.map(geometryBounds)) add([part.slice(0, 2), part.slice(2)])
  }
  return box
}

/** Slate diagonal stripes on transparent, 8×8, for the "hatch" fill pattern. */
export function addHatch(map: MapLibreMap): void {
  const size = 8
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size >= 2) continue
      data.set([51, 65, 85, 150], (y * size + x) * 4)
    }
  }
  map.addImage("hatch", { width: size, height: size, data }, { pixelRatio: 2 })
}
