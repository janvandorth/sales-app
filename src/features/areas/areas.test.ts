import { describe, expect, it } from "vitest"
import {
  codesLabel,
  isoWeek,
  partlyPicked,
  periodPresets,
  periodsFor,
  pickArea,
  placeLabel,
  spanLabel,
  summarize,
  toggleCode,
  tooBig,
  unionBounds,
  type PickedArea,
} from "./areas"

const area = (code: string, more: Partial<PickedArea> = {}): PickedArea => ({
  code,
  bounds: [5, 52, 5.1, 52.1],
  ...more,
})

describe("picking areas", () => {
  it("adds an area and drops it on a second tap", () => {
    expect(toggleCode([], "3561AC")).toEqual(["3561AC"])
    expect(toggleCode(["3561AC"], "3561AC")).toEqual([])
  })

  it("folds picked streets into a larger area tapped around them", () => {
    expect(toggleCode(["3561AC", "3561AD", "3562BA"], "3561A")).toEqual(["3562BA", "3561A"])
    expect(toggleCode(["3561A", "3561BC"], "3561")).toEqual(["3561"])
  })

  it("drops the larger picked area when a street inside it is tapped", () => {
    expect(toggleCode(["3561A", "3562"], "3561AC")).toEqual(["3562"])
  })

  it("keeps what was known of the areas that stay", () => {
    const before = [area("3561AC", { open: 12 }), area("3562BA", { open: 3 })]
    expect(pickArea(before, area("3561AD", { open: 7 })).map((p) => [p.code, p.open])).toEqual([
      ["3561AC", 12],
      ["3562BA", 3],
      ["3561AD", 7],
    ])
  })

  it("marks the larger areas that hold only part of the selection", () => {
    expect(partlyPicked(["3561AC", "3561B"]).sort()).toEqual(["3561", "3561A"])
    expect(partlyPicked(["3561", "3561AC"])).toEqual([])
  })
})

describe("the selection's numbers", () => {
  it("sums what is known and takes the newest sale", () => {
    const summary = summarize([
      area("3561AC", { households: 40, open: 12, lastSold: "2026-09-01" }),
      area("3561AD", { households: 20, open: 3, lastSold: "2026-10-12" }),
      area("3561AE", { lastSold: null }),
    ])
    expect(summary).toEqual({ households: 60, open: 15, lastSold: "2026-10-12" })
  })

  it("says when nothing is known, and when nothing was sold in a year", () => {
    expect(summarize([area("3561AC")])).toEqual({ households: null, open: null, lastSold: undefined })
    expect(summarize([area("3561AC", { lastSold: null })]).lastSold).toBeNull()
  })
})

describe("periods", () => {
  it("offers today, tomorrow, the rest of this week and next week (Monday to Saturday)", () => {
    // Wednesday 28 October 2026.
    expect(periodPresets("2026-10-28").map((p) => [p.key, p.startsOn, p.endsOn])).toEqual([
      ["today", "2026-10-28", "2026-10-28"],
      ["tomorrow", "2026-10-29", "2026-10-29"],
      ["week", "2026-10-28", "2026-10-31"],
      ["next", "2026-11-02", "2026-11-07"],
    ])
  })

  it("makes this week the coming one on a Sunday", () => {
    expect(periodPresets("2026-11-01")[2]).toMatchObject({ startsOn: "2026-11-01", endsOn: "2026-11-07" })
  })

  it("puts days from the planning first unless they are a preset", () => {
    expect(periodsFor("2026-10-28", { startsOn: "2026-10-30", endsOn: "2026-10-30" })[0]).toMatchObject({
      key: "given",
      label: "vr 30 okt",
    })
    expect(periodsFor("2026-10-28", { startsOn: "2026-10-28", endsOn: "2026-10-28" })[0].key).toBe("today")
  })

  it("labels a span of days", () => {
    expect(spanLabel("2026-10-26", "2026-10-28")).toBe("ma 26 – wo 28 okt")
    expect(spanLabel("2026-10-30", "2026-11-02")).toBe("vr 30 okt – ma 2 nov")
    expect(spanLabel("2026-10-26", "2026-10-28", true)).toBe("ma–wo")
  })

  it("numbers weeks the ISO way", () => {
    expect(isoWeek("2026-10-28")).toBe(44)
    expect(isoWeek("2027-01-01")).toBe(53)
  })
})

describe("names and sizes", () => {
  it("names areas by their codes, the larger areas first", () => {
    expect(codesLabel(["3561AC", "3561A", "3561BD"])).toBe("3561A + 2 straten")
    expect(codesLabel(["3561AC"])).toBe("3561AC")
    expect(codesLabel(["3561AC", "3561AD", "3561AE"])).toBe("3 straten")
  })

  it("names a place by neighbourhood and town", () => {
    expect(placeLabel("Wijk 03 Overvecht", "Utrecht")).toBe("Overvecht, Utrecht")
    expect(placeLabel("Utrecht", "Utrecht")).toBe("Utrecht")
    expect(placeLabel(undefined, "Zeist")).toBe("Zeist")
  })

  it("warns when an area has more addresses than the days allow", () => {
    expect(tooBig({ households: 400, startsOn: "2026-10-28", endsOn: "2026-10-29" })).toBe(2)
    expect(tooBig({ households: 150, startsOn: "2026-10-28", endsOn: "2026-10-29" })).toBeNull()
    expect(tooBig({ households: null, startsOn: "2026-10-28", endsOn: "2026-10-28" })).toBeNull()
  })

  it("boxes several areas together", () => {
    expect(
      unionBounds([
        [5, 52, 5.1, 52.1],
        [4.9, 52.05, 5.05, 52.2],
      ]),
    ).toEqual([4.9, 52, 5.1, 52.2])
    expect(unionBounds([])).toBeNull()
  })
})
