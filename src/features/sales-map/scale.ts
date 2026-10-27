import type { ExpressionSpecification } from "maplibre-gl"

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

/** Fill opacity of the area with the fewest and with the most sales at the shown level. */
export const STRENGTH_RANGE = [0.25, 0.85] as const

/** The newest sale's age as a share of a period of `periodDays`, between 0 and 1. */
export function age(lastSoldOn: string, today: string, periodDays: number): number {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastSoldOn}T00:00:00Z`)) / 86_400_000
  return Math.min(1, Math.max(0, days / periodDays))
}

/**
 * Opacity for `sold` sales when the busiest area at this level has `maxSold`. On a log scale, so one busy street
 * does not wash out the rest, and per level, because a PC4 area always holds more sales than a PC6 one.
 */
export function strength(sold: number, maxSold: number): number {
  const [low, high] = STRENGTH_RANGE
  if (maxSold <= 1) return high
  return low + ((high - low) * Math.log(sold)) / Math.log(maxSold)
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
