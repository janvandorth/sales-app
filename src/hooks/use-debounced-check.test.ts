// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useDebouncedCheck } from "./use-debounced-check"

describe("useDebouncedCheck", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("is idle without a key", () => {
    const { result } = renderHook(() => useDebouncedCheck(null, vi.fn()))
    expect(result.current.status).toBe("idle")
  })

  it("shows pending immediately but only calls the check after the delay", async () => {
    const check = vi.fn().mockResolvedValue("ok")
    const { result } = renderHook(() => useDebouncedCheck("1012JS", check, 2000))

    expect(result.current.status).toBe("pending")
    await act(() => vi.advanceTimersByTimeAsync(1999))
    expect(check).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(check).toHaveBeenCalledOnce()
    expect(result.current).toEqual({ status: "done", data: "ok" })
  })

  it("restarts the delay when the key changes and aborts the stale request", async () => {
    const signals: AbortSignal[] = []
    const check = vi.fn((_key: string, signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<string>(() => {}) // never resolves
    })
    const { rerender } = renderHook(({ key }) => useDebouncedCheck(key, check, 2000), {
      initialProps: { key: "A" },
    })

    await act(() => vi.advanceTimersByTimeAsync(2000))
    rerender({ key: "B" })
    expect(signals[0].aborted).toBe(true)

    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(check.mock.calls.map(([key]) => key)).toEqual(["A", "B"])
  })

  it("reports errors with their message", async () => {
    const { result } = renderHook(() => useDebouncedCheck("x", () => Promise.reject(new Error("mislukt")), 10))
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(result.current).toEqual({ status: "error", message: "mislukt" })
  })
})
