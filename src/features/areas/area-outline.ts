import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping"

/**
 * The edge of an area given out, split by the level picked: the area's own postcode shapes merged per PC4, PC5 or
 * PC6 they lie in. Not the whole PC4 around a part of it, so the outline is what a tap ticks off.
 */

/** A shape from the map's tiles: a postcode, or the part of one within a tile. */
export type Piece = { postcode: string; geometry: { type: string; coordinates: unknown } }

export type Outline = {
  type: "FeatureCollection"
  features: {
    type: "Feature"
    properties: { code: string }
    geometry: { type: "MultiPolygon"; coordinates: MultiPolygon }
  }[]
}

const asPolygons = (geometry: Piece["geometry"]): Polygon[] =>
  geometry.type === "Polygon"
    ? [geometry.coordinates as Polygon]
    : geometry.type === "MultiPolygon"
      ? (geometry.coordinates as MultiPolygon)
      : []

/**
 * The pieces merged per code of `length` characters ("3561" for PC4). A postcode cut by tile edges comes in
 * several pieces that overlap a little; merging joins them again.
 */
export function areaOutline(pieces: Piece[], length: number): Outline {
  const byCode = new Map<string, Polygon[]>()
  for (const piece of pieces) {
    const code = piece.postcode.slice(0, length)
    byCode.set(code, [...(byCode.get(code) ?? []), ...asPolygons(piece.geometry)])
  }
  const features: Outline["features"] = []
  for (const [code, polygons] of byCode) {
    if (polygons.length === 0) continue
    const [first, ...rest] = polygons
    features.push({
      type: "Feature",
      properties: { code },
      geometry: { type: "MultiPolygon", coordinates: polygonClipping.union(first, ...rest) },
    })
  }
  return { type: "FeatureCollection", features }
}
