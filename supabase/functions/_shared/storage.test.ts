import { describe, expect, it } from "vitest"
import { isOwnScanPath } from "./storage"

const userId = "6f1c2d3e-4a5b-4c6d-8e7f-901234567890"

describe("isOwnScanPath", () => {
  it("accepts a scan the app uploaded to the user's own folder", () => {
    expect(isOwnScanPath(`${userId}/0b5a1a6e-8a2f-4f3c-9d7e-2d1f4c3b2a10.jpg`, userId)).toBe(true)
  })

  it("refuses another user's scan or a path that leaves the folder", () => {
    expect(isOwnScanPath(`other-user/0b5a1a6e-8a2f-4f3c-9d7e-2d1f4c3b2a10.jpg`, userId)).toBe(false)
    expect(isOwnScanPath(`${userId}/../other-user/0b5a1a6e-8a2f-4f3c-9d7e-2d1f4c3b2a10.jpg`, userId)).toBe(false)
    expect(isOwnScanPath(`${userId}/0b5a1a6e-8a2f-4f3c-9d7e-2d1f4c3b2a10.pdf`, userId)).toBe(false)
  })
})
