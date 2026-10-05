import { GESLACHT_OPTIONS } from "@shared/form-schema"
import { ChoiceField } from "../fields/choice-field"
import { NaamField } from "../fields/naam-field"
import { TextField } from "../fields/text-field"
import type { SalesFormControl } from "../form-types"
import type { NaamCorrection } from "../naam"
import { FormSection } from "./form-section"

type Props = { control: SalesFormControl; naamCorrection: NaamCorrection | null }

export function CustomerSection({ control, naamCorrection }: Props) {
  return (
    <FormSection title="Klant">
      <TextField control={control} name="datum" label="Datum" type="date" />
      <TextField control={control} name="klantnummer" label="Klantnummer" inputMode="numeric" />
      <ChoiceField control={control} name="geslacht" label="Geslacht" options={GESLACHT_OPTIONS} columns={2} />
      <NaamField control={control} scanned={naamCorrection} />
    </FormSection>
  )
}
