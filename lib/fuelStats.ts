import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { foodEntries, waterLogs } from "./db/schema";
import { addDays, daysBetween, todayISO } from "./dates";
import { getSettings } from "./settings";
import { PROTEIN_PER_MEAL_G, kcalTargetForDay, phaseForDay } from "./plan";

export interface DayNutrition {
  date: string;
  label: string;
  /** Day index since start, so targets track the phase. */
  day: number;
  kcal: number;
  kcalAvg7: number | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  saltG: number;
  mealKcal: number;
  snackKcal: number;
  entries: number;
  waterMl: number;
  kcalTarget: number;
  logged: boolean;
}

export interface WeekSummary {
  weekIndex: number;
  label: string;
  from: string;
  to: string;
  daysLogged: number;
  avgKcal: number | null;
  avgProteinG: number | null;
  avgWaterMl: number | null;
  snackPct: number | null;
  kcalTarget: number;
}

export interface FuelStats {
  days: DayNutrition[];
  weeks: WeekSummary[];
  hourly: { hour: number; kcal: number; entries: number }[];
  weekday: { name: string; snackKcal: number; mealKcal: number; days: number }[];
  topSnacks: { description: string; count: number; totalKcal: number; avgKcal: number }[];
  totals: {
    daysLogged: number;
    daysInPeriod: number;
    avgKcal: number | null;
    avgProteinG: number | null;
    avgWaterMl: number | null;
    snackPct: number | null;
    waterDaysMet: number;
    kcalDaysUnder: number;
    proteinDaysMet: number;
  };
  waterTargetMl: number;
  proteinTargetG: number | null;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Everything the FUEL review needs, in one pass.
 *
 * Days with nothing logged stay in the series as zeros but are flagged
 * `logged: false` — a gap is not a zero-calorie day, and averaging over
 * untracked days would quietly flatter every number on the screen.
 */
export function buildFuelStats(periodDays: number): FuelStats {
  const s = getSettings();
  const today = todayISO();
  const from = addDays(today, -(periodDays - 1));

  const rows = db
    .select({
      date: foodEntries.date,
      loggedAt: foodEntries.loggedAt,
      description: foodEntries.description,
      normKey: foodEntries.normKey,
      kcal: foodEntries.kcal,
      proteinG: foodEntries.proteinG,
      carbsG: foodEntries.carbsG,
      fatG: foodEntries.fatG,
      fiberG: foodEntries.fiberG,
      sugarG: foodEntries.sugarG,
      saltG: foodEntries.saltG,
      mealType: foodEntries.mealType,
    })
    .from(foodEntries)
    .where(and(gte(foodEntries.date, from), lte(foodEntries.date, today)))
    .all();

  const water = db
    .select({ date: waterLogs.date, ml: sql<number>`SUM(${waterLogs.ml})` })
    .from(waterLogs)
    .where(and(gte(waterLogs.date, from), lte(waterLogs.date, today)))
    .groupBy(waterLogs.date)
    .all();
  const waterByDate = new Map(water.map((w) => [w.date, w.ml]));

  // ── Per-day ──
  const byDate = new Map<string, DayNutrition>();
  for (let i = 0; i < periodDays; i++) {
    const date = addDays(from, i);
    const day = Math.max(0, daysBetween(s.startDate, date));
    byDate.set(date, {
      date,
      label: date.slice(8) + "." + date.slice(5, 7),
      day,
      kcal: 0,
      kcalAvg7: null,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      saltG: 0,
      mealKcal: 0,
      snackKcal: 0,
      entries: 0,
      waterMl: waterByDate.get(date) ?? 0,
      kcalTarget: kcalTargetForDay(day).kcal,
      logged: false,
    });
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, kcal: 0, entries: 0 }));
  const weekday = WEEKDAY_NAMES.map((name) => ({ name, snackKcal: 0, mealKcal: 0, days: 0 }));
  const snackTally = new Map<string, { description: string; count: number; totalKcal: number }>();

  for (const r of rows) {
    const d = byDate.get(r.date);
    if (!d) continue;

    d.entries++;
    d.logged = true;
    d.kcal += r.kcal ?? 0;
    d.proteinG += r.proteinG ?? 0;
    d.carbsG += r.carbsG ?? 0;
    d.fatG += r.fatG ?? 0;
    d.fiberG += r.fiberG ?? 0;
    d.sugarG += r.sugarG ?? 0;
    d.saltG += r.saltG ?? 0;
    if (r.mealType === "snack") d.snackKcal += r.kcal ?? 0;
    else d.mealKcal += r.kcal ?? 0;

    const dt = new Date(r.loggedAt * 1000);
    hourly[dt.getHours()].kcal += r.kcal ?? 0;
    hourly[dt.getHours()].entries++;

    const wd = new Date(`${r.date}T12:00:00`).getDay();
    if (r.mealType === "snack") weekday[wd].snackKcal += r.kcal ?? 0;
    else weekday[wd].mealKcal += r.kcal ?? 0;

    if (r.mealType === "snack") {
      const t = snackTally.get(r.normKey) ?? { description: r.description, count: 0, totalKcal: 0 };
      t.count++;
      t.totalKcal += r.kcal ?? 0;
      snackTally.set(r.normKey, t);
    }
  }

  const days = [...byDate.values()];

  // Count each weekday only for days that were actually tracked, so the
  // per-weekday averages aren't diluted by days you never logged.
  for (const d of days) {
    if (d.logged) weekday[new Date(`${d.date}T12:00:00`).getDay()].days++;
  }

  // ── Rolling 7-day mean, over logged days only ──
  for (let i = 0; i < days.length; i++) {
    const window = days.slice(Math.max(0, i - 6), i + 1).filter((d) => d.logged);
    days[i].kcalAvg7 =
      window.length > 0
        ? Math.round(window.reduce((a, b) => a + b.kcal, 0) / window.length)
        : null;
  }

  // ── Weeks ──
  const weeks: WeekSummary[] = [];
  for (let start = 0; start < days.length; start += 7) {
    const chunk = days.slice(start, start + 7);
    if (chunk.length === 0) continue;
    const logged = chunk.filter((d) => d.logged);
    const totalKcal = logged.reduce((a, b) => a + b.kcal, 0);
    const snack = logged.reduce((a, b) => a + b.snackKcal, 0);
    weeks.push({
      weekIndex: weeks.length,
      label: `${chunk[0].label} – ${chunk[chunk.length - 1].label}`,
      from: chunk[0].date,
      to: chunk[chunk.length - 1].date,
      daysLogged: logged.length,
      avgKcal: logged.length ? Math.round(totalKcal / logged.length) : null,
      avgProteinG: logged.length
        ? Math.round(logged.reduce((a, b) => a + b.proteinG, 0) / logged.length)
        : null,
      avgWaterMl: chunk.length ? Math.round(chunk.reduce((a, b) => a + b.waterMl, 0) / chunk.length) : null,
      snackPct: totalKcal > 0 ? Math.round((snack / totalKcal) * 100) : null,
      kcalTarget: chunk[chunk.length - 1].kcalTarget,
    });
  }

  const logged = days.filter((d) => d.logged);
  const totalKcal = logged.reduce((a, b) => a + b.kcal, 0);
  const totalSnack = logged.reduce((a, b) => a + b.snackKcal, 0);
  const proteinTarget = phaseForDay(days[days.length - 1]?.day ?? 0).proteinG;

  return {
    days,
    weeks,
    hourly,
    weekday,
    topSnacks: [...snackTally.values()]
      .map((t) => ({ ...t, avgKcal: t.count > 0 ? Math.round(t.totalKcal / t.count) : 0 }))
      .sort((a, b) => b.totalKcal - a.totalKcal)
      .slice(0, 6),
    totals: {
      daysLogged: logged.length,
      daysInPeriod: days.length,
      avgKcal: logged.length ? Math.round(totalKcal / logged.length) : null,
      avgProteinG: logged.length
        ? Math.round(logged.reduce((a, b) => a + b.proteinG, 0) / logged.length)
        : null,
      avgWaterMl: days.length ? Math.round(days.reduce((a, b) => a + b.waterMl, 0) / days.length) : null,
      snackPct: totalKcal > 0 ? Math.round((totalSnack / totalKcal) * 100) : null,
      waterDaysMet: days.filter((d) => d.waterMl >= s.waterTargetMl).length,
      kcalDaysUnder: logged.filter((d) => d.kcal > 0 && d.kcal <= d.kcalTarget).length,
      proteinDaysMet: logged.filter((d) => d.proteinG >= PROTEIN_PER_MEAL_G * 3).length,
    },
    waterTargetMl: s.waterTargetMl,
    proteinTargetG: proteinTarget,
  };
}
