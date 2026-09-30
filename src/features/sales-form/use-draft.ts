import { useEffect, useState } from "react"
import type { FormInput } from "@shared/form-schema"
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
      if (draft) form.reset(draft)
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

  return { ready }
}
