import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  MapGeoJSONFeature,
  Map as MapLibreMap,
} from "maplibre-gl"
import { partlyPicked, unionBounds, type Bounds } from "./areas"

/**
 * The areas drawn over the shades: those given out to someone else in the chosen period (hatched), the selection
 * (a thick orange outline) and the larger areas that hold part of it (dashed). Drawn by filters on the postcode
 * in the tiles, so nothing is fetched and every level shows a code of any level.
 */

export type Overlay = { picked: string[]; taken: string[] }

export type PostcodeLevel = "pc4" | "pc5" | "pc6"

const CODE_LENGTH: Record<PostcodeLevel, number> = { pc4: 4, pc5: 5, pc6: 6 }

/** Whether `level` is smaller than `than`: a tap never picks smaller than the map shows. */
export const finerThan = (level: PostcodeLevel, than: PostcodeLevel) => CODE_LENGTH[level] > CODE_LENGTH[than]

/** The level a tap picks at: the chosen one, or what the map shows when the chosen one is smaller. */
export function pickLevel(shown: PostcodeLevel, choice: PostcodeLevel): PostcodeLevel {
  return finerThan(choice, shown) ? shown : choice
}

/** The code at `level` of the area that holds `postcode`: "3561AC" at PC5 is "3561A". */
export const codeAt = (postcode: string, level: PostcodeLevel) => postcode.slice(0, CODE_LENGTH[level])

export const PICKED_COLOR = "#ea580c"

/** A light red over the picked areas, so the selection reads as one block; the kansen shade still shows through. */
const PICKED_FILL = "#ef4444"

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
    // The area a tap would pick, under the mouse.
    { ...base, id: `${level}-hover`, type: "fill", paint: { "fill-color": PICKED_COLOR, "fill-opacity": 0.3 } },
    {
      ...base,
      id: `${level}-picked-fill`,
      type: "fill",
      paint: { "fill-color": PICKED_FILL, "fill-opacity": 0.22 },
    },
    { ...base, id: `${level}-picked`, type: "line", paint: { "line-color": PICKED_COLOR, "line-width": 3.5 } },
  ]
}

/**
 * Points every level's overlay at the current selection and the areas taken. A picked code is outlined by its own
 * level's layer only: zoomed in, a picked PC4 shows as one border, not as every street in it.
 */
export function applyOverlay(map: MapLibreMap, levels: readonly PostcodeLevel[], overlay: Overlay): void {
  const part = partlyPicked(overlay.picked)
  for (const level of levels) {
    const length = Number(level.slice(2)) // "pc5" → 5
    map.setFilter(`${level}-taken`, coveredBy(overlay.taken))
    map.setFilter(`${level}-part`, oneOf(part))
    const picked = oneOf(overlay.picked.filter((c) => c.length === length))
    map.setFilter(`${level}-picked-fill`, picked)
    map.setFilter(`${level}-picked`, picked)
  }
}

/** Fills `code` on its own level's layer, the area a tap would pick; null clears it. */
export function setHover(map: MapLibreMap, levels: readonly PostcodeLevel[], code: string | null): void {
  for (const level of levels) {
    map.setFilter(`${level}-hover`, oneOf(code?.length === CODE_LENGTH[level] ? [code] : []))
  }
}

/**
 * The box around `code` from its level's loaded tiles: a larger area picked while zoomed in on a street. Its
 * source is loaded at every zoom from its own, since its overlay layers are always on. Null when not loaded.
 */
export function sourceBounds(map: MapLibreMap, level: PostcodeLevel, code: string): Bounds | null {
  const parts = map.querySourceFeatures(level, { sourceLayer: level, filter: ["==", POSTCODE, code] })
  return unionBounds(parts.map((part) => geometryBounds(part.geometry)))
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
