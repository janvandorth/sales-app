import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Controller, useWatch } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { PhoneField } from "../fields/phone-field"
import { TextField } from "../fields/text-field"
import type { SalesFormApi } from "../form-types"
import { FormSection } from "./form-section"

export function ContactSection({ form }: { form: SalesFormApi }) {
  const { control, setValue } = form
  const perPost = useWatch({ control, name: "perPost" })
  const telefoon2 = useWatch({ control, name: "telefoon2" })
  const [showTelefoon2, setShowTelefoon2] = useState(false)
  // A scanned or restored second number opens the row by itself.
  if (telefoon2 && !showTelefoon2) setShowTelefoon2(true)

  function removeTelefoon2() {
    setValue("telefoon2", "", { shouldDirty: true, shouldValidate: true })
    setValue("landcode2", "+31", { shouldDirty: true })
    setShowTelefoon2(false)
  }

  return (
    <FormSection title="Contact">
      <PhoneField control={control} />
      {showTelefoon2 ? (
        <PhoneField
          control={control}
          which="second"
          action={
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Tweede telefoonnummer verwijderen"
              onClick={removeTelefoon2}
            >
              <XIcon />
            </Button>
          }
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mt-2 -ml-2.5 self-start"
          onClick={() => setShowTelefoon2(true)}
        >
          <PlusIcon />
          Tweede telefoonnummer
        </Button>
      )}
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
