import type { ReactNode } from "react"
import { Controller, useFormState } from "react-hook-form"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { SalesFormControl } from "../form-types"
import { CountryCodePicker } from "./country-code-picker"

const NAMES = {
  first: { landcode: "landcode", telefoon: "telefoon", label: "Telefoonnummer" },
  second: { landcode: "landcode2", telefoon: "telefoon2", label: "Tweede telefoonnummer" },
} as const

type Props = {
  control: SalesFormControl
  which?: keyof typeof NAMES
  /** Rendered next to the number, e.g. a remove button. */
  action?: ReactNode
}

/** Country code picker plus the number without leading 0; stored as separate fields, combined on the server. */
export function PhoneField({ control, which = "first", action }: Props) {
  const { landcode, telefoon, label } = NAMES[which]
  const { errors } = useFormState({ control, name: telefoon })
  const error = errors[telefoon]

  return (
    <Field data-field={telefoon} data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={telefoon}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Controller
          control={control}
          name={landcode}
          render={({ field, fieldState }) => (
            <div data-field={landcode} className="rounded-md">
              <CountryCodePicker
                id={landcode}
                value={field.value}
                onChange={field.onChange}
                invalid={fieldState.invalid}
              />
            </div>
          )}
        />
        <Controller
          control={control}
          name={telefoon}
          render={({ field, fieldState }) => (
            <Input
              id={telefoon}
              type="tel"
              inputMode="numeric"
              placeholder="612345678"
              {...field}
              onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ""))}
              aria-invalid={fieldState.invalid}
            />
          )}
        />
        {action}
      </div>
      {error ? (
        <FieldError errors={[error]} />
      ) : (
        <FieldDescription>Zonder 0 of landcode, alleen cijfers</FieldDescription>
      )}
    </Field>
  )
}
