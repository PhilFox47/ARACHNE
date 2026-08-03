import { asc } from "drizzle-orm";
import { db } from "./db";
import { weights } from "./db/schema";
import { addDays, daysBetween, todayISO } from "./dates";
import {
  CORRIDOR_TOLERANCE_KG,
  PROFILE,
  corridorTarget,
  kcalTargetForDay,
  phaseForDay,
  type Phase,
} from "./plan";
import { getSettings } from "./settings";

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
  latest: { date: string; weightKg: number } | null;
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

export function loadWeights(): { date: string; weightKg: number }[] {
  return db
    .select({ date: weights.date, weightKg: weights.weightKg })
    .from(weights)
    .orderBy(asc(weights.date))
    .all();
}

/**
 * One point per calendar day from the start date to today, so the corridor band
 * is continuous even across days with no reading.
 */
export function buildSeries(rows: { date: string; weightKg: number }[], startDate: string): WeightPoint[] {
  const today = todayISO();
  const lastDay = Math.min(Math.max(daysBetween(startDate, today), 0), PROFILE.totalDays);
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
  const target = corridorTarget(day);
  const { kcal, taper } = kcalTargetForDay(day);

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
    totalDays: PROFILE.totalDays,
    phase: phaseForDay(day),
    kcalTarget: kcal,
    inTaper: taper,
    avg7: avg7 === null ? null : round1(avg7),
    latest,
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
