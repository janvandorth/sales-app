import { createStore } from "idb-keyval"

/** The app's IndexedDB store; holds per-user drafts and the outbox so they survive offline and restarts. */
export const appStore = createStore("bellijst", "state")
