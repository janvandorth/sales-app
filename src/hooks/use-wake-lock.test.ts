// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useWakeLock } from "./use-wake-lock"

type FakeLock = { released: boolean; release: () => Promise<void> }

function fakeLock(): FakeLock {
  const lock: FakeLock = {
    released: false,
    release: vi.fn(async () => {
      lock.released = true
    }),
  }
  return lock
}

let visibility: DocumentVisibilityState = "visible"
const locks: FakeLock[] = []
const request = vi.fn(async () => {
  const lock = fakeLock()
  locks.push(lock)
  return lock
})

function setVisibility(state: DocumentVisibilityState) {
  visibility = state
  document.dispatchEvent(new Event("visibilitychange"))
}

describe("useWakeLock", () => {
  beforeEach(() => {
    visibility = "visible"
    locks.length = 0
    request.mockClear()
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility)
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, "wakeLock")
  })

  it("keeps the screen on while the page is open and lets go when it closes", async () => {
    const { unmount } = renderHook(() => useWakeLock())
    await act(async () => {})
    expect(request).toHaveBeenCalledWith("screen")

    unmount()
    expect(locks[0].released).toBe(true)
  })

  it("asks again when the page comes back after the browser dropped the lock", async () => {
    renderHook(() => useWakeLock())
    await act(async () => {})

    // Hiding the page releases the lock in the browser itself.
    locks[0].released = true
    await act(async () => setVisibility("hidden"))
    expect(request).toHaveBeenCalledTimes(1)

    await act(async () => setVisibility("visible"))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("does nothing where the browser has no wake lock or refuses it", async () => {
    Reflect.deleteProperty(navigator, "wakeLock")
    renderHook(() => useWakeLock()).unmount()

    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn().mockRejectedValue(new Error("battery saving")) },
      configurable: true,
    })
    renderHook(() => useWakeLock())
    await act(async () => {})
  })
})
