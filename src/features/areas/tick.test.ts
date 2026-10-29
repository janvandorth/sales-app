import { describe, expect, it } from "vitest"
import type { Door, DoorVisit } from "./doors"
import { between, codeStatuses, countLabel, groupDoors, parseTick, tickLabel, ticks, visitsSince } from "./tick"

const door = (huisnummer: number, postcode = "3561AB", straat = "Zonnebloemstraat", toevoeging = ""): Door => ({
  postcode,
  huisnummer,
  toevoeging,
  straat,
  plaats: "Utrecht",
})

describe("typing a tick", () => {
  it("reads a postcode of any level", () => {
    expect(parseTick("3561")).toEqual({ code: "3561" })
    expect(parseTick("3561a")).toEqual({ code: "3561A" })
    expect(parseTick("3561 AB")).toEqual({ code: "3561AB" })
  })

  it("reads a range and a side as a werver would text them", () => {
    expect(parseTick("3561AB 26-50 even")).toEqual({ code: "3561AB", from: 26, to: 50, side: "even" })
    expect(parseTick("3561ab 1 t/m 45 oneven")).toEqual({ code: "3561AB", from: 1, to: 45, side: "odd" })
    expect(parseTick("3561AB 50–26 ev")).toEqual({ code: "3561AB", from: 26, to: 50, side: "even" })
    expect(parseTick("3561AB 12")).toEqual({ code: "3561AB", from: 12, to: 12 })
    expect(parseTick("3561AB on")).toEqual({ code: "3561AB", side: "odd" })
  })

  it("takes house numbers only in a PC6", () => {
    expect(parseTick("3561 2-40")).toBeNull()
    expect(parseTick("3561 even")).toBeNull()
    expect(parseTick("356")).toBeNull()
    expect(parseTick("Zonnebloemstraat")).toBeNull()
  })
})

describe("what a tick covers", () => {
  it("covers the doors of its postcode, range and side", () => {
    const tick = { code: "3561AB", from: 26, to: 50, side: "even" as const }
    expect(ticks(tick, door(26))).toBe(true)
    expect(ticks(tick, door(50, "3561AB", "x", "A"))).toBe(true)
    expect(ticks(tick, door(27))).toBe(false)
    expect(ticks(tick, door(52))).toBe(false)
    expect(ticks(tick, door(30, "3561AC"))).toBe(false)
    expect(ticks({ code: "3561" }, door(3, "3561XY"))).toBe(true)
  })

  it("reads back as the street with its numbers", () => {
    const doors = [door(26)]
    expect(tickLabel({ code: "3561AB", from: 26, to: 50, side: "even" }, doors)).toBe("Zonnebloemstraat 26–50 even")
    expect(tickLabel({ code: "3561AB", from: 7, to: 7 }, doors)).toBe("Zonnebloemstraat 7")
    expect(tickLabel({ code: "3561A" }, doors)).toBe("3561A")
  })
})

describe("what is done", () => {
  const visit = (d: Door, visitedAt: string): DoorVisit => ({
    ...d,
    id: visitedAt,
    outcome: "walked",
    visitedAt,
    wervernr: "0212BB",
  })

  it("counts visits since the area started only", () => {
    const byDoor = visitsSince(
      [visit(door(1), "2026-10-27T10:00:00Z"), visit(door(3), "2026-10-29T10:00:00Z")],
      "2026-10-28",
    )
    expect([...byDoor.keys()]).toEqual(["3561AB:3:"])
  })

  it("groups doors by PC5 and PC6 with their numbers and progress", () => {
    const doors = [door(3), door(1), door(2, "3561AC", "Anjerstraat"), door(1, "3561BA", "Lijsterlaan")]
    const done = (d: Door) => d.postcode === "3561AB"
    const groups = groupDoors(doors, done)
    expect(groups.map((g) => [g.code, g.done, g.doors.length])).toEqual([
      ["3561A", 2, 3],
      ["3561B", 0, 1],
    ])
    expect(groups[0].rows.map((r) => [r.code, r.streets, r.range, r.done])).toEqual([
      ["3561AB", "Zonnebloemstraat", "1–3", 2],
      ["3561AC", "Anjerstraat", "2", 0],
    ])
  })

  it("shows a fraction only for what is partly done", () => {
    expect(countLabel(0, 24)).toBe("24")
    expect(countLabel(9, 43)).toBe("9/43")
    expect(countLabel(12, 12)).toBe("12")
  })

  it("knows per code of every level whether it is done", () => {
    const doors = [door(1), door(2), door(1, "3561AC")]
    const statuses = codeStatuses(doors, (d) => d.postcode === "3561AB")
    expect(statuses.get("3561AB")).toBe("done")
    expect(statuses.get("3561A")).toBe("part")
    expect(statuses.get("3561")).toBe("part")
    expect(statuses.has("3561AC")).toBe(false)
  })

  it("takes the doors between two taps on a side, in either order", () => {
    const side = [door(2), door(4), door(6), door(8)]
    expect(between(side, "3561AB:6:", "3561AB:2:").map((d) => d.huisnummer)).toEqual([2, 4, 6])
  })
})
