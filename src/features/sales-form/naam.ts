// Name particles that may be written in lowercase: Dutch tussenvoegsels plus common ones from other languages.
// prettier-ignore
const NAME_PARTICLES = [
  "van", "de", "der", "den", "het", "ten", "ter", "te", "in", "'t", "op", "vande", "vander", // Dutch, Flemish
  "von", "vom", "zu", "zur", "und", // German
  "la", "le", "du", "des", // French
  "da", "di", "del", "della", "dei", "degli", "dos", "das", "do", "y", "e", // Italian, Spanish, Portuguese
  "el", "al", "bin", "ibn", "bint", "ben", "abu", // Arabic
  "af", "av", "mac", // Scandinavian, Gaelic
]

// Prefixes after which the next letter is a capital too: O'Brien, D'Ancona, Dell'Acqua, L'Estrange.
const APOSTROPHE_PREFIXES = ["o", "d", "dell", "dall", "l"]

// "St." looks like an initial but starts a surname, as in "St. John".
const NOT_INITIALS = ["st", "ste"]

const INITIAL = /^(\p{L}{1,3})\.(-?)\s*/u

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

function fixInitial(letters: string) {
  return letters.toLowerCase() === "ij" ? "IJ" : capitalize(letters)
}

function fixSurnameWord(word: string) {
  return capitalize(word)
    .replace(/^(Mc)(\p{Ll})(?=\p{L})/u, (_, mc: string, letter: string) => mc + letter.toUpperCase())
    .replace(/^(\p{L}{1,4})(['’])(\p{Ll})/u, (match, prefix: string, apostrophe: string, letter: string) =>
      APOSTROPHE_PREFIXES.includes(prefix.toLowerCase()) ? prefix + apostrophe + letter.toUpperCase() : match,
    )
}

/**
 * Adds missing capitals so sales agents can type a name in lowercase: "p.j. van der berg" becomes
 * "P.J. van der Berg". Initials and surname parts get a capital; particles (van, de, di, al, dos, …) are left as
 * typed, because their capitalization differs per name and country ("de Vries" but Flemish "De Smet", "Di Maio").
 * Letters are only ever capitalized, never lowercased. This is a suggestion: no rule fits every name, so the agent
 * can always undo it.
 */
export function normalizeNaam(value: string): string {
  let rest = value.trim().replace(/\s+/g, " ")
  let initials = ""
  for (let match = INITIAL.exec(rest); match; match = INITIAL.exec(rest)) {
    const [whole, letters, hyphen] = match
    if (NOT_INITIALS.includes(letters.toLowerCase())) break
    initials += `${fixInitial(letters)}.${hyphen}`
    rest = rest.slice(whole.length)
  }

  const words = rest.split(/([\s-])/)
  const lastWord = words.length - 1
  const surname = words
    .map((word, i) => {
      if (i % 2 === 1) return word // separator
      return i < lastWord && NAME_PARTICLES.includes(word.toLowerCase()) ? word : fixSurnameWord(word)
    })
    .join("")

  return [initials, surname].filter(Boolean).join(" ")
}

/** An automatic capitalization fix the agent can undo: what was typed (or scanned) and what it became. */
export type NaamCorrection = { typed: string; corrected: string }

/** Whether the name starts with initials, like "P.J. Jansen". */
export function hasInitials(value: string): boolean {
  return /^\p{L}{1,3}\./u.test(value.trim())
}
