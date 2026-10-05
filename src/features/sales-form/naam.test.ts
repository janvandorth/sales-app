import { describe, expect, it } from "vitest"
import { hasInitials, normalizeNaam } from "./naam"

describe("normalizeNaam", () => {
  it.each([
    ["p.j. jansen", "P.J. Jansen"],
    ["p. j. jansen", "P.J. Jansen"],
    ["p.j.jansen", "P.J. Jansen"],
    ["  p.j.   jansen ", "P.J. Jansen"],
    ["th. van der berg", "Th. van der Berg"],
    ["chr. jansen", "Chr. Jansen"],
    ["ij. de boer", "IJ. de Boer"],
    ["j.-p. dupont", "J.-P. Dupont"],
    ["a. de vries-bakker", "A. de Vries-Bakker"],
    ["m. jansen-van der berg", "M. Jansen-van der Berg"],
    ["k. van 't hof", "K. van 't Hof"],
    ["a. 's-gravesande", "A. 's-Gravesande"],
    ["c. von und zu guttenberg", "C. von und zu Guttenberg"],
    ["j. dos santos", "J. dos Santos"],
    ["a. al-hassan", "A. al-Hassan"],
    ["s. o'brien", "S. O'Brien"],
    ["j. d'ancona", "J. D'Ancona"],
    ["d. dell'acqua", "D. Dell'Acqua"],
    ["r. mcdonald", "R. McDonald"],
    ["s. st. john", "S. St. John"],
    ["j. smith jr.", "J. Smith Jr."],
    ["j. özdemir", "J. Özdemir"],
    ["д. иванов", "Д. Иванов"],
    ["jansen", "Jansen"],
    ["p. van", "P. Van"],
  ])("normalizeNaam(%j) is %j", (input, expected) => {
    expect(normalizeNaam(input)).toBe(expected)
  })

  it.each(["A. Van Der Berg", "L. De Smet", "M. Di Maio", "A. Al-Hassan", "P.J. JANSEN", "R. MacDonald"])(
    "never removes capitals the agent typed: %s",
    (naam) => expect(normalizeNaam(naam)).toBe(naam),
  )
})

describe("hasInitials", () => {
  it.each(["P.J. Jansen", "Th. de Vries", "j. jansen"])("finds initials in %s", (naam) => {
    expect(hasInitials(naam)).toBe(true)
  })

  it.each(["Jansen", "Piet Jansen", ""])("finds no initials in %j", (naam) => {
    expect(hasInitials(naam)).toBe(false)
  })
})
