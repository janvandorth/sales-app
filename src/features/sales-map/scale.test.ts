import { describe, expect, it } from "vitest"
import { levelAt } from "./levels"
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

  it("runs from the lightest for one sale to the darkest for the busiest area", () => {
    expect(strength(1, 40)).toBe(low)
    expect(strength(40, 40)).toBeCloseTo(high, 5)
  })

  it("grows on a log scale, so half the busiest is well past halfway", () => {
    expect(strength(20, 40)).toBeGreaterThan((low + high) / 2)
  })

  it("draws a single sale at full strength when no area has more", () => {
    expect(strength(1, 1)).toBe(high)
  })
})

describe("levelAt", () => {
  it.each([
    [7, "pc4"],
    [10.9, "pc4"],
    [11, "pc5"],
    [12.5, "pc5"],
    [13, "pc6"],
    [17, "pc6"],
  ])("zoom %s shows %s", (zoom, level) => {
    expect(levelAt(zoom)).toBe(level)
  })
})
