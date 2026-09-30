import { Controller, useFormState } from "react-hook-form"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { SalesFormControl } from "../form-types"
import { CountryCodePicker } from "./country-code-picker"

/** Country code picker plus the number without leading 0; stored as separate fields, combined on the server. */
export function PhoneField({ control }: { control: SalesFormControl }) {
  const { errors } = useFormState({ control, name: "telefoon" })

  return (
    <Field data-field="telefoon" data-invalid={Boolean(errors.telefoon)}>
      <FieldLabel htmlFor="telefoon">Telefoonnummer</FieldLabel>
      <div className="flex gap-2">
        <Controller
          control={control}
          name="landcode"
          render={({ field, fieldState }) => (
            <div data-field="landcode" className="rounded-md">
              <CountryCodePicker
                id="landcode"
                value={field.value}
                onChange={field.onChange}
                invalid={fieldState.invalid}
              />
            </div>
          )}
        />
        <Controller
          control={control}
          name="telefoon"
          render={({ field, fieldState }) => (
            <Input
              id="telefoon"
              type="tel"
              inputMode="numeric"
              placeholder="612345678"
              {...field}
              onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ""))}
              aria-invalid={fieldState.invalid}
            />
          )}
        />
      </div>
      {errors.telefoon ? (
        <FieldError errors={[errors.telefoon]} />
      ) : (
        <FieldDescription>Zonder 0 of landcode, alleen cijfers</FieldDescription>
      )}
    </Field>
  )
}
