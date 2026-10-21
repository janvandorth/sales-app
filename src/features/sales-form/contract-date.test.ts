import { describe, expect, it } from "vitest"
import { addDays } from "../dashboard/periods"
import { isFutureContractDate, isOldContractDate, salesFormSchema } from "./contract-date"
import { createEmptyForm, today } from "./form-defaults"

describe("isOldContractDate", () => {
  it.each(["2026-10-21", "2026-10-14", "2026-10-25"])("accepts %s without asking", (datum) => {
    expect(isOldContractDate(datum, "2026-10-21")).toBe(false)
  })

  it.each(["2026-10-13", "2026-09-30", "2025-10-21"])("asks to confirm %s", (datum) => {
    expect(isOldContractDate(datum, "2026-10-21")).toBe(true)
  })

  it("counts back across a month end", () => {
    expect(isOldContractDate("2026-02-22", "2026-03-01")).toBe(false)
    expect(isOldContractDate("2026-02-21", "2026-03-01")).toBe(true)
  })
})

describe("isFutureContractDate", () => {
  it("allows today and earlier days", () => {
    expect(isFutureContractDate("2026-10-21", "2026-10-21")).toBe(false)
    expect(isFutureContractDate("2026-10-20", "2026-10-21")).toBe(false)
  })

  it("refuses tomorrow and later", () => {
    expect(isFutureContractDate("2026-10-22", "2026-10-21")).toBe(true)
    expect(isFutureContractDate("2027-01-01", "2026-10-21")).toBe(true)
  })
})

describe("salesFormSchema", () => {
  it("reports a future date on the datum field, also while other fields are empty", () => {
    const result = salesFormSchema.safeParse({ ...createEmptyForm(), datum: addDays(today(), 1) })
    expect(result.error?.issues.find((issue) => issue.path[0] === "datum")?.message).toBe(
      "De datum mag niet in de toekomst liggen",
    )
  })

  it("accepts today's date", () => {
    const result = salesFormSchema.safeParse({ ...createEmptyForm(), datum: today() })
    expect(result.error?.issues.some((issue) => issue.path[0] === "datum")).toBe(false)
  })
})
