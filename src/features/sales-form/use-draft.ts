import { useEffect, useState } from "react"
import type { FormInput } from "@shared/form-schema"
import { createEmptyForm, isEmptyForm, today } from "./form-defaults"
import type { SalesFormApi } from "./form-types"
import { loadDraft, saveDraft } from "./draft-store"

const AUTOSAVE_DELAY_MS = 400

/**
 * Restores the unfinished form of this user (if any) and autosaves every change to IndexedDB.
 * `ready` is false until the restore attempt finished, so the form never flashes empty first.
 */
export function useDraft(form: SalesFormApi, userId: string) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadDraft(userId).then((draft) => {
      if (cancelled) return
      // Defaults first, so a draft saved before a field was added still has every field. A draft with nothing
      // filled in is not restored: it would only bring back an old date and start time.
      if (draft && !isEmptyForm(draft)) form.reset({ ...createEmptyForm(), ...draft })
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [form, userId])

  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout>
    const subscription = form.watch((values) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveDraft(userId, values as FormInput), AUTOSAVE_DELAY_MS)
    })
    return () => {
      clearTimeout(timer)
      subscription.unsubscribe()
      void saveDraft(userId, form.getValues()) // Save immediately when leaving the page.
    }
  }, [ready, form, userId])

  // The app can stay open in the background for days. Coming back to an empty form from an earlier day starts a
  // fresh one, so it shows today's date.
  useEffect(() => {
    function refreshStaleEmptyForm() {
      if (document.visibilityState !== "visible") return
      const values = form.getValues()
      if (values.datum !== today() && isEmptyForm(values)) form.reset(createEmptyForm())
    }
    document.addEventListener("visibilitychange", refreshStaleEmptyForm)
    return () => document.removeEventListener("visibilitychange", refreshStaleEmptyForm)
  }, [form])

  return { ready }
}
