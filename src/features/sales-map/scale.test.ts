import { describe, expect, it } from "vitest"
import { LEVELS } from "@shared/sales-map-view"
import { STRENGTH_RANGE, strength } from "./scale"

describe("strength", () => {
  const [low, high] = STRENGTH_RANGE

  it("runs from the lightest for level 1 to the darkest for the top level", () => {
    expect(strength(1)).toBe(low)
    expect(strength(LEVELS)).toBeCloseTo(high, 5)
  })

  it("spreads the levels in even steps", () => {
    expect(strength(3)).toBeCloseTo((low + high) / 2, 5)
  })
})
