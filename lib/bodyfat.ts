/**
 * The body-fat chart's axis, and nothing else.
 *
 * Its own module for a reason that is not obvious and costs a build to
 * rediscover: `CompositionChart` is a `"use client"` component, and importing a
 * *value* from `lib/stats.ts` pulls that module's `import { db }` into the
 * client bundle, where better-sqlite3 asks for `fs` and webpack fails with
 * "Can't resolve 'fs'". The type import it had before was fine — types are
 * erased — so the failure only appears the moment a real function is shared.
 * Anything the chart components need at runtime belongs in a module like this
 * one, which touches no database.
 */

import type { CompositionPoint } from "./stats";

/**
 * The narrowest window the axis may show, in percentage points.
 *
 * Fitting an axis to the data alone is the opposite mistake to stacking it from
 * zero. A fortnight of readings between 30.1 and 30.4 would fill the panel
 * corner to corner and turn a hydration difference into a cliff. Eight points is
 * wide enough that noise stays small and narrow enough that a real month's work
 * — one to two points — is unmistakable.
 */
export const BODYFAT_MIN_SPAN_PCT = 8;

/**
 * Gaps between gridlines, and the multiple the window is rounded to.
 *
 * Left to itself the axis produced 27 / 29 / 31 / 34 — one gap wider than the
 * others, which reads as a bug even when the plot is right. Sizing the window in
 * whole multiples of this keeps every gridline a round number and every gap the
 * same size at every scale, from a flat fortnight to a full year.
 */
export const BODYFAT_GRID_STEPS = 4;

/** Breathing room above and below the data, so the line never touches an edge. */
const PAD_PCT = 0.8;

/**
 * The y-axis window for the body-fat chart, and the ticks along it.
 *
 * Truncated on purpose, which is the right call for a line — position carries
 * the value there, and the zero-baseline rule belongs to bars, where length
 * does. Two things keep the zoom honest: the floor on the span above, and the
 * raw readings the chart draws behind the average, which show the instrument's
 * spread rather than smoothing it out of sight.
 *
 * Both series decide the window. A raw reading outside the averaged range would
 * otherwise be clipped without saying so — and that reading is precisely the one
 * a reader needs, because it is why the average moved.
 */
export function bodyfatDomain(points: CompositionPoint[]): { min: number; max: number; ticks: number[] } {
  const values = points.flatMap((p) => [p.bodyfatPct, p.rawPct]);
  const lo = Math.min(...values) - PAD_PCT;
  const hi = Math.max(...values) + PAD_PCT;

  // Widened around the middle rather than from one end, so a flat stretch sits
  // in the centre of the panel instead of pinned against an edge.
  const mid = (lo + hi) / 2;
  const span = Math.ceil(Math.max(BODYFAT_MIN_SPAN_PCT, hi - lo) / BODYFAT_GRID_STEPS) * BODYFAT_GRID_STEPS;
  const min = Math.max(0, Math.round(mid - span / 2));
  const step = span / BODYFAT_GRID_STEPS;

  return {
    min,
    max: min + span,
    ticks: Array.from({ length: BODYFAT_GRID_STEPS + 1 }, (_, i) => min + step * i),
  };
}
