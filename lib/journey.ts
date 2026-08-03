import { and, asc, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { exerciseLogs, sessions, trials, weights } from "./db/schema";
import { addDays, daysBetween, todayISO } from "./dates";
import { getSettings } from "./settings";
import {
  TRAINING_DAYS,
  sessionFor,
  type Checkpoint,
  type Phase,
  type PhaseId,
} from "./plan";
import { courseCheckpoints, coursePhases, courseTotalDays } from "./course";

export interface PhaseProgress {
  phase: Phase;
  startDate: string;
  endDate: string;
  status: "done" | "current" | "ahead";
  /** 0–1 through this phase. */
  progress: number;
  daysTotal: number;
  daysElapsed: number;
  sessionsDone: number;
  sessionsPossible: number;
  setsLogged: number;
  volumeKg: number;
  weightStart: number | null;
  weightEnd: number | null;
  weightDelta: number | null;
}

export interface CheckpointProgress {
  checkpoint: Checkpoint;
  date: string;
  reached: boolean;
  weightActual: number | null;
  weightTarget: number;
  weightMet: boolean | null;
  trialScore: number | null;
}

export interface Journey {
  day: number;
  totalDays: number;
  progress: number;
  phases: PhaseProgress[];
  checkpoints: CheckpointProgress[];
  totals: {
    sessions: number;
    sets: number;
    volumeKg: number;
    weightLost: number | null;
    trials: number;
  };
}

/** Rolling 7-day mean nearest a date, so a single noisy reading isn't the verdict. */
function averageNear(rows: { date: string; weightKg: number }[], date: string): number | null {
  const from = addDays(date, -6);
  const win = rows.filter((r) => r.date >= from && r.date <= date);
  if (win.length === 0) {
    const before = rows.filter((r) => r.date <= date);
    return before.length ? before[before.length - 1].weightKg : null;
  }
  return Math.round((win.reduce((s, r) => s + r.weightKg, 0) / win.length) * 10) / 10;
}

export function buildJourney(): Journey {
  const settings = getSettings();
  const today = todayISO();
  const day = Math.max(daysBetween(settings.startDate, today), 0);

  const allWeights = db
    .select({ date: weights.date, weightKg: weights.weightKg })
    .from(weights)
    .orderBy(asc(weights.date))
    .all();

  const phases: PhaseProgress[] = coursePhases().map((phase) => {
    const startDate = addDays(settings.startDate, phase.startDay);
    const endDate = addDays(settings.startDate, phase.endDay);
    const daysTotal = phase.endDay - phase.startDay + 1;

    const status: PhaseProgress["status"] =
      day > phase.endDay ? "done" : day >= phase.startDay ? "current" : "ahead";

    const daysElapsed =
      status === "done" ? daysTotal : status === "current" ? day - phase.startDay + 1 : 0;

    const agg = db
      .select({
        done: sql<number>`SUM(CASE WHEN ${sessions.completed} THEN 1 ELSE 0 END)`,
        sets: sql<number>`(SELECT COUNT(*) FROM exercise_logs WHERE exercise_logs.date BETWEEN ${startDate} AND ${endDate})`,
        volume: sql<number>`(SELECT COALESCE(SUM(reps * weight_kg), 0) FROM exercise_logs WHERE exercise_logs.date BETWEEN ${startDate} AND ${endDate} AND weight_kg IS NOT NULL)`,
      })
      .from(sessions)
      .where(and(gte(sessions.date, startDate), lte(sessions.date, endDate)))
      .get();

    // Five training days a week, prorated to how much of the phase has elapsed.
    const sessionsPossible = Math.round((daysElapsed / 7) * TRAINING_DAYS.length);

    const weightStart = status === "ahead" ? null : averageNear(allWeights, startDate);
    const weightEnd =
      status === "ahead" ? null : averageNear(allWeights, status === "current" ? today : endDate);

    return {
      phase,
      startDate,
      endDate,
      status,
      progress: daysTotal > 0 ? Math.min(1, daysElapsed / daysTotal) : 0,
      daysTotal,
      daysElapsed,
      sessionsDone: agg?.done ?? 0,
      sessionsPossible,
      setsLogged: agg?.sets ?? 0,
      volumeKg: Math.round(agg?.volume ?? 0),
      weightStart,
      weightEnd,
      weightDelta:
        weightStart !== null && weightEnd !== null
          ? Math.round((weightEnd - weightStart) * 10) / 10
          : null,
    };
  });

  const checkpoints: CheckpointProgress[] = courseCheckpoints().map((cp) => {
    const date = addDays(settings.startDate, cp.day);
    const reached = day >= cp.day;
    const weightActual = reached ? averageNear(allWeights, date) : null;
    const trial = db
      .select({ score: trials.score })
      .from(trials)
      .where(and(gte(trials.date, addDays(date, -20)), lte(trials.date, addDays(date, 10))))
      .get();

    return {
      checkpoint: cp,
      date,
      reached,
      weightActual,
      weightTarget: cp.weightKg,
      // Under target is ahead of plan, so "met" is <=, not >=.
      weightMet: weightActual === null ? null : weightActual <= cp.weightKg + 0.5,
      trialScore: trial?.score ?? null,
    };
  });

  const totals = db
    .select({
      sessions: sql<number>`(SELECT COUNT(*) FROM sessions WHERE completed = 1)`,
      sets: sql<number>`(SELECT COUNT(*) FROM exercise_logs)`,
      volume: sql<number>`(SELECT COALESCE(SUM(reps * weight_kg), 0) FROM exercise_logs WHERE weight_kg IS NOT NULL)`,
      trials: sql<number>`(SELECT COUNT(*) FROM trials)`,
    })
    .from(sessions)
    .get();

  const firstAvg = allWeights.length ? averageNear(allWeights, allWeights[0].date) : null;
  const lastAvg = allWeights.length ? averageNear(allWeights, today) : null;

  return {
    day,
    totalDays: courseTotalDays(),
    progress: Math.min(1, day / courseTotalDays()),
    phases,
    checkpoints,
    totals: {
      sessions: totals?.sessions ?? 0,
      sets: totals?.sets ?? 0,
      volumeKg: Math.round(totals?.volume ?? 0),
      weightLost:
        firstAvg !== null && lastAvg !== null ? Math.round((firstAvg - lastAvg) * 10) / 10 : null,
      trials: totals?.trials ?? 0,
    },
  };
}

/** Movements that first appear in a given phase — the "unlocks" ahead of you. */
export function newMovementsIn(phaseId: PhaseId): string[] {
  const out: string[] = [];
  for (const dk of TRAINING_DAYS) {
    const s = sessionFor(phaseId, dk);
    if (!s) continue;
    for (const e of [...s.main, ...(s.cooldown ?? [])]) {
      if (e.since === phaseId) out.push(e.name);
    }
  }
  return [...new Set(out)];
}
