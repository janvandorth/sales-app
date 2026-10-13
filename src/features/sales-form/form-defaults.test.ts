import { describe, expect, it } from "vitest"
import { createEmptyForm, isEmptyForm } from "./form-defaults"

describe("isEmptyForm", () => {
  it("treats a new form as empty, also with an old date and start time", () => {
    expect(isEmptyForm(createEmptyForm())).toBe(true)
    expect(isEmptyForm({ ...createEmptyForm(), datum: "2026-01-01", started: "2026-01-01T08:00:00.000Z" })).toBe(true)
  })

  it.each([
    { klantnummer: "100234" },
    { geslacht: "Vrouw" as const },
    { landcode: "+32" },
    { perPost: true },
    { iban: "NL" },
    { ibanTnvZelfde: false },
    { telefoon2: "6" },
  ])("treats a form with %o filled in as started", (change) => {
    expect(isEmptyForm({ ...createEmptyForm(), ...change })).toBe(false)
  })

  it("treats a draft saved before a field existed as empty when nothing was filled in", () => {
    const { telefoon2: _t, ibanTnv: _i, ...older } = createEmptyForm()
    expect(isEmptyForm(older as ReturnType<typeof createEmptyForm>)).toBe(true)
  })
})
