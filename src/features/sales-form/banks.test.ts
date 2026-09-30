import { describe, expect, it } from "vitest"
import { DUTCH_BANKS, suggestBanks } from "./banks"

const codes = (iban: string) => suggestBanks(iban).map((bank) => bank.code)

describe("suggestBanks", () => {
  it("offers nothing before the country code and check digits are typed", () => {
    expect(codes("NL")).toEqual([])
    expect(codes("NL9")).toEqual([])
  })

  it("offers every Dutch bank right after the check digits", () => {
    expect(codes("NL62")).toHaveLength(DUTCH_BANKS.length)
    expect(codes("NL62")).toContain("BUNQ")
  })

  it("narrows down while the bank code is typed", () => {
    expect(codes("NL62B")).toEqual(["BUNQ", "BITS", "BNGH"])
    expect(codes("NL62BU")).toEqual(["BUNQ"])
  })

  it("stops once the bank code is complete, and ignores other countries", () => {
    expect(codes("NL62BUNQ")).toEqual([])
    expect(codes("BE68")).toEqual([])
  })
})
