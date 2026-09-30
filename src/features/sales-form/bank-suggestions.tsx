import { Button } from "@/components/ui/button"
import { suggestBanks } from "./banks"

/** While a Dutch IBAN is being typed, offers the bank codes that match what was typed so far. */
export function BankSuggestions({ iban, onPick }: { iban: string; onPick: (code: string) => void }) {
  const banks = suggestBanks(iban)
  if (banks.length === 0) return null
  return (
    <div className="-mt-3 flex flex-wrap gap-1.5" aria-label="Bankcode suggesties">
      {banks.map((bank) => (
        <Button
          key={bank.code}
          type="button"
          variant="outline"
          className="font-normal"
          aria-label={`${bank.code} (${bank.name})`}
          onClick={() => {
            onPick(bank.code)
            document.getElementById("iban")?.focus()
          }}
        >
          {bank.code}
        </Button>
      ))}
    </div>
  )
}
