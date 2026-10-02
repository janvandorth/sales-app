import { describe, expect, it } from "vitest"
import { formatDutchDate, formatDutchDateTime, toTitleCase } from "./format"

describe("toTitleCase", () => {
  it.each([
    ["AMSTERDAM", "Amsterdam"],
    ["DEN HAAG", "Den Haag"],
    ["'S-GRAVENHAGE", "'s-Gravenhage"],
    ["ALPHEN AAN DEN RIJN", "Alphen Aan Den Rijn"],
  ])("%s -> %s", (input, expected) => expect(toTitleCase(input)).toBe(expected))
})

describe("Dutch date formatting", () => {
  it("formats ISO dates as dd-mm-yyyy", () => expect(formatDutchDate("2026-09-30")).toBe("30-09-2026"))

  it("formats timestamps in Amsterdam time, also around daylight saving time", () => {
    expect(formatDutchDateTime(new Date("2026-09-30T08:05:03Z"))).toBe("30-09-2026 10:05") // CEST, UTC+2
    expect(formatDutchDateTime(new Date("2026-12-01T08:05:03Z"))).toBe("01-12-2026 09:05") // CET, UTC+1
  })
})
