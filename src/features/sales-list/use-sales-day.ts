import { useMemo } from "react"
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { DEMO_MODE, listSales } from "@/lib/api"
import { dayRange } from "./days"

/** Sales per request; "Meer laden" fetches the next page. Small in the demo so the button shows. */
const PAGE_SIZE = import.meta.env.DEV && DEMO_MODE ? 4 : 20

/**
 * The sales received on one day, a page at a time: the recruiter's own, or everyone's for an admin (row-level
 * security decides).
 */
export function useSalesDay(date: string) {
  const query = useInfiniteQuery({
    queryKey: ["sales-day", date],
    queryFn: ({ pageParam }) => {
      const { from, to } = dayRange(date)
      return listSales(from, to, pageParam, PAGE_SIZE)
    },
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.sales.length, 0)
      return loaded < last.total && last.sales.length > 0 ? loaded : undefined
    },
    // Stepping to another day keeps the previous list on screen (dimmed) instead of flashing a spinner.
    placeholderData: keepPreviousData,
  })

  const data = useMemo(
    () =>
      query.data && {
        sales: query.data.pages.flatMap((page) => page.sales),
        total: query.data.pages.at(-1)!.total,
      },
    [query.data],
  )
  return { ...query, data }
}
