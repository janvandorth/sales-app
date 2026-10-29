import { describe, expect, it } from "vitest"
import { codeAt, coveredBy, finerThan, pickLevel } from "./map-overlay"

describe("picking at a larger level", () => {
  it("picks the larger area chosen while zoomed in further", () => {
    expect(pickLevel("pc6", "pc5")).toBe("pc5")
    expect(pickLevel("pc6", "pc4")).toBe("pc4")
    expect(pickLevel("pc5", "pc4")).toBe("pc4")
  })

  it("never picks smaller than the map shows", () => {
    expect(pickLevel("pc4", "pc5")).toBe("pc4")
    expect(pickLevel("pc5", "pc5")).toBe("pc5")
    expect(pickLevel("pc6", "pc6")).toBe("pc6")
  })

  it("knows which levels are smaller than the map shows", () => {
    expect(finerThan("pc6", "pc5")).toBe(true)
    expect(finerThan("pc5", "pc5")).toBe(false)
    expect(finerThan("pc4", "pc6")).toBe(false)
  })

  it("finds the code of the area around a street", () => {
    expect(codeAt("3561AC", "pc5")).toBe("3561A")
    expect(codeAt("3561AC", "pc4")).toBe("3561")
    expect(codeAt("3561AC", "pc6")).toBe("3561AC")
  })
})

describe("overlay filters", () => {
  it("matches each code on the start of the postcode", () => {
    expect(coveredBy(["3561", "3562A", "3563BC"])).toEqual([
      "any",
      ["in", ["slice", ["get", "postcode"], 0, 4], ["literal", ["3561"]]],
      ["in", ["slice", ["get", "postcode"], 0, 5], ["literal", ["3562A"]]],
      ["in", ["get", "postcode"], ["literal", ["3563BC"]]],
    ])
  })
})
