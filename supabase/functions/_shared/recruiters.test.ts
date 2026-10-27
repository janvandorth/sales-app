import { describe, expect, it } from "vitest"
import { recruitersResponseSchema, toZmRecruiters } from "./recruiters"

describe("toZmRecruiters", () => {
  it("joins first name and surname, keeps the recruiter code and sorts by name", () => {
    const response = recruitersResponseSchema.parse({
      count: 3,
      recruiters: [
        { id: 2, number: "0300CC", initials: "Piet", name: "Pietersen", company: "Zeker en Mobiel" },
        { id: 1, number: " 0212BB ", initials: "Anna", name: "de Vries", company: "Zeker en Mobiel" },
        { id: 3, number: "", initials: "Zonder", name: "Code", company: "" },
      ],
    })
    expect(toZmRecruiters(response)).toEqual([
      { wervernaam: "Anna de Vries", wervernr: "0212BB", company: "Zeker en Mobiel" },
      { wervernaam: "Piet Pietersen", wervernr: "0300CC", company: "Zeker en Mobiel" },
    ])
  })
})
