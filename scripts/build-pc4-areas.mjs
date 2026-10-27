// Builds public/nl-pc4.geojson, the PC4 areas under the sales map, from CBS postcode statistics on PDOK.
// Run it when CBS publishes a new year of areas (works on Windows and Mac, needs internet):
//
//   node scripts/build-pc4-areas.mjs 2024
//
// The argument is the statistics year (PDOK's `jaarcode`). Only the postcode is kept, as `postcode` ("1234"), and
// the shapes are simplified with mapshaper, which keeps shared borders shared, to about 2 MB (400 kB gzipped).
// The areas are by Esri Nederland, published by CBS: the map must credit both.
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const year = process.argv[2]
if (!/^\d{4}$/.test(year ?? "")) {
  console.error("usage: node scripts/build-pc4-areas.mjs <year>, e.g. 2024")
  process.exit(2)
}

const features = []
const seen = new Set()
let url = `https://api.pdok.nl/cbs/postcode4/ogc/v1/collections/postcode4/items?f=json&limit=1000&jaarcode=${year}`
while (url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`PDOK answered ${response.status} for ${url}`)
  const page = await response.json()
  for (const feature of page.features) {
    const postcode = String(feature.properties.postcode ?? "")
    if (!/^\d{4}$/.test(postcode) || seen.has(postcode) || !feature.geometry) continue
    seen.add(postcode)
    features.push({ type: "Feature", properties: { postcode }, geometry: feature.geometry })
  }
  url = page.links.find((link) => link.rel === "next")?.href
}
if (features.length < 4000) throw new Error(`Only ${features.length} PC4 areas for ${year}; is that year published?`)

const work = mkdtempSync(join(tmpdir(), "pc4-"))
try {
  writeFileSync(join(work, "pc4.geojson"), JSON.stringify({ type: "FeatureCollection", features }))
  // Windows runs npx through a shell; every argument here is fixed text without spaces, the input is read from cwd.
  execFileSync(
    "npx",
    [
      "-y",
      "mapshaper@0.7.84",
      "pc4.geojson",
      "-simplify",
      "6%",
      "keep-shapes",
      "-o",
      "precision=0.00001",
      "format=geojson",
      "out.geojson",
    ],
    { cwd: work, stdio: "inherit", shell: process.platform === "win32" },
  )
  // Copied, not renamed: the temp folder and the repository may be on different drives.
  copyFileSync(join(work, "out.geojson"), "public/nl-pc4.geojson")
  console.log(`public/nl-pc4.geojson: ${features.length} PC4 areas of ${year}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
