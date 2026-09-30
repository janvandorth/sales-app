import { Spinner } from "@/components/ui/spinner"

/** Blocks the page while a scan is read ("reading", with spinner) and typed into the form ("filling"). */
export function ScanOverlay({ phase }: { phase: "reading" | "filling" | null }) {
  if (!phase) return null
  if (phase === "filling") return <div className="fixed inset-0 z-50" aria-busy="true" />
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm"
      aria-busy="true"
      aria-live="polite"
    >
      <Spinner className="size-8" />
      <p className="text-sm font-medium">Formulier wordt uitgelezen…</p>
    </div>
  )
}
