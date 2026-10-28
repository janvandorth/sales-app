import type { ExpressionSpecification } from "maplibre-gl"
import { LEVELS } from "@shared/sales-map-view"

/**
 * How an area is drawn, from the numbers the backend computed. On the sales map its colour says how long ago the
 * newest sale there was and its darkness how many sales there were; on "kansen" it is blue, darker where more
 * households are still not a customer.
 */

/** Colour by age of the newest sale as a share of the period: 0 = its last day, 1 = its first day. */
export const AGE_STOPS: [age: number, color: string][] = [
  [0, "#dc2626"], // red: the last few days
  [0.15, "#f97316"], // orange
  [0.4, "#eab308"], // yellow
  [1, "#9ca3af"], // grey: the start of the period
]

/** The colour of "kansen". */
export const OPPORTUNITY_COLOR = "#1d4ed8"

/** Fill opacity of level 1 (the least) and of the top level (as much as the area with the most). */
export const STRENGTH_RANGE = [0.25, 0.85] as const

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
