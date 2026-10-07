import { useMemo } from "react"
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import type { SalesStats } from "@shared/kpi"
import { getKpi } from "@/lib/api"
import { kpiWindow, today } from "./periods"

/** Four years back is plenty for a dashboard. */
const MAX_PAGES = 4

export type KpiData = {
  demo: boolean
  /** First loaded sale day. */
  from: string
  to: string
  stats: SalesStats
}

/**
 * Sales statistics for one recruiter (or, for admins, the team when `wervernr` is null), loaded a year at a time
 * going back. The pages are merged into one set of statistics.
 */
export function useKpi(wervernr: string | null, enabled = true) {
  const until = today()
  const query = useInfiniteQuery({
    queryKey: ["kpi", wervernr ?? "team", until],
    queryFn: async ({ pageParam }) => {
      const window = kpiWindow(pageParam, until)
      return { ...window, response: await getKpi({ ...window, wervernr }) }
    },
    enabled,
    // Switching recruiter keeps the previous numbers on screen (dimmed) instead of emptying the page.
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    getNextPageParam: (last, pages, lastPageParam) =>
      pages.length < MAX_PAGES && last.response.stats.days.length > 0 ? lastPageParam + 1 : undefined,
  })

  const data = useMemo(() => (query.data ? merge(query.data.pages) : undefined), [query.data])
  return { ...query, data }
}

type Page = { from: string; to: string; response: { demo: boolean; stats: SalesStats } }

function merge(pages: Page[]): KpiData {
  const [first] = pages
  const recruiters = new Map<string, string>()
  for (const { response } of pages) {
    for (const r of response.stats.recruiters) if (!recruiters.has(r.number)) recruiters.set(r.number, r.name)
  }
  return {
    demo: first.response.demo,
    from: pages[pages.length - 1].from,
    to: first.to,
    stats: {
      // Freshness is a property of the database, so the newest page has the current value.
      cancellationsEnteredUntil: first.response.stats.cancellationsEnteredUntil,
      salesEnteredUntil: first.response.stats.salesEnteredUntil,
      days: pages.flatMap((page) => page.response.stats.days),
      recruiters: [...recruiters]
        .map(([number, name]) => ({ number, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "nl")),
      cancellations: pages.flatMap((page) => page.response.stats.cancellations),
      reasons: pages.flatMap((page) => page.response.stats.reasons),
    },
  }
}
