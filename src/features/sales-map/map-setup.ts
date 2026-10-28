import * as maplibregl from "maplibre-gl"
import type { RasterSourceSpecification } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import { Protocol } from "pmtiles"

/**
 * What every map in the app shares: MapLibre set up once, the postcode outlines and the background. Imported only
 * by lazily loaded pages, so MapLibre never weighs on the sales form.
 */

/**
 * Where pc4.pmtiles, pc5.pmtiles and pc6.pmtiles are (scripts/build-postcode-tiles.mjs): the outlines, with only
 * the postcode, as vector tiles. They are static, so the browser caches them and the backend sends no shapes.
 */
export const TILES_URL =
  import.meta.env.VITE_POSTCODE_TILES_URL ??
  `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/postcode-tiles/2025`

export const POSTCODE_ATTRIBUTION = "Postcodegebieden: CBS, Esri Nederland"

/** PDOK's grey topographic map, free and without a key. */
export const BACKGROUND_SOURCE: RasterSourceSpecification = {
  type: "raster",
  tiles: ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"],
  tileSize: 256,
  maxzoom: 19,
  attribution: "Achtergrond: PDOK, Kadaster",
}

/** One level's outlines as a vector source, each feature's id its postcode. */
export const postcodeSource = (level: "pc4" | "pc5" | "pc6") =>
  ({
    type: "vector",
    url: `pmtiles://${TILES_URL}/${level}.pmtiles`,
    promoteId: "postcode",
    attribution: POSTCODE_ATTRIBUTION,
  }) as const

// MapLibre looks for its worker next to its own module, which Vite moves; give it the worker's real address.
maplibregl.setWorkerUrl(maplibreWorkerUrl)
// pmtiles:// sources read the tile archives with range requests.
maplibregl.addProtocol("pmtiles", new Protocol().tile)

export { maplibregl }
