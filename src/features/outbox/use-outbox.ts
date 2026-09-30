import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { FormInput } from "@shared/form-schema"
import { useOnline } from "@/hooks/use-online"
import { submitForm } from "@/lib/api"
import { getErrorMessage, isRetryable } from "@/lib/errors"
import { addToOutbox, loadOutbox, markOutboxItemRejected, removeFromOutbox } from "./outbox-store"

const RETRY_INTERVAL_MS = 30_000

const outboxQueryKey = (userId: string) => ["outbox", userId] as const

/**
 * Submits forms, queueing them in IndexedDB when they cannot be sent right now (offline, session expired).
 * Queued forms are sent automatically when the app starts, comes back online, and every 30 s.
 */
export function useOutbox(userId: string) {
  const online = useOnline()
  const queryClient = useQueryClient()
  // IndexedDB is local, so this query must also run while offline ("always").
  const { data: items = [] } = useQuery({
    queryKey: outboxQueryKey(userId),
    queryFn: () => loadOutbox(userId),
    networkMode: "always",
  })
  const [syncing, setSyncing] = useState(false)
  const flushing = useRef(false)

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: outboxQueryKey(userId) }),
    [queryClient, userId],
  )

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
          if (isRetryable(error)) break
          await markOutboxItemRejected(userId, item.values.rowId, getErrorMessage(error, "Versturen mislukt"))
        }
      }
    } finally {
      flushing.current = false
      setSyncing(false)
      await refresh()
    }
    if (sent > 0)
      toast.success(
        sent === 1 ? "1 formulier uit de wachtrij verstuurd" : `${sent} formulieren uit de wachtrij verstuurd`,
      )
  }, [userId, refresh])

  // Send what is queued on start and whenever the connection comes back.
  useEffect(() => {
    if (online) void flush()
  }, [online, flush])

  useEffect(() => {
    if (items.length === 0) return
    const timer = setInterval(flush, RETRY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [items.length, flush])

  /** Sends now when possible, otherwise queues. Throws for server-side rejections (e.g. validation). */
  const submit = useCallback(
    async (values: FormInput): Promise<"sent" | "queued"> => {
      if (navigator.onLine) {
        try {
          await submitForm(values)
          return "sent"
        } catch (error) {
          if (!isRetryable(error)) throw error
        }
      }
      await addToOutbox(userId, values)
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
