import { useState } from "react"
import { Undo2Icon } from "lucide-react"
import { Controller } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { SalesFormControl } from "../form-types"
import { hasInitials, normalizeNaam, type NaamCorrection } from "../naam"

/**
 * Name input that adds missing capitals when the agent leaves the field ("p.j. jansen" → "P.J. Jansen"). No rule
 * fits every name, so the correction can be undone, and once the agent edits or undoes it, the field leaves the
 * name alone until it is cleared. A scanned name arrives already corrected, via `scanned`, with the same undo.
 */
export function NaamField({ control, scanned }: { control: SalesFormControl; scanned: NaamCorrection | null }) {
  const [correction, setCorrection] = useState<NaamCorrection | null>(null)
  const [autoCorrect, setAutoCorrect] = useState(true)

  return (
    <Controller
      control={control}
      name="naam"
      render={({ field, fieldState }) => {
        const value = field.value
        // The correction still on screen, if any: our own (typed name) or the scan's.
        const shown = [correction, scanned].find((c) => c !== null && c.corrected === value)
        const missingInitials = value.trim() !== "" && !hasInitials(value)

        const onChange = (next: string) => {
          if (shown) setAutoCorrect(false) // The agent is editing a correction: their version wins.
          // A new name gets auto-correct again: the field was cleared, reset or typed over (select all + type).
          if (next.trim().length <= 1) setAutoCorrect(true)
          field.onChange(next)
        }

        const onBlur = () => {
          const corrected = normalizeNaam(value)
          if (autoCorrect && corrected !== value.trim() && value.trim() !== "") {
            setCorrection({ typed: value, corrected })
            field.onChange(corrected)
          }
          field.onBlur()
        }

        const undo = () => {
          if (!shown) return
          setAutoCorrect(false)
          field.onChange(shown.typed)
        }

        return (
          <Field data-invalid={fieldState.invalid} data-field="naam">
            <FieldLabel htmlFor="naam">Voorletter(s) + naam</FieldLabel>
            <Input
              {...field}
              id="naam"
              placeholder="P.J. Jansen"
              autoCapitalize="words"
              onChange={(event) => onChange(event.target.value)}
              onBlur={onBlur}
              aria-invalid={fieldState.invalid}
            />
            {fieldState.error ? (
              <FieldError errors={[fieldState.error]} />
            ) : shown ? (
              <div className="flex items-center justify-between gap-2">
                <FieldDescription>Hoofdletters aangepast.</FieldDescription>
                <Button type="button" variant="ghost" size="sm" onClick={undo}>
                  <Undo2Icon /> Ongedaan maken
                </Button>
              </div>
            ) : missingInitials ? (
              <FieldDescription className="text-amber-700 dark:text-amber-500">
                Geen voorletters gevonden. Klopt dat? Bijv. P.J. Jansen
              </FieldDescription>
            ) : (
              <FieldDescription>Voorletters met punten, gevolgd door de achternaam. Bijv. P.J. Jansen</FieldDescription>
            )}
          </Field>
        )
      }}
    />
  )
}
