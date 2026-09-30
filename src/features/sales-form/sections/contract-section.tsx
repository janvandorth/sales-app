import type { ReactNode } from "react"
import { Controller } from "react-hook-form"
import { BETAALPERIODE_OPTIONS, CONTRACT_TYPE_OPTIONS } from "@shared/form-schema"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { CheckState } from "@/hooks/use-debounced-check"
import type { IbanResult } from "@/lib/api"
import { BankSuggestions } from "../bank-suggestions"
import { CheckIndicator } from "../check-indicator"
import { ChoiceField } from "../fields/choice-field"
import { TextField } from "../fields/text-field"
import type { SalesFormApi } from "../form-types"
import type { useIbanCheck } from "../use-iban-check"
import { FormSection } from "./form-section"

type Props = { form: SalesFormApi; iban: ReturnType<typeof useIbanCheck> }

export function ContractSection({ form, iban }: Props) {
  const { control, setValue } = form

  return (
    <FormSection title="Contract">
      <TextField
        control={control}
        name="iban"
        label="IBAN"
        placeholder="NL00 BANK 0123 4567 89"
        autoCapitalize="characters"
        autoComplete="off"
        addon={<CheckIndicator state={iban.check} isValid={(result) => result.valid} />}
        description={describeIbanCheck(iban.check)}
      />
      <BankSuggestions
        iban={iban.normalized}
        onPick={(code) => setValue("iban", `${iban.normalized.slice(0, 4)} ${code} `, { shouldDirty: true })}
      />
      <ChoiceField
        control={control}
        name="contractType"
        label="Contracttype"
        options={CONTRACT_TYPE_OPTIONS}
        columns={2}
      />
      <ChoiceField control={control} name="betaalperiode" label="Betaaltermijn" options={BETAALPERIODE_OPTIONS} />
      <Controller
        control={control}
        name="opmerkingen"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} data-field="opmerkingen">
            <FieldLabel htmlFor="opmerkingen">
              Opmerkingen <span className="font-normal text-muted-foreground">(optioneel)</span>
            </FieldLabel>
            <Textarea id="opmerkingen" rows={3} {...field} aria-invalid={fieldState.invalid} />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </FormSection>
  )
}

function describeIbanCheck(state: CheckState<IbanResult>): ReactNode {
  if (state.status === "done") {
    if (!state.data.valid)
      return <span className="text-amber-600">IBAN ongeldig — je kunt het formulier wel versturen</span>
    return state.data.bank ? `IBAN geldig · ${state.data.bank}` : "IBAN geldig"
  }
  if (state.status === "offline") return "Offline — IBAN wordt gecontroleerd bij versturen"
  if (state.status === "error") return "IBAN-controle mislukt, probeer later opnieuw"
  return undefined
}
