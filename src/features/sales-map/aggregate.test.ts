import { describe, expect, it } from "vitest"
import { aggregate } from "./aggregate"

const area = (
  postcode: string,
  sold: number,
  lastSoldOn: string,
  recruiters: [string, number][],
  city = "Amersfoort",
) => ({ postcode, city, sold, lastSoldOn, recruiters: recruiters.map(([recruiter, n]) => ({ recruiter, sold: n })) })

describe("aggregate", () => {
  const areas = aggregate([
    area("3811AB", 2, "2026-10-01", [["0212BB", 2]]),
    area("3811AC", 3, "2026-10-20", [
      ["0212BB", 1],
      ["0618BB", 2],
    ]),
    area("3811BA", 1, "2026-09-15", [["0618BB", 1]], "Leusden"),
    area("3812AA", 4, "2026-10-05", [["1210AP", 4]]),
  ])

  it("keeps the PC6 areas as they are", () => {
    expect([...areas.pc6.keys()]).toEqual(["3811AB", "3811AC", "3811BA", "3812AA"])
    expect(areas.pc6.get("3811AC")?.recruiters).toEqual([
      { recruiter: "0618BB", sold: 2 },
      { recruiter: "0212BB", sold: 1 },
    ])
  })

  it("sums PC6 areas into PC5 by their first five characters", () => {
    expect(areas.pc5.get("3811A")).toEqual({
      postcode: "3811A",
      city: "Amersfoort",
      sold: 5,
      lastSoldOn: "2026-10-20",
      recruiters: [
        { recruiter: "0212BB", sold: 3 },
        { recruiter: "0618BB", sold: 2 },
      ],
    })
    expect(areas.pc5.get("3811B")?.sold).toBe(1)
  })

  it("sums PC6 areas into PC4, with the newest sale and the city most sales were at", () => {
    const pc4 = areas.pc4.get("3811")
    expect(pc4?.sold).toBe(6)
    expect(pc4?.lastSoldOn).toBe("2026-10-20")
    expect(pc4?.city).toBe("Amersfoort")
    expect([...areas.pc4.keys()]).toEqual(["3811", "3812"])
  })

  it("gives no areas for no sales", () => {
    expect(aggregate([]).pc4.size).toBe(0)
  })
})
