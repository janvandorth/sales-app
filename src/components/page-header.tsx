import type { ReactNode } from "react"

/** Buttons on the navy header: translucent white so they read as clickable on a dark background. */
export const HEADER_BUTTON_CLASS = "bg-white/15 text-white hover:bg-white/25 hover:text-white"

type Props = {
  /** Left slot, typically one icon button (camera, back). */
  start: ReactNode
  /** Centered title or logo. */
  title: ReactNode
  /** Right slot: status badges and icon buttons. */
  end: ReactNode
  maxWidth?: "xl" | "3xl"
}

/** Sticky navy app bar shared by all logged-in pages. */
export function PageHeader({ start, title, end, maxWidth = "xl" }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b bg-primary pt-[env(safe-area-inset-top)] text-primary-foreground">
      <div className={`mx-auto flex h-14 items-center gap-2 px-4 ${maxWidth === "xl" ? "max-w-xl" : "max-w-3xl"}`}>
        {start}
        <h1 className="flex flex-1 justify-center text-lg font-semibold">{title}</h1>
        {end}
      </div>
    </header>
  )
}
