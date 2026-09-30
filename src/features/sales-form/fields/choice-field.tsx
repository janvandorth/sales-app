import { Controller } from "react-hook-form"
import { Field, FieldContent, FieldError, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { SalesFormControl } from "../form-types"

type Props = {
  control: SalesFormControl
  name: "geslacht" | "contractType" | "betaalperiode"
  label: string
  options: readonly string[]
  columns?: 1 | 2
}

/** Radio group rendered as large tappable cards, bound to a form field. */
export function ChoiceField({ control, name, label, options, columns = 1 }: Props) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid} data-field={name}>
          <FieldLegend variant="label">{label}</FieldLegend>
          <RadioGroup
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
            aria-invalid={fieldState.invalid}
            className={columns === 2 ? "grid-cols-2" : undefined}
          >
            {options.map((option) => {
              const id = `${name}-${option}`
              return (
                <FieldLabel key={option} htmlFor={id}>
                  <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                    <RadioGroupItem value={option} id={id} aria-invalid={fieldState.invalid} />
                    <FieldContent>
                      <FieldTitle>{option}</FieldTitle>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              )
            })}
          </RadioGroup>
          <FieldError errors={[fieldState.error]} />
        </FieldSet>
      )}
    />
  )
}
