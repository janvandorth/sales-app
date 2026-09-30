import { Controller, useWatch } from "react-hook-form"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { PhoneField } from "../fields/phone-field"
import { TextField } from "../fields/text-field"
import type { SalesFormApi } from "../form-types"
import { FormSection } from "./form-section"

export function ContactSection({ form }: { form: SalesFormApi }) {
  const { control, setValue } = form
  const perPost = useWatch({ control, name: "perPost" })

  return (
    <FormSection title="Contact">
      <PhoneField control={control} />
      <Controller
        control={control}
        name="perPost"
        render={({ field }) => (
          <Field orientation="horizontal" data-field="perPost">
            <FieldContent>
              <FieldLabel htmlFor="perPost">Geen e-mail, klant wil per post</FieldLabel>
            </FieldContent>
            <Switch
              id="perPost"
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked)
                if (checked) setValue("email", "", { shouldValidate: true })
              }}
            />
          </Field>
        )}
      />
      <TextField
        control={control}
        name="email"
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="off"
        placeholder={perPost ? "Klant ontvangt post" : "naam@voorbeeld.nl"}
        disabled={perPost}
      />
    </FormSection>
  )
}
