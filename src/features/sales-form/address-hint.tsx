import { PencilIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldDescription } from "@/components/ui/field"
import type { useAddressLookup } from "./use-address-lookup"

/** Explains below the address fields where straat and plaats come from, and offers manual editing. */
export function AddressHint({ lookup }: { lookup: ReturnType<typeof useAddressLookup> }) {
  const { check, editable, manual, enableManual } = lookup

  if (manual) return <FieldDescription>Adres wordt handmatig ingevuld.</FieldDescription>
  if (check.status === "done" && !check.data.found) {
    return (
      <FieldDescription className="text-destructive">
        Adres niet gevonden — vul straat en plaats handmatig in.
      </FieldDescription>
    )
  }
  if (check.status === "error") {
    return <FieldDescription>Adrescontrole mislukt — vul straat en plaats handmatig in.</FieldDescription>
  }
  if (check.status === "offline") {
    return <FieldDescription>Offline — vul straat en plaats handmatig in.</FieldDescription>
  }
  if (editable) return null
  return (
    <div className="flex items-center justify-between gap-2">
      <FieldDescription>
        Straat en plaats worden automatisch ingevuld gebaseerd op postcode en huisnummer.
      </FieldDescription>
      <Button type="button" variant="ghost" size="sm" onClick={enableManual}>
        <PencilIcon /> Aanpassen
      </Button>
    </div>
  )
}
