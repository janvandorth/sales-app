import { useState } from "react"
import { toast } from "sonner"
import { EXTRACTABLE_FIELDS, type ExtractableField, type ExtractedFields, type FormInput } from "@shared/form-schema"
import { extractFromPhoto } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import type { SalesFormApi } from "./form-types"
import { prepareScanImage } from "./scan-image"

// Fill animation: text fields are "typed" character by character, pickers are set at once.
const TYPE_CHAR_MS = 22
const MAX_TYPE_FIELD_MS = 450
const PICKER_STEP_MS = 120
const PICKER_FIELDS = new Set<ExtractableField>(["geslacht", "landcode", "contractType", "betaalperiode"])

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Camera scan: uploads the photo, lets the backend read it with Claude and types the result into the form,
 * top to bottom. `phase` drives the blocking overlay: "reading" shows a spinner, "filling" only blocks input.
 */
export function useScanFill(form: SalesFormApi, userId: string) {
  const [phase, setPhase] = useState<"reading" | "filling" | null>(null)

  async function scan(photo: File) {
    setPhase("reading")
    try {
      const { fields, mock } = await extractFromPhoto(userId, await prepareScanImage(photo))
      setPhase("filling")
      await typeIntoForm(fields)
      if (mock) toast.info("Demo: voorbeeldgegevens ingevuld (Claude is nog niet gekoppeld)")
      else toast.success("Formulier ingevuld — controleer de gegevens")
    } catch (error) {
      toast.error(getErrorMessage(error, "Uitlezen van de foto is mislukt"))
    } finally {
      setPhase(null)
    }
  }

  async function typeIntoForm(fields: ExtractedFields) {
    const filled: ExtractableField[] = []
    for (const name of EXTRACTABLE_FIELDS) {
      const value = fields[name]
      if (value === undefined) continue
      if (name === "email") form.setValue("perPost", false)
      filled.push(name)
      highlight(name)

      if (PICKER_FIELDS.has(name)) {
        setField(name, value)
        await sleep(PICKER_STEP_MS)
      } else {
        const perChar = Math.min(TYPE_CHAR_MS, MAX_TYPE_FIELD_MS / value.length)
        for (let i = 1; i <= value.length; i++) {
          setField(name, value.slice(0, i))
          await sleep(perChar)
        }
      }
      setField(name, value)
    }
    await form.trigger(filled)
  }

  /**
   * Sets one extracted field. The loop iterates over a union of field names, which TypeScript cannot correlate
   * with the matching value type; the values were validated against the same schema on the server.
   */
  function setField(name: ExtractableField, value: string) {
    form.setValue(name, value as FormInput[typeof name], { shouldDirty: true })
  }

  return { phase, scan }
}

function highlight(name: ExtractableField) {
  document
    .querySelector(`[data-field="${name}"]`)
    ?.animate(
      [{ backgroundColor: "color-mix(in oklab, var(--primary) 15%, transparent)" }, { backgroundColor: "transparent" }],
      { duration: 900, easing: "ease-out" },
    )
}
