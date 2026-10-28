import { describe, expect, it } from "vitest"
import { LEVELS } from "@shared/sales-map-view"
import { age, STRENGTH_RANGE, strength } from "./scale"

describe("age", () => {
  it.each([
    ["2026-10-27", 0], // today
    ["2026-10-18", 0.1], // 9 of 90 days
    ["2026-07-29", 1], // the first day of the period
    ["2026-01-01", 1], // before it: as grey as the start
    ["2026-10-28", 0], // a sale dated tomorrow by mistake
  ])("a newest sale on %s in 90 days until 27 October is %s", (lastSoldOn, expected) => {
    expect(age(lastSoldOn, "2026-10-27", 90)).toBeCloseTo(expected, 5)
  })
})

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
