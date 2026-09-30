import { get, update } from "idb-keyval"
import type { FormInput } from "@shared/form-schema"
import { appStore } from "@/lib/idb"

/** A submitted form that has not reached the server yet ("Wachtrij" in the UI). */
export type OutboxItem = {
  values: FormInput
  queuedAt: string
  /** Set when the server rejected the form; the recruiter has to fix it (see OutboxDialog). */
  rejectedReason?: string
}

const outboxKey = (userId: string) => `outbox:${userId}`

export async function loadOutbox(userId: string): Promise<OutboxItem[]> {
  return (await get<OutboxItem[]>(outboxKey(userId), appStore)) ?? []
}

export function addToOutbox(userId: string, values: FormInput) {
  return update<OutboxItem[]>(
    outboxKey(userId),
    (items = []) => [
      ...items.filter((item) => item.values.rowId !== values.rowId),
      { values, queuedAt: new Date().toISOString() },
    ],
    appStore,
  )
}

export function removeFromOutbox(userId: string, rowId: string) {
  return update<OutboxItem[]>(
    outboxKey(userId),
    (items = []) => items.filter((item) => item.values.rowId !== rowId),
    appStore,
  )
}

export function markOutboxItemRejected(userId: string, rowId: string, reason: string) {
  return update<OutboxItem[]>(
    outboxKey(userId),
    (items = []) => items.map((item) => (item.values.rowId === rowId ? { ...item, rejectedReason: reason } : item)),
    appStore,
  )
}
