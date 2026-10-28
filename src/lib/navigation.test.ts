import { describe, expect, it } from "vitest"
import type { AreaAssignment } from "@/features/areas/areas"
import { pageFromUrl, urlOf } from "./navigation"

const area = { id: "a1" } as AreaAssignment
const douglas = { wervernr: "2603AP", name: "douglas" }

describe("page addresses", () => {
  it("gives every page its own path", () => {
    expect(urlOf({ view: "form" })).toBe("/")
    expect(urlOf({ view: "planning" })).toBe("/werkgebieden")
    expect(urlOf({ view: "map", map: {} })).toBe("/kaart")
  })

  it("puts what an address can hold in its query", () => {
    expect(urlOf({ view: "areas", viewedAs: douglas })).toBe("/gebieden?werver=2603AP")
    expect(urlOf({ view: "map", map: { focus: area } })).toBe("/kaart?gebied=a1")
    expect(urlOf({ view: "map", map: { assign: {} } })).toBe("/kaart?toewijzen")
    expect(urlOf({ view: "walk", walking: area, viewedAs: douglas })).toBe("/lopen?werver=2603AP&gebied=a1")
  })

  it("opens the page of an address after a reload", () => {
    expect(pageFromUrl("/werkgebieden", "")).toEqual({ view: "planning", viewedAs: undefined })
    expect(pageFromUrl("/gebieden/", "?werver=2603AP")).toEqual({
      view: "areas",
      viewedAs: { wervernr: "2603AP", name: "2603AP" },
    })
    expect(pageFromUrl("/onbekend", "")).toEqual({ view: "form", viewedAs: undefined })
  })

  it("opens one step up when the address cannot hold what the page needs", () => {
    expect(pageFromUrl("/lopen", "?gebied=a1")).toEqual({ view: "areas", viewedAs: undefined })
    expect(pageFromUrl("/kaart", "?gebied=a1")).toEqual({ view: "map", map: {} })
  })
})
