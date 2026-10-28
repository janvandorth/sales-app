import { describe, expect, it } from "vitest"
import {
  byDistance,
  doorLabel,
  firstOpen,
  latestVisits,
  sides,
  streetsOf,
  stripRange,
  toevoeging,
  type Door,
  type DoorVisit,
} from "./doors"

const door = (huisnummer: number, toevoeging = "", postcode = "3561AC"): Door => ({
  postcode,
  huisnummer,
  toevoeging,
  straat: "Lijsterlaan",
  plaats: "Utrecht",
})

const visit = (d: Door, visitedAt: string, outcome: DoorVisit["outcome"] = "not_home"): DoorVisit => ({
  ...d,
  id: visitedAt,
  outcome,
  visitedAt,
  wervernr: "0212BB",
})

describe("doors", () => {
  it("writes letter and addition the way the form takes them", () => {
    expect(toevoeging("A", undefined)).toBe("A")
    expect(toevoeging(undefined, "2")).toBe("-2")
    expect(toevoeging("A", "2")).toBe("A-2")
    expect(doorLabel(door(6, "A"))).toBe("6A")
  })

  it("splits a street into its sides in walking order", () => {
    const { even, odd } = sides([door(8), door(1), door(6, "B"), door(6), door(6, "A"), door(3)])
    expect(even.map(doorLabel)).toEqual(["6", "6A", "6B", "8"])
    expect(odd.map(doorLabel)).toEqual(["1", "3"])
  })

  it("keeps the newest visit per door", () => {
    const latest = latestVisits([
      visit(door(2), "2026-10-27T10:00:00Z", "later"),
      visit(door(2), "2026-10-28T10:00:00Z", "sold"),
      visit(door(4), "2026-10-28T09:00:00Z"),
    ])
    expect(latest.size).toBe(2)
    expect([...latest.values()].find((v) => v.huisnummer === 2)?.outcome).toBe("sold")
  })

  it("starts at the first door nobody has been to", () => {
    const list = [door(2), door(4), door(6)]
    expect(firstOpen(list, latestVisits([visit(door(2), "2026-10-28T10:00:00Z")]))).toBe(1)
    expect(firstOpen(list, latestVisits(list.map((d) => visit(d, "2026-10-28T10:00:00Z"))))).toBe(0)
  })

  it("keeps the current door in the middle of the strip where it can", () => {
    expect(stripRange(20, 0)).toEqual({ start: 0, end: 7 })
    expect(stripRange(20, 10)).toEqual({ start: 7, end: 14 })
    expect(stripRange(20, 19)).toEqual({ start: 13, end: 20 })
    expect(stripRange(4, 2)).toEqual({ start: 0, end: 4 })
  })
})

describe("streets", () => {
  const places = [
    { postcode: "3561AC", straat: "Lijsterlaan", plaats: "Utrecht", lon: 5.11, lat: 52.12 },
    { postcode: "3561AD", straat: "Lijsterlaan", plaats: "Utrecht", lon: 5.112, lat: 52.121 },
    { postcode: "3561AE", straat: "Merelstraat", plaats: "Utrecht", lon: 5.13, lat: 52.13 },
  ]

  it("groups postcodes into streets", () => {
    expect(streetsOf(places).map((s) => [s.name, s.postcodes])).toEqual([
      ["Lijsterlaan", ["3561AC", "3561AD"]],
      ["Merelstraat", ["3561AE"]],
    ])
  })

  it("puts the street nearest to the phone first", () => {
    expect(byDistance(streetsOf(places), [5.1301, 52.1301])[0].name).toBe("Merelstraat")
    expect(byDistance(streetsOf(places), [5.1121, 52.1209])[0].name).toBe("Lijsterlaan")
  })
})
