import type { ReactNode } from "react"

/**
 * Width of every logged-in page: phone width on small screens, a normal website width on large ones (where pages
 * switch to two columns). Header, sticky bars and content all use it so their edges line up.
 */
export const PAGE_WIDTH = "max-w-xl lg:max-w-6xl"

/** Buttons on the navy header: translucent white so they read as clickable on a dark background. */
export const HEADER_BUTTON_CLASS = "bg-white/15 text-white hover:bg-white/25 hover:text-white"

type Props = {
  /** Left slot, typically one icon button (camera, back). */
  start: ReactNode
  /** Centered title or logo. */
  title: ReactNode
  /** Right slot: status badges and icon buttons. */
  end: ReactNode
}

/** Sticky navy app bar shared by all logged-in pages. */
export function PageHeader({ start, title, end }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b bg-primary pt-[env(safe-area-inset-top)] text-primary-foreground">
      <div className={`mx-auto flex h-14 items-center gap-2 px-4 ${PAGE_WIDTH}`}>
        {start}
        <h1 className="flex flex-1 justify-center text-lg font-semibold">{title}</h1>
        {end}
      </div>
    </header>
  )
}
