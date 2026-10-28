// Builds the outlines under the sales map as three vector-tile archives (PMTiles): pc4.pmtiles (zoom 5 to 10),
// pc5.pmtiles (zoom 11) and pc6.pmtiles (zoom 14). The map shows each up to the next level, MapLibre stretching the
// last zoom; the tiles hold only the postcode, as `postcode`, and the backend sends what each is shaded by. Run it
// once a year, when CBS publishes "Kerncijfers per postcode" (cbs.nl > Gegevens per postcode > Downloads):
//
//   node scripts/build-postcode-tiles.mjs <cbs_pc5_YYYY.gpkg> <cbs_pc6_YYYY.gpkg> <PC4 year on PDOK> <out folder>
//
// and upload the three files to the public Supabase Storage bucket VITE_POSTCODE_TILES_URL points at (see
// .env.example). PC5 and PC6 come from the CBS GeoPackages, read with Node's own SQLite: the areas are in RD New
// (EPSG:28992) as WKB and are converted to WGS84 with the standard RD approximation. PC4 comes from PDOK, which has
// it a year later. The areas are by Esri Nederland, published by CBS: the map must credit both.
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { gzipSync } from "node:zlib"
import { geoJSONToTile } from "@maplibre/geojson-vt"
import { fromGeojsonVt } from "@maplibre/vt-pbf"
import { zxyToTileId } from "pmtiles"

const [pc5Gpkg, pc6Gpkg, pc4Year, out] = process.argv.slice(2)
if (!pc5Gpkg || !pc6Gpkg || !/^\d{4}$/.test(pc4Year ?? "") || !out) {
  console.error("usage: node scripts/build-postcode-tiles.mjs <cbs_pc5.gpkg> <cbs_pc6.gpkg> <pc4 year> <out folder>")
  process.exit(2)
}
mkdirSync(out, { recursive: true })

const EXTENT = 4096
const BUFFER = 64
/** Simplification in tile units (of EXTENT): a little under a pixel of a 512-pixel tile. */
const TOLERANCE = 4
const ATTRIBUTION = "Postcodegebieden: CBS, Esri Nederland"

await build("pc4", [5, 6, 7, 8, 9, 10], [await pdokPc4(pc4Year)])
await build("pc5", [11], gpkgChunks(pc5Gpkg, "postcode5", /^[1-9]\d{3}[A-Z]$/, 6))
await build("pc6", [14], gpkgChunks(pc6Gpkg, "postcode6", /^[1-9]\d{3}[A-Z]{2}$/, 9))

/**
 * Tiles one layer at `zooms` and writes `<name>.pmtiles`. `chunks` yields groups of areas with their bounds, each
 * group with the tiles it covers; an area in two groups is cut into both, as a tile only keeps what lies within it.
 */
async function build(name, zooms, chunks) {
  const started = Date.now()
  const tiles = new Map()
  let areas = 0
  for await (const chunk of chunks) {
    areas += chunk.features.length
    for (const z of zooms) {
      const buckets = new Map()
      const margin = BUFFER / EXTENT
      for (const feature of chunk.features) {
        const [x0, y0] = tileOf(feature.bounds[0], feature.bounds[3], z)
        const [x1, y1] = tileOf(feature.bounds[2], feature.bounds[1], z)
        for (let x = Math.floor(x0 - margin); x <= Math.floor(x1 + margin); x++) {
          for (let y = Math.floor(y0 - margin); y <= Math.floor(y1 + margin); y++) {
            if (chunk.covers && !chunk.covers(z, x, y)) continue
            const key = `${x}/${y}`
            if (!buckets.has(key)) buckets.set(key, [])
            buckets.get(key).push(feature)
          }
        }
      }
      for (const [key, features] of buckets) {
        const [x, y] = key.split("/").map(Number)
        const data = { type: "FeatureCollection", features }
        // geojson-vt leaves tiles at its maxZoom unsimplified, so it is set one deeper: every tile here is drawn
        // simplified to a fraction of a pixel, and MapLibre stretches the last zoom for the deeper ones.
        const options = { extent: EXTENT, buffer: BUFFER, tolerance: TOLERANCE, clip: true, maxZoom: z + 1 }
        const tile = geoJSONToTile(data, z, x, y, options)
        if (!tile || tile.features.length === 0) continue
        const pbf = fromGeojsonVt({ [name]: tile }, { version: 2, extent: EXTENT })
        tiles.set(zxyToTileId(z, x, y), gzipSync(pbf, { level: 9 }))
      }
    }
  }
  const bytes = writePmtiles(join(out, `${name}.pmtiles`), tiles, {
    minZoom: zooms[0],
    maxZoom: zooms.at(-1),
    metadata: {
      name,
      attribution: ATTRIBUTION,
      vector_layers: [{ id: name, fields: { postcode: "String" }, minzoom: zooms[0], maxzoom: zooms.at(-1) }],
    },
  })
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(`${name}.pmtiles: ${areas} areas, ${tiles.size} tiles, ${(bytes / 1e6).toFixed(1)} MB, ${seconds} s`)
}

