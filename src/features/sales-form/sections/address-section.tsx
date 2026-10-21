import { AddressHint } from "../address-hint"
import { CheckIndicator } from "../check-indicator"
import { TextField } from "../fields/text-field"
import type { SalesFormControl } from "../form-types"
import type { useAddressLookup } from "../use-address-lookup"
import { FormSection } from "./form-section"

type Props = { control: SalesFormControl; lookup: ReturnType<typeof useAddressLookup> }

export function AddressSection({ control, lookup }: Props) {
  return (
    <FormSection title="Adres">
      <TextField
        control={control}
        name="postcode"
        label="Postcode"
        placeholder="1234 AB"
        autoCapitalize="characters"
        addon={<CheckIndicator state={lookup.check} isValid={(result) => result.found} />}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField control={control} name="huisnummer" label="Huisnummer" inputMode="numeric" />
        <TextField control={control} name="toevoeging" label="Toevoeging" optional />
      </div>
      <TextField control={control} name="straat" label="Straat" readOnly={!lookup.editable} />
      <TextField control={control} name="plaats" label="Plaats" readOnly={!lookup.editable} />
      <AddressHint lookup={lookup} />
    </FormSection>
  )
}
