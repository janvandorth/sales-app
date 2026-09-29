import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { FormInput } from "@shared/form-schema"
import { useOnline } from "@/hooks/use-online"
import { AuthError, NetworkError, submitForm } from "@/lib/api"
import { enqueue, loadOutbox, markOutboxError, removeFromOutbox, type QueuedSubmission } from "@/lib/offline-store"

const RETRY_INTERVAL_MS = 30_000

/** Forms submitted while offline are queued in IndexedDB and sent automatically once back online. */
export function useOutbox(userId: string) {
  const online = useOnline()
  const [items, setItems] = useState<QueuedSubmission[]>([])
  const [syncing, setSyncing] = useState(false)
  const flushing = useRef(false)

  const refresh = useCallback(async () => setItems(await loadOutbox(userId)), [userId])

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return
    flushing.current = true
    setSyncing(true)
    let sent = 0
    try {
      for (const item of await loadOutbox(userId)) {
        try {
          await submitForm(item.values)
          await removeFromOutbox(userId, item.values.rowId)
          sent++
        } catch (error) {
          // Not the form's fault: keep it queued and try again later (after reconnecting or logging in again).
          if (error instanceof NetworkError || error instanceof AuthError) break
          const message = error instanceof Error ? error.message : "Versturen mislukt"
          await markOutboxError(userId, item.values.rowId, message)
        }
      }
    } finally {
      flushing.current = false
      setSyncing(false)
      await refresh()
    }
    if (sent > 0) toast.success(sent === 1 ? "1 formulier uit de wachtrij verstuurd" : `${sent} formulieren uit de wachtrij verstuurd`)
  }, [userId, refresh])

  useEffect(() => {
    void refresh().then(flush)
  }, [refresh, flush])

  useEffect(() => {
    if (online) void flush()
  }, [online, flush])

  useEffect(() => {
    if (items.length === 0) return
    const timer = setInterval(flush, RETRY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [items.length, flush])

  /** Sends now when possible; queues when offline. Throws ApiError for server-side rejections. */
  const submit = useCallback(
    async (values: FormInput): Promise<"sent" | "queued"> => {
      if (navigator.onLine) {
        try {
          await submitForm(values)
          return "sent"
        } catch (error) {
          if (!(error instanceof NetworkError || error instanceof AuthError)) throw error
        }
      }
      await enqueue(userId, values)
      await refresh()
      return "queued"
    },
    [userId, refresh],
  )

  const remove = useCallback(
    async (rowId: string) => {
      await removeFromOutbox(userId, rowId)
      await refresh()
    },
    [userId, refresh],
  )

  return { items, syncing, submit, flush, remove }
}
