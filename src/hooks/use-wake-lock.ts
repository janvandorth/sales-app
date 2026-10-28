import { useEffect } from "react"

/**
 * Keeps the screen on while the calling page is open. The browser drops the lock whenever the page is hidden
 * (another app, the phone locked), so it is requested again each time the page becomes visible. Where the browser
 * has no wake lock, or refuses one (e.g. in battery saving mode), the screen turns off as usual.
 */
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | null = null
    let pending = false
    let stopped = false

    const request = async () => {
      if (pending || document.visibilityState !== "visible" || (lock && !lock.released)) return
      pending = true
      try {
        const next = await navigator.wakeLock.request("screen")
        if (stopped) void next.release()
        else lock = next
      } catch {
        // Refused: the screen keeps its normal timeout.
      } finally {
        pending = false
      }
    }

    const onVisibilityChange = () => void request()
    void request()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      stopped = true
      document.removeEventListener("visibilitychange", onVisibilityChange)
      void lock?.release()
    }
  }, [])
}
