import { describe, expect, it } from "vitest"
import { kpiWindow } from "./periods"

describe("kpiWindow", () => {
  it("starts with the current month and the eleven before it, then goes back a year per page", () => {
    expect(kpiWindow(0, "2026-10-07")).toEqual({ from: "2025-11-01", to: "2026-10-07" })
    expect(kpiWindow(1, "2026-10-07")).toEqual({ from: "2024-11-01", to: "2025-10-31" })
    expect(kpiWindow(2, "2026-10-07")).toEqual({ from: "2023-11-01", to: "2024-10-31" })
  })
})
