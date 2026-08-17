import { asc } from "drizzle-orm";
import { db } from "./db";
import { weights } from "./db/schema";
import { addDays, daysBetween, todayISO } from "./dates";
import { CORRIDOR_TOLERANCE_KG, type Phase } from "./plan";
import { corridorTarget, courseTotalDays, intakeForDay, phaseForDay } from "./course";
import { getSettings } from "./settings";

export interface WeightRow {
  date: string;
  weightKg: number;
  /** Bioimpedance, straight off the scale. Null on days it wasn't recorded. */
  bodyfatPct: number | null;
}

export interface WeightPoint {
  date: string;
  day: number;
  raw: number | null;
  avg: number | null;
  target: number;
  lo: number;
  hi: number;
}

export type CorridorState = "above" | "inside" | "below" | "unknown";

export interface HqStats {
  startDateISO: string;
  day: number;
  totalDays: number;
  phase: Phase;
  kcalTarget: number;
  inTaper: boolean;
  avg7: number | null;
  latest: WeightRow | null;
  /** Most recent scale body-fat reading, however many days back it was. */
  latestBodyfat: { date: string; pct: number } | null;
  deltaFromStart: number | null;
  corridorTarget: number;
  corridorDelta: number | null;
  corridorState: CorridorState;
  startWeightKg: number;
  targetWeightKg: number;
  entryCount: number;
  loggedToday: boolean;
}

/**
 * Trailing 7-calendar-day mean, not "last 7 entries". A missed day should widen
 * the window's gaps, not silently reach further back for stale readings.
 */
export function rollingAverage(
  rows: { date: string; weightKg: number }[],
  onDate: string,
  windowDays = 7,
): number | null {
  const from = addDays(onDate, -(windowDays - 1));
  const inWindow = rows.filter((r) => r.date >= from && r.date <= onDate);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((s, r) => s + r.weightKg, 0) / inWindow.length;
}

export function loadWeights(): WeightRow[] {
  return db
    .select({ date: weights.date, weightKg: weights.weightKg, bodyfatPct: weights.bodyfatPct })
    .from(weights)
    .orderBy(asc(weights.date))
    .all();
}

// ─────────────────────────────────────────────────────────────
// Body composition
// ─────────────────────────────────────────────────────────────

export interface CompositionPoint {
  date: string;
  day: number;
  /** Smoothed, because a single bioimpedance reading is not worth plotting. */
  bodyfatPct: number;
  fatKg: number;
  leanKg: number;
}

/**
 * Splits the weight into fat and lean mass. This is the number the plan document
 * actually worries about — twenty kilos off the scale is a success or a failure
 * depending entirely on which tissue left.
 *
 * Both series are smoothed over the same trailing week. Bioimpedance swings
 * several points on hydration alone, so a daily fat-mass line would be mostly
 * noise dressed up as biology.
 */
export function buildComposition(rows: WeightRow[], windowDays = 7): CompositionPoint[] {
  const withBf = rows.filter((r) => r.bodyfatPct !== null);
  if (withBf.length === 0) return [];

  const out: CompositionPoint[] = [];
  const startDate = rows[0].date;

  for (const r of withBf) {
    const from = addDays(r.date, -(windowDays - 1));
    const window = withBf.filter((w) => w.date >= from && w.date <= r.date);
    const bf = window.reduce((s, w) => s + (w.bodyfatPct ?? 0), 0) / window.length;
    const kg = window.reduce((s, w) => s + w.weightKg, 0) / window.length;
    const fat = (kg * bf) / 100;
    out.push({
      date: r.date,
      day: daysBetween(startDate, r.date),
      bodyfatPct: round1(bf),
      fatKg: round1(fat),
      leanKg: round1(kg - fat),
    });
  }
  return out;
}

export interface CompositionSummary {
  first: CompositionPoint;
  latest: CompositionPoint;
  fatDeltaKg: number;
  leanDeltaKg: number;
  bodyfatDeltaPct: number;
  /**
   * Share of the total weight change that came off as fat. Above 1 means lean
   * mass went up while fat came down — the best outcome there is.
   */
  fatShare: number | null;
  spanDays: number;
}

