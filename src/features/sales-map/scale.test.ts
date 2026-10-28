import { describe, expect, it } from "vitest"
import { LEVELS } from "@shared/sales-map-view"
import { fillColor, fillOpacity, KANSEN_COLORS, KANSEN_OPACITY, SALES_OPACITY } from "./scale"

describe("shades", () => {
  it("has a colour and an opacity for every level", () => {
    expect([KANSEN_COLORS, KANSEN_OPACITY, SALES_OPACITY].map((list) => list.length)).toEqual([LEVELS, LEVELS, LEVELS])
  })

  it("gets darker with every level", () => {
    for (const list of [KANSEN_OPACITY, SALES_OPACITY]) {
      expect([...list].sort((a, b) => a - b)).toEqual(list)
    }
  })

  it("draws kansen by level and the sales map by age", () => {
    const level = ["get", "level"] as never
    const age = ["get", "age"] as never
    expect(fillColor("kansen", level, age)[0]).toBe("match")
    expect(fillColor("sales", level, age)[0]).toBe("interpolate")
    expect(fillOpacity("kansen", level)).toContain(KANSEN_OPACITY[4])
  })
})
