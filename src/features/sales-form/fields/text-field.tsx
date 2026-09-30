import type { ComponentProps, ReactNode } from "react"
import { Controller, type FieldPath } from "react-hook-form"
import type { FormInput } from "@shared/form-schema"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import type { SalesFormControl } from "../form-types"

type StringFieldName = {
  [K in FieldPath<FormInput>]: FormInput[K] extends string ? K : never
}[FieldPath<FormInput>]

type Props = {
  control: SalesFormControl
  name: StringFieldName
  label: string
  description?: ReactNode
  optional?: boolean
  /** Rendered inside the input on the right, e.g. a CheckIndicator. */
  addon?: ReactNode
} & Omit<ComponentProps<"input">, "name">

/** Labelled text input bound to a form field, with description and validation message. */
export function TextField({ control, name, label, description, optional, addon, readOnly, ...inputProps }: Props) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const inputAttributes = {
          ...inputProps,
          ...field,
          id: name,
          readOnly,
          tabIndex: readOnly ? -1 : undefined,
          "aria-invalid": fieldState.invalid,
        }
        return (
          <Field data-invalid={fieldState.invalid} data-field={name}>
            <FieldLabel htmlFor={name}>
              {label}
              {optional && <span className="font-normal text-muted-foreground">(optioneel)</span>}
            </FieldLabel>
            {addon ? (
              <InputGroup className={readOnly ? "bg-muted" : undefined}>
                <InputGroupInput {...inputAttributes} />
                <InputGroupAddon align="inline-end">{addon}</InputGroupAddon>
              </InputGroup>
            ) : (
              <Input {...inputAttributes} className={readOnly ? "bg-muted text-muted-foreground" : undefined} />
            )}
            {description && !fieldState.error && <FieldDescription>{description}</FieldDescription>}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )
      }}
    />
  )
}