export function compositionSummary(points: CompositionPoint[]): CompositionSummary | null {
  // Two readings a day apart say nothing. A fortnight is the shortest span on
  // which a composition change is distinguishable from scale noise.
  if (points.length < 2) return null;
  const first = points[0];
  const latest = points[points.length - 1];
  const spanDays = latest.day - first.day;
  if (spanDays < 14) return null;

  const fatDeltaKg = round1(latest.fatKg - first.fatKg);
  const leanDeltaKg = round1(latest.leanKg - first.leanKg);
  const totalDelta = fatDeltaKg + leanDeltaKg;

  return {
    first,
    latest,
    fatDeltaKg,
    leanDeltaKg,
    bodyfatDeltaPct: round1(latest.bodyfatPct - first.bodyfatPct),
    fatShare: Math.abs(totalDelta) < 0.5 ? null : round1((fatDeltaKg / totalDelta) * 100) / 100,
    spanDays,
  };
}

/**
 * One point per calendar day from the start date to today, so the corridor band
 * is continuous even across days with no reading.
 */
export function buildSeries(rows: { date: string; weightKg: number }[], startDate: string): WeightPoint[] {
  const today = todayISO();
  const lastDay = Math.min(Math.max(daysBetween(startDate, today), 0), courseTotalDays());
  const byDate = new Map(rows.map((r) => [r.date, r.weightKg]));

  const out: WeightPoint[] = [];
  for (let d = 0; d <= lastDay; d++) {
    const date = addDays(startDate, d);
    const target = corridorTarget(d);
    out.push({
      date,
      day: d,
      raw: byDate.get(date) ?? null,
      avg: rollingAverage(rows, date),
      target: round1(target),
      lo: round1(target - CORRIDOR_TOLERANCE_KG),
      hi: round1(target + CORRIDOR_TOLERANCE_KG),
    });
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function getHqStats(): HqStats {
  const s = getSettings();
  const rows = loadWeights();
  const today = todayISO();
  const day = Math.max(daysBetween(s.startDate, today), 0);

  const avg7 = rollingAverage(rows, today);
  const latest = rows.length ? rows[rows.length - 1] : null;
  // Searched backwards rather than read off `latest` — a scale used without the
  // body-fat feature one morning shouldn't blank the figure.
  const lastBf = [...rows].reverse().find((r) => r.bodyfatPct !== null) ?? null;
  const target = corridorTarget(day);
  const { kcal, taper } = intakeForDay(day);

  // Judge the corridor on the 7-day average, never on a single reading — the
  // document is explicit that daily weight swings up to 2 kg on water alone.
  let corridorState: CorridorState = "unknown";
  let corridorDelta: number | null = null;
  if (avg7 !== null) {
    corridorDelta = avg7 - target;
    if (corridorDelta > CORRIDOR_TOLERANCE_KG) corridorState = "above";
    else if (corridorDelta < -CORRIDOR_TOLERANCE_KG) corridorState = "below";
    else corridorState = "inside";
  }

  return {
    startDateISO: s.startDate,
    day,
    totalDays: courseTotalDays(),
    phase: phaseForDay(day),
    kcalTarget: kcal,
    inTaper: taper,
    avg7: avg7 === null ? null : round1(avg7),
    latest,
    latestBodyfat: lastBf ? { date: lastBf.date, pct: lastBf.bodyfatPct! } : null,
    deltaFromStart: avg7 === null ? null : round1(avg7 - s.startWeightKg),
    corridorTarget: round1(target),
    corridorDelta: corridorDelta === null ? null : round1(corridorDelta),
    corridorState,
    startWeightKg: s.startWeightKg,
    targetWeightKg: s.targetWeightKg,
    entryCount: rows.length,
    loggedToday: rows.some((r) => r.date === today),
  };
}
