import { createStore, del, get, set, update } from "idb-keyval"
import type { FormInput } from "@shared/form-schema"

const store = createStore("bellijst", "state")

export type QueuedSubmission = {
  values: FormInput
  queuedAt: string
  lastError?: string
}

const draftKey = (userId: string) => `draft:${userId}`
const outboxKey = (userId: string) => `outbox:${userId}`

export const loadDraft = (userId: string) => get<FormInput>(draftKey(userId), store)
export const saveDraft = (userId: string, values: FormInput) => set(draftKey(userId), values, store)
export const clearDraft = (userId: string) => del(draftKey(userId), store)

export async function loadOutbox(userId: string): Promise<QueuedSubmission[]> {
  return (await get<QueuedSubmission[]>(outboxKey(userId), store)) ?? []
}

export function enqueue(userId: string, values: FormInput) {
  return update<QueuedSubmission[]>(
    outboxKey(userId),
    (items = []) => [...items.filter((item) => item.values.rowId !== values.rowId), { values, queuedAt: new Date().toISOString() }],
    store,
  )
}

export function removeFromOutbox(userId: string, rowId: string) {
  return update<QueuedSubmission[]>(outboxKey(userId), (items = []) => items.filter((item) => item.values.rowId !== rowId), store)
}

export function markOutboxError(userId: string, rowId: string, message: string) {
  return update<QueuedSubmission[]>(
    outboxKey(userId),
    (items = []) => items.map((item) => (item.values.rowId === rowId ? { ...item, lastError: message } : item)),
    store,
  )
}
