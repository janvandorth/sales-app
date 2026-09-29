import { registerSW } from "virtual:pwa-register"

const UPDATE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Registers the service worker and actively checks for new versions. A home-screen app on iOS is usually
 * resumed from memory instead of reloaded, so without these checks it can keep running an old version.
 * With `registerType: "autoUpdate"` a found update activates and reloads the page; drafts are autosaved.
 */
export function registerServiceWorker() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) void registration.update()
      }
      setInterval(check, UPDATE_INTERVAL_MS)
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check()
      })
    },
  })
}
