import { useWatch } from "react-hook-form"
import { GESLACHT_OPTIONS } from "@shared/form-schema"
import { isOldContractDate } from "../contract-date"
import { ChoiceField } from "../fields/choice-field"
import { NaamField } from "../fields/naam-field"
import { TextField } from "../fields/text-field"
import { today } from "../form-defaults"
import type { SalesFormControl } from "../form-types"
import type { NaamCorrection } from "../naam"
import { FormSection } from "./form-section"

type Props = { control: SalesFormControl; naamCorrection: NaamCorrection | null }

export function CustomerSection({ control, naamCorrection }: Props) {
  const datum = useWatch({ control, name: "datum" })

  return (
    <FormSection title="Klant">
      <TextField
        control={control}
        name="datum"
        label="Datum"
        type="date"
        max={today()}
        description={
          datum && isOldContractDate(datum) ? (
            <span className="text-amber-600">Meer dan een week geleden — klopt de datum?</span>
          ) : undefined
        }
      />
      <TextField control={control} name="klantnummer" label="Klantnummer" inputMode="numeric" />
      <ChoiceField control={control} name="geslacht" label="Geslacht" options={GESLACHT_OPTIONS} columns={2} />
      <NaamField control={control} scanned={naamCorrection} />
    </FormSection>
  )
}
