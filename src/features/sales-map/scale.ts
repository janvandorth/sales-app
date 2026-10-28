import type { ExpressionSpecification } from "maplibre-gl"

/**
 * How an area or street is drawn, from the numbers the backend computed. On the sales map its colour says how long
 * ago the newest sale there was and its opacity how much was sold; on "kansen" it runs from pale to deep blue with
 * the open households. Shade levels go from 1 (the bottom half of all streets) to 5 (the top 3%).
 */

/** Colour by age of the newest sale as a share of the period: 0 = its last day, 1 = its first day. */
export const AGE_STOPS: [age: number, color: string][] = [
  [0, "#dc2626"], // red: the last few days
  [0.15, "#f97316"], // orange
  [0.4, "#eab308"], // yellow
  [1, "#9ca3af"], // grey: the start of the period
]

/** Sales map: opacity per level. Even the lowest stays visible, so a single recent sale still shows its age. */
export const SALES_OPACITY = [0.3, 0.45, 0.6, 0.75, 0.9]

/** "Kansen": colour per level, pale to deep blue, so the few top streets stand out from the many ordinary ones. */
export const KANSEN_COLORS = ["#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a8a"]

/** "Kansen": opacity per level; the bottom half is a faint tint only. */
export const KANSEN_OPACITY = [0.15, 0.4, 0.6, 0.8, 0.92]

/**
 * At street zoom every opacity is multiplied by this, so the darkest shade (0.92) stays near 0.6: the street under
 * it remains readable, and the colour still tells the levels apart.
 */
export const STREET_OPACITY = 0.65

/** A per-level value from `values` as a MapLibre expression on `level`; level 1 for anything unknown. */
function byLevel(level: ExpressionSpecification, values: (string | number)[]): ExpressionSpecification {
  return ["match", level, 2, values[1], 3, values[2], 4, values[3], 5, values[4], values[0]] as ExpressionSpecification
}

/** Fill colour for a mode, from a level and an age expression (feature state for PC4, properties for PC6). */
export function fillColor(
  mode: "sales" | "kansen",
  level: ExpressionSpecification,
  age: ExpressionSpecification,
): ExpressionSpecification {
  if (mode === "kansen") return byLevel(level, KANSEN_COLORS)
  return ["interpolate", ["linear"], ["coalesce", age, 1], ...AGE_STOPS.flat()] as ExpressionSpecification
}

/** Fill opacity for a mode from a level expression. */
export function fillOpacity(mode: "sales" | "kansen", level: ExpressionSpecification): ExpressionSpecification {
  return byLevel(level, mode === "kansen" ? KANSEN_OPACITY : SALES_OPACITY)
}
