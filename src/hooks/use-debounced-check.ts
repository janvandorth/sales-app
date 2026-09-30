import { useEffect, useRef, useState } from "react"
import { useOnline } from "@/hooks/use-online"

export type CheckState<T> =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "offline" }
  | { status: "done"; data: T }
  | { status: "error"; message: string }

/**
 * Runs `check(key)` once `key` has been stable for `delay` ms. The state flips to "pending" immediately
 * on every change so the user sees a spinner right away; in-flight requests for stale keys are aborted.
 * A null key means "nothing to check".
 */
export function useDebouncedCheck<T>(
  key: string | null,
  check: (key: string, signal: AbortSignal) => Promise<T>,
  delay = 2000,
): CheckState<T> {
  const online = useOnline()
  const [result, setResult] = useState<{ key: string; state: CheckState<T> } | null>(null)
  // Callers pass inline functions; keep the latest one without making it a trigger for a new check.
  const checkRef = useRef(check)
  useEffect(() => {
    checkRef.current = check
  })

  useEffect(() => {
    if (key === null || !online) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const data = await checkRef.current(key, controller.signal)
        if (!controller.signal.aborted) setResult({ key, state: { status: "done", data } })
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : "Controle mislukt"
        setResult({ key, state: { status: "error", message } })
      }
    }, delay)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, online, delay])

  if (key === null) return { status: "idle" }
  if (result?.key === key) return result.state
  if (!online) return { status: "offline" }
  return { status: "pending" }
}
