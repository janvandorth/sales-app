import { GESLACHT_OPTIONS } from "@shared/form-schema"
import { ChoiceField } from "../fields/choice-field"
import { TextField } from "../fields/text-field"
import type { SalesFormControl } from "../form-types"
import { FormSection } from "./form-section"

export function CustomerSection({ control }: { control: SalesFormControl }) {
  return (
    <FormSection title="Klant">
      <TextField control={control} name="datum" label="Datum" type="date" />
      <TextField control={control} name="klantnummer" label="Klantnummer" inputMode="numeric" />
      <ChoiceField control={control} name="geslacht" label="Geslacht" options={GESLACHT_OPTIONS} columns={2} />
      <TextField
        control={control}
        name="naam"
        label="Voorletter(s) + naam"
        placeholder="P.J. Jansen"
        description="Voorletters met punten, gevolgd door de achternaam"
        autoCapitalize="words"
      />
    </FormSection>
  )
}
