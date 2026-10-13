import { describe, expect, it } from "vitest"
import { dayRange, dayTitle, localDate } from "./days"

describe("dayRange", () => {
  it("covers exactly one local day", () => {
    const { from, to } = dayRange("2026-10-13")
    expect(localDate(from)).toBe("2026-10-13")
    expect(new Date(to).getTime() - new Date(from).getTime()).toBeGreaterThanOrEqual(23 * 3600_000)
    expect(localDate(new Date(new Date(to).getTime() - 1).toISOString())).toBe("2026-10-13")
  })
})

describe("dayTitle", () => {
  it("names today and yesterday, otherwise the weekday", () => {
    expect(dayTitle("2026-10-13", "2026-10-13")).toBe("Vandaag")
    expect(dayTitle("2026-10-12", "2026-10-13")).toBe("Gisteren")
    expect(dayTitle("2026-10-10", "2026-10-13")).toBe("Zaterdag")
  })
})
