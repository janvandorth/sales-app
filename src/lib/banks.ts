/** Bank codes (positions 5–8) used in Dutch IBANs, most common first. */
export const DUTCH_BANKS = [
  { code: "INGB", name: "ING" },
  { code: "RABO", name: "Rabobank" },
  { code: "ABNA", name: "ABN AMRO" },
  { code: "SNSB", name: "SNS" },
  { code: "ASNB", name: "ASN Bank" },
  { code: "RBRB", name: "RegioBank" },
  { code: "BUNQ", name: "bunq" },
  { code: "KNAB", name: "Knab" },
  { code: "TRIO", name: "Triodos" },
  { code: "REVO", name: "Revolut" },
  { code: "FVLB", name: "Van Lanschot" },
  { code: "NNBA", name: "Nationale-Nederlanden" },
  { code: "HAND", name: "Handelsbanken" },
  { code: "DEUT", name: "Deutsche Bank" },
  { code: "BITS", name: "Bitsafe" },
  { code: "NWAB", name: "NWB Bank" },
  { code: "BNGH", name: "BNG Bank" },
] as const

const PARTIAL_NL_IBAN = /^NL\d{2}([A-Z]{0,3})$/

/** Banks matching a partially typed Dutch IBAN such as "NL91" or "NL91AB"; empty when not applicable. */
export function suggestBanks(normalizedIban: string) {
  const match = PARTIAL_NL_IBAN.exec(normalizedIban)
  if (!match) return []
  const typed = match[1]
  return DUTCH_BANKS.filter((bank) => bank.code.startsWith(typed))
}
