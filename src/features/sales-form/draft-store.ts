import { del, get, set } from "idb-keyval"
import type { FormInput } from "@shared/form-schema"
import { appStore } from "@/lib/idb"

/** The form being filled in, per user, so it survives closing the app and being offline. */
const draftKey = (userId: string) => `draft:${userId}`

export const loadDraft = (userId: string) => get<FormInput>(draftKey(userId), appStore)
export const saveDraft = (userId: string, values: FormInput) => set(draftKey(userId), values, appStore)
export const clearDraft = (userId: string) => del(draftKey(userId), appStore)
