#!/bin/sh
# Builds nl-postcodes.pmtiles, the postcode areas under the sales map, from CBS "Kerncijfers per postcode".
# Run it once a year when CBS publishes new areas (cbs.nl > Gegevens per postcode > Downloads), on a Mac with
# `brew install gdal tippecanoe`:
#
#   sh scripts/build-postcode-tiles.sh cbs_pc4_2025.gpkg cbs_pc5_2025.gpkg cbs_pc6_2025.gpkg
#
# Each GeoPackage holds one layer of areas in RD New (EPSG:28992) with the postcode in a column called
# "postcode" (override with POSTCODE_COLUMN). Only that column is kept, renamed to `postcode`, so the map can
# join its sales on it. Upload the result to the public Storage bucket `postcode-tiles` (see README, Sales map).
# The areas are by Esri Nederland, published by CBS: the map must credit both.
set -e

[ $# -eq 3 ] || { echo "usage: $0 <pc4.gpkg> <pc5.gpkg> <pc6.gpkg>" >&2; exit 2; }
command -v ogr2ogr >/dev/null 2>&1 || { echo "ogr2ogr missing: brew install gdal" >&2; exit 1; }
command -v tippecanoe >/dev/null 2>&1 || { echo "tippecanoe missing: brew install tippecanoe" >&2; exit 1; }

COLUMN="${POSTCODE_COLUMN:-postcode}"
OUT="${OUT:-nl-postcodes.pmtiles}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# One GeoPackage to newline-delimited GeoJSON in WGS84 with only `postcode`, as text ("1234", "1234A", "1234AB").
convert() {
  layer=$(ogrinfo -q "$1" | sed -n 's/^[0-9]*: \([^ ]*\).*/\1/p' | head -n 1)
  [ -n "$layer" ] || { echo "no layer in $1" >&2; exit 1; }
  echo "$1: layer $layer"
  ogr2ogr -f GeoJSONSeq -t_srs EPSG:4326 -lco RS=NO "$WORK/$2.geojsonl" "$1" \
    -sql "SELECT CAST(\"$COLUMN\" AS character(6)) AS postcode FROM \"$layer\""
}

convert "$1" pc4
convert "$2" pc5
convert "$3" pc6

# Every area must survive at every zoom, or a postcode with sales would show as a hole: no dropping or
# coalescing, borders shared so neighbours keep touching. PC5 and PC6 only appear when zoomed in far enough
# to tell them apart; the app switches layers at the same zooms (LEVELS in src/features/sales-map/levels.ts).
tippecanoe -o "$OUT" --force \
  --maximum-zoom=14 \
  --no-feature-limit --no-tile-size-limit --detect-shared-borders \
  -L "{\"file\":\"$WORK/pc4.geojsonl\",\"layer\":\"pc4\",\"minzoom\":6}" \
  -L "{\"file\":\"$WORK/pc5.geojsonl\",\"layer\":\"pc5\",\"minzoom\":11}" \
  -L "{\"file\":\"$WORK/pc6.geojsonl\",\"layer\":\"pc6\",\"minzoom\":13}"

ls -lh "$OUT"
