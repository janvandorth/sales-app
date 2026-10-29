import { describe, expect, it } from "vitest"
import { areaOutline, type Piece } from "./area-outline"

/** A square from (x, y), `size` wide. */
const square = (postcode: string, x: number, y: number, size = 1): Piece => ({
  postcode,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ],
    ],
  },
})

describe("the outline of an area", () => {
  it("merges the postcodes in one PC4 into one shape", () => {
    const outline = areaOutline([square("3561AB", 0, 0), square("3561AC", 1, 0)], 4)
    expect(outline.features).toHaveLength(1)
    expect(outline.features[0].properties.code).toBe("3561")
    // Two squares side by side make one polygon of one ring.
    expect(outline.features[0].geometry.coordinates).toHaveLength(1)
    expect(outline.features[0].geometry.coordinates[0]).toHaveLength(1)
  })

  it("keeps one shape per code of the level picked", () => {
    const outline = areaOutline([square("3561AB", 0, 0), square("3561BA", 1, 0), square("3562AA", 5, 5)], 5)
    expect(outline.features.map((f) => f.properties.code).sort()).toEqual(["3561A", "3561B", "3562A"])
  })

  it("joins a postcode cut into overlapping pieces by tile edges", () => {
    const outline = areaOutline([square("3561AB", 0, 0, 1.1), square("3561AB", 1, 0)], 6)
    expect(outline.features).toHaveLength(1)
    expect(outline.features[0].geometry.coordinates).toHaveLength(1)
  })
})
