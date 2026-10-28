import type { ExpressionSpecification } from "maplibre-gl"
import { LEVELS } from "@shared/sales-map-view"

/**
 * How an area is drawn. Its colour says how long ago the newest sale there was, its darkness how many sales there
 * were, so "worked here last week" and "worked here a lot" can be read separately.
 */

/** Colour by age of the newest sale as a share of the period: 0 = today, 1 = the first day of the period. */
export const AGE_STOPS: [age: number, color: string][] = [
  [0, "#dc2626"], // red: the last few days
  [0.15, "#f97316"], // orange
  [0.4, "#eab308"], // yellow
  [1, "#9ca3af"], // grey: the start of the period
]

/** Fill opacity of level 1 (fewest sales) and of the top level (as many as the busiest area). */
export const STRENGTH_RANGE = [0.25, 0.85] as const

/** The newest sale's age as a share of a period of `periodDays`, between 0 and 1. */
export function age(lastSoldOn: string, today: string, periodDays: number): number {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastSoldOn}T00:00:00Z`)) / 86_400_000
  return Math.min(1, Math.max(0, days / periodDays))
}

/** Fill opacity for an area's level (1 to LEVELS), evenly spread over STRENGTH_RANGE. */
export function strength(level: number): number {
  const [low, high] = STRENGTH_RANGE
  return low + ((high - low) * (level - 1)) / (LEVELS - 1)
}

/** AGE_STOPS as a MapLibre interpolate expression on the feature state `age`. */
export function ageColorExpression(): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["feature-state", "age"], 1],
    ...AGE_STOPS.flat(),
  ] as ExpressionSpecification
}