/** The PC4 areas from PDOK as one chunk. */
async function pdokPc4(year) {
  const features = []
  const seen = new Set()
  let url = `https://api.pdok.nl/cbs/postcode4/ogc/v1/collections/postcode4/items?f=json&limit=1000&jaarcode=${year}`
  while (url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`PDOK answered ${response.status} for ${url}`)
    const page = await response.json()
    for (const f of page.features) {
      const postcode = String(f.properties.postcode ?? "")
      if (!/^\d{4}$/.test(postcode) || seen.has(postcode) || !f.geometry) continue
      seen.add(postcode)
      features.push({ type: "Feature", properties: { postcode }, geometry: f.geometry, bounds: boundsOf(f.geometry) })
    }
    url = page.links.find((link) => link.rel === "next")?.href
  }
  if (features.length < 4000) throw new Error(`Only ${features.length} PC4 areas for ${year}; is that year published?`)
  return { features }
}

/**
 * The areas of a CBS GeoPackage in groups of one tile at `chunkZoom` each, so only a group's outlines are in memory
 * at a time. The GeoPackage's spatial index gives every area's bounds without reading its outline.
 */
function* gpkgChunks(gpkg, column, pattern, chunkZoom) {
  const db = new DatabaseSync(gpkg, { readOnly: true })
  const table = db.prepare("SELECT table_name FROM gpkg_contents WHERE data_type = 'features'").get()?.table_name
  const geom = db.prepare("SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ?").get(table)?.column_name
  if (!table || !geom) throw new Error(`${gpkg} holds no feature table`)

  const groups = new Map()
  const index = `SELECT t.fid, t.${column} AS postcode, r.minx, r.miny, r.maxx, r.maxy
                 FROM "${table}" t JOIN "rtree_${table}_${geom}" r ON r.id = t.fid`
  for (const row of db.prepare(index).iterate()) {
    const postcode = String(row.postcode ?? "")
      .replace(/\s/g, "")
      .toUpperCase()
    if (!pattern.test(postcode)) continue
    const corners = [rdToWgs84(row.minx, row.miny), rdToWgs84(row.maxx, row.maxy)]
    const more = [rdToWgs84(row.minx, row.maxy), rdToWgs84(row.maxx, row.miny)]
    const all = [...corners, ...more]
    const bounds = [
      Math.min(...all.map((c) => c[0])),
      Math.min(...all.map((c) => c[1])),
      Math.max(...all.map((c) => c[0])),
      Math.max(...all.map((c) => c[1])),
    ]
    const [x0, y0] = tileOf(bounds[0], bounds[3], chunkZoom)
    const [x1, y1] = tileOf(bounds[2], bounds[1], chunkZoom)
    for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
      for (let y = Math.floor(y0); y <= Math.floor(y1); y++) {
        const key = `${x}/${y}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push({ fid: row.fid, postcode, bounds })
      }
    }
  }

  const outline = db.prepare(`SELECT "${geom}" AS geom FROM "${table}" WHERE fid = ?`)
  for (const [key, members] of groups) {
    const [cx, cy] = key.split("/").map(Number)
    const features = members.map(({ fid, postcode, bounds }) => ({
      type: "Feature",
      properties: { postcode },
      geometry: geometry(Buffer.from(outline.get(fid).geom)),
      bounds,
    }))
    // Only the tiles within this group's tile, so a tile is made once, from every area touching it.
    const covers = (z, x, y) => x >> (z - chunkZoom) === cx && y >> (z - chunkZoom) === cy
    yield { features, covers }
  }
}

/** Tile coordinates (fractional) of a point at zoom `z`. */
function tileOf(lon, lat, z) {
  const n = 2 ** z
  const rad = (lat * Math.PI) / 180
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n]
}

function boundsOf(geometry) {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  const walk = (c) => {
    if (typeof c[0] === "number") {
      b[0] = Math.min(b[0], c[0])
      b[1] = Math.min(b[1], c[1])
      b[2] = Math.max(b[2], c[0])
      b[3] = Math.max(b[3], c[1])
    } else c.forEach(walk)
  }
  walk(geometry.coordinates)
  return b
}

// --- PMTiles v3 (github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md) ------------------------------------------

/** Writes the tiles, sorted by tile id, with gzipped directories; returns the file size. */
function writePmtiles(path, tiles, { minZoom, maxZoom, metadata }) {
  const ids = [...tiles.keys()].sort((a, b) => a - b)
  const entries = []
  let offset = 0
  for (const tileId of ids) {
    const length = tiles.get(tileId).length
    entries.push({ tileId, offset, length, runLength: 1 })
    offset += length
  }

  // The root directory must fit in the first 16 kB with the header; larger sets go into leaf directories.
  let root = gzipSync(directory(entries))
  let leaves = Buffer.alloc(0)
  for (let leafSize = 4096; root.length > 16_384 - 127; leafSize *= 2) {
    const parts = []
    const pointers = []
    let leafOffset = 0
    for (let i = 0; i < entries.length; i += leafSize) {
      const leaf = gzipSync(directory(entries.slice(i, i + leafSize)))
      pointers.push({ tileId: entries[i].tileId, offset: leafOffset, length: leaf.length, runLength: 0 })
      parts.push(leaf)
      leafOffset += leaf.length
    }
    root = gzipSync(directory(pointers))
    leaves = Buffer.concat(parts)
  }

  const meta = gzipSync(JSON.stringify(metadata))
  const data = Buffer.concat(ids.map((id) => tiles.get(id)))
  const header = Buffer.alloc(127)
  header.write("PMTiles", 0, "ascii")
  header.writeUInt8(3, 7)
  const u64 = (at, value) => header.writeBigUInt64LE(BigInt(value), at)
  u64(8, 127)
  u64(16, root.length)
  u64(24, 127 + root.length)
  u64(32, meta.length)
  u64(40, 127 + root.length + meta.length)
  u64(48, leaves.length)
  u64(56, 127 + root.length + meta.length + leaves.length)
  u64(64, data.length)
  u64(72, ids.length) // addressed tiles
  u64(80, ids.length) // tile entries
  u64(88, ids.length) // tile contents
  header.writeUInt8(1, 96) // clustered: tile data in tile id order
  header.writeUInt8(2, 97) // directories gzipped
  header.writeUInt8(2, 98) // tiles gzipped
  header.writeUInt8(1, 99) // Mapbox Vector Tiles
  header.writeUInt8(minZoom, 100)
  header.writeUInt8(maxZoom, 101)
  const e7 = (at, degrees) => header.writeInt32LE(Math.round(degrees * 1e7), at)
  e7(102, 3.2) // the Netherlands
  e7(106, 50.7)
  e7(110, 7.3)
  e7(114, 53.6)
  header.writeUInt8(minZoom, 118)
  e7(119, 5.3)
  e7(123, 52.15)

  const file = Buffer.concat([header, root, meta, leaves, data])
  writeFileSync(path, file)
  return file.length
}

/** A directory: the count, then per column the tile id deltas, run lengths, lengths and offsets as varints. */
function directory(entries) {
  const bytes = []
  const varint = (value) => {
    let v = value
    while (v >= 0x80) {
      bytes.push((v % 0x80) | 0x80)
      v = Math.floor(v / 0x80)
    }
    bytes.push(v)
  }
  varint(entries.length)
  let last = 0
  for (const e of entries) {
    varint(e.tileId - last)
    last = e.tileId
  }
  for (const e of entries) varint(e.runLength)
  for (const e of entries) varint(e.length)
  entries.forEach((e, i) => {
    const previous = entries[i - 1]
    // 0 means "right after the previous tile", which keeps a clustered archive's directory small.
    varint(i > 0 && e.offset === previous.offset + previous.length ? 0 : e.offset + 1)
  })
  return Buffer.from(bytes)
}

// --- GeoPackage geometry --------------------------------------------------------------------------------------------

/** A GeoPackage geometry blob (header + WKB, RD New) as a GeoJSON geometry in WGS84. */
function geometry(blob) {
  if (blob[0] !== 0x47 || blob[1] !== 0x50) throw new Error("not a GeoPackage geometry")
  const envelope = [0, 32, 48, 48, 64][(blob[3] >> 1) & 0x07]
  return wkb({ buffer: blob, offset: 8 + envelope })
}

function wkb(r) {
  const little = r.buffer[r.offset] === 1
  r.offset += 1
  const type = u32(r, little) % 1000 // 2D; Z and M variants never occur here
  if (type === 3) return { type: "Polygon", coordinates: polygon(r, little) }
  if (type === 6) {
    const polygons = []
    for (let count = u32(r, little); count > 0; count--) {
      const inner = wkb(r)
      polygons.push(...(inner.type === "Polygon" ? [inner.coordinates] : inner.coordinates))
    }
    return { type: "MultiPolygon", coordinates: polygons }
  }
  throw new Error(`unexpected WKB type ${type}`)
}

function polygon(r, little) {
  const rings = []
  for (let i = u32(r, little); i > 0; i--) {
    const ring = []
    for (let j = u32(r, little); j > 0; j--) ring.push(rdToWgs84(f64(r, little), f64(r, little)))
    rings.push(ring)
  }
  return rings
}

function u32(r, little) {
  const value = little ? r.buffer.readUInt32LE(r.offset) : r.buffer.readUInt32BE(r.offset)
  r.offset += 4
  return value
}

function f64(r, little) {
  const value = little ? r.buffer.readDoubleLE(r.offset) : r.buffer.readDoubleBE(r.offset)
  r.offset += 8
  return value
}

/** RD New (metres) to WGS84 [lon, lat], the standard polynomial approximation (Schreutelkamp & Strang van Hees). */
function rdToWgs84(x, y) {
  const dX = (x - 155000) * 1e-5
  const dY = (y - 463000) * 1e-5
  const north =
    3235.65389 * dY -
    32.58297 * dX ** 2 -
    0.2475 * dY ** 2 -
    0.84978 * dX ** 2 * dY -
    0.0655 * dY ** 3 -
    0.01709 * dX ** 2 * dY ** 2 -
    0.00738 * dX +
    0.0053 * dX ** 4 -
    0.00039 * dX ** 2 * dY ** 3 +
    0.00033 * dX ** 4 * dY -
    0.00012 * dX * dY
  const east =
    5260.52916 * dX +
    105.94684 * dX * dY +
    2.45656 * dX * dY ** 2 -
    0.81885 * dX ** 3 +
    0.05594 * dX * dY ** 3 -
    0.05607 * dX ** 3 * dY +
    0.01199 * dY -
    0.00256 * dX ** 3 * dY ** 2 +
    0.00128 * dX * dY ** 4 +
    0.00022 * dY ** 2 -
    0.00022 * dX ** 2 +
    0.00026 * dX ** 5
  return [5.387206 + east / 3600, 52.15517 + north / 3600]
}
