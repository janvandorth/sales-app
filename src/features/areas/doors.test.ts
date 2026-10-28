import { describe, expect, it } from "vitest"
import {
  byDistance,
  doorLabel,
  firstOpen,
  latestVisits,
  nearestDoor,
  sides,
  streetsOf,
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

describe("the door where the phone is", () => {
  it("finds the nearest address and its side", () => {
    const doors = [
      { ...door(69), at: [4.8801, 52.3701] as [number, number] },
      { ...door(71), at: [4.8805, 52.3703] as [number, number] },
      { ...door(72), at: [4.8812, 52.3709] as [number, number] },
    ]
    expect(nearestDoor(doors, [4.8806, 52.3703])).toMatchObject({ door: { huisnummer: 71 }, side: "odd" })
    expect(nearestDoor(doors, [4.8813, 52.371])).toMatchObject({ door: { huisnummer: 72 }, side: "even" })
  })

  it("finds nothing without locations", () => {
    expect(nearestDoor([door(2)], [4.88, 52.37])).toBeNull()
  })
})
