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

  it("sums PC6 postcodes into PC4 with the newest sale, the main city and who sold there", () => {
    expect(areas.get("3811")).toEqual({
      postcode: "3811",
      city: "Amersfoort",
      sold: 6,
      lastSoldOn: "2026-10-20",
      recruiters: [
        { recruiter: "0212BB", sold: 3 },
        { recruiter: "0618BB", sold: 3 },
      ],
    })
  })

  it("gives one area per PC4", () => {
    expect([...areas.keys()]).toEqual(["3811", "3812"])
    expect(areas.get("3812")?.recruiters).toEqual([{ recruiter: "1210AP", sold: 4 }])
  })

  it("gives no areas for no sales", () => {
    expect(aggregate([]).size).toBe(0)
  })
})
