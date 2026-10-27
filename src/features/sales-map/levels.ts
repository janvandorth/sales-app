/**
 * The postcode level the map shows at each zoom: whole PC4 areas for the country, PC5 for a neighbourhood, PC6 for
 * a few streets. The tile layers of scripts/build-postcode-tiles.sh start at these same zooms.
 */
export const LEVELS = [
  { level: "pc4", length: 4, minzoom: 0, maxzoom: 11 },
  { level: "pc5", length: 5, minzoom: 11, maxzoom: 13 },
  { level: "pc6", length: 6, minzoom: 13, maxzoom: 24 },
] as const

export type Level = (typeof LEVELS)[number]["level"]

/** nl-postcodes.pmtiles from scripts/build-postcode-tiles.sh, in the public Storage bucket `postcode-tiles`. */
export const POSTCODE_TILES_URL =
  `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/postcode-tiles/nl-postcodes.pmtiles`

/** The level shown at a zoom; MapLibre's minzoom is inclusive and maxzoom exclusive, as here. */
export function levelAt(zoom: number): Level {
  return LEVELS.find((l) => zoom >= l.minzoom && zoom < l.maxzoom)?.level ?? "pc6"
}
