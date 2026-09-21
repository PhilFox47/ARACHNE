/**
 * What the logs say about each movement — the one place that reads them.
 *
 * Two things live here because they are the same question asked twice:
 *
 *   Mastery is not a number you hit once, and it is not a good fortnight either.
 *   The document's rule is "only advance at a clean 3×12", and a single good set
 *   is a good day. A movement is mastered when enough sets cleared the bar in one
 *   session, on enough separate sessions, spread across enough separate calendar
 *   weeks — and a session where you reported that something hurt does not count
 *   towards any of it, because the point of the bar is that the movement is under
 *   control, not that the number happened.
 *
 *   The week count is the part that cannot be rushed. Sessions can be crammed;
 *   weeks cannot. A movement trained twice a week banks six clean sessions in
 *   three weeks, which is a good three weeks rather than a movement you own — and
 *   there is no sense being handed a complicated push-up while the elevated one
 *   is still a fight.
 *
 *   A reset draws a line rather than deleting anything. Sets logged before it
 *   stop counting toward the tree; they stay in the log, because the log is the
 *   record of what you actually did and that should survive a change of mind
 *   about how to read it. Delete the reset row and everything comes back.
 */

import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { exerciseLogs, movementFeedback, skillResets } from "./db/schema";
import { dayOf, mondayOf } from "./dates";
import type { Verdict } from "./feedback";
import {
  findMovement,
  masterySessions,
  masterySets,
  masteryWeeks,
  movementKey,
  setClears,
  type Movement,
  type MovementFamily,
} from "./movements";

export interface MovementRecord {
  movement: Movement;
  /** Best single set, whichever metric the movement uses. */
  bestReps: number | null;
  bestSeconds: number | null;
  /** Heaviest set still counting, for the rungs whose bar names a load. */
  bestWeightKg: number | null;
  /** Sets that counted — after any reset, and excluding nothing else. */
  sets: number;
  sessions: number;
  lastDate: string | null;
  /** Most sets clearing the bar within a single session. */
  bestCleanSets: number;
  /** Sessions in which `masterAt.sets` sets cleared the bar. */
  cleanSessions: number;
  /** Distinct calendar weeks those clean sessions fell in. */
  cleanWeeks: number;
  mastered: boolean;
  /** 0–1 toward mastery, counting whichever requirement is furthest away. */
  progress: number;
  /** Times you reported this movement hurting. */
  painReports: number;
}

interface LogRow {
  key: string;
  name: string;
  date: string;
  reps: number | null;
  seconds: number | null;
  /** Read because a loaded rung's bar is reps *and* kilograms. */
  weightKg: number | null;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────
// Resets
// ─────────────────────────────────────────────────────────────

export interface Cutoffs {
  /** Applies to every strand. 0 when never reset. */
  global: number;
  byFamily: Map<MovementFamily, number>;
}

export function cutoffs(): Cutoffs {
  const rows = db.select().from(skillResets).all();
  let global = 0;
  const byFamily = new Map<MovementFamily, number>();
  for (const r of rows) {
    if (r.family === null) global = Math.max(global, r.resetAt);
    else {
      const f = r.family as MovementFamily;
      byFamily.set(f, Math.max(byFamily.get(f) ?? 0, r.resetAt));
    }
  }
  return { global, byFamily };
}

/** A movement outside the catalogue has no strand, so only a whole-tree reset reaches it. */
export function cutoffFor(c: Cutoffs, family: MovementFamily | null): number {
  return Math.max(c.global, family === null ? 0 : (c.byFamily.get(family) ?? 0));
}

/** True when anything has been reset — for the copy on THE WEB. */
export function hasResets(): boolean {
  const c = cutoffs();
  return c.global > 0 || c.byFamily.size > 0;
}

export interface ResetSummary {
  /** Null means the whole tree. */
  family: MovementFamily | null;
  resetAt: number;
  /** The day the line was drawn, formatted here so the client renders it as sent. */
  since: string;
}

/**
 * The most recent line drawn on each strand, newest first.
 *
 * A strand whose own line sits under a later whole-tree reset is left out: it is
 * already covered, and listing it twice would suggest two things to undo.
 */
export function resetSummary(): ResetSummary[] {
  const c = cutoffs();
  const at = (resetAt: number) => dayOf(new Date(resetAt * 1000));

  const out: ResetSummary[] = [];
  if (c.global > 0) out.push({ family: null, resetAt: c.global, since: at(c.global) });
  for (const [family, resetAt] of c.byFamily) {
    if (resetAt > c.global) out.push({ family, resetAt, since: at(resetAt) });
  }
  return out.sort((a, b) => b.resetAt - a.resetAt);
}

// ─────────────────────────────────────────────────────────────
// Records
// ─────────────────────────────────────────────────────────────

/**
 * Read as rows and aggregated here rather than grouped in SQL.
 *
 * Mastery is a per-session question — "did two sets in one day clear the bar" —
 * and a reset cutoff differs per strand, so neither can be expressed as one
 * GROUP BY without the catalogue. A year of training is a few thousand rows;
 * the simplicity is worth more than the query.
 */
export function movementRecords(): Map<string, MovementRecord> {
  const rows = db
    .select({
      key: exerciseLogs.exerciseKey,
      name: exerciseLogs.exerciseName,
      date: exerciseLogs.date,
      reps: exerciseLogs.reps,
      seconds: exerciseLogs.seconds,
      weightKg: exerciseLogs.weightKg,
      createdAt: exerciseLogs.createdAt,
    })
    .from(exerciseLogs)
    .orderBy(asc(exerciseLogs.date))
    .all() as LogRow[];

  const cuts = cutoffs();
  const pain = painDays();

  // movement name → date → the sets logged that day
  const byMovement = new Map<string, Map<string, LogRow[]>>();

  for (const row of rows) {
    const movement = findMovement(row.name);
    if (!movement) continue;
    if (row.createdAt <= cutoffFor(cuts, movement.family)) continue;

    const days = byMovement.get(movement.name) ?? new Map<string, LogRow[]>();
    const day = days.get(row.date) ?? [];
    day.push(row);
    days.set(row.date, day);
    byMovement.set(movement.name, days);
  }

  const out = new Map<string, MovementRecord>();

  for (const [name, days] of byMovement) {
    const movement = findMovement(name)!;
    const needSets = masterySets(movement);
    const needSessions = masterySessions(movement);
    const needWeeks = masteryWeeks(movement);

    let bestReps: number | null = null;
    let bestSeconds: number | null = null;
    let bestWeightKg: number | null = null;
    let sets = 0;
    let bestCleanSets = 0;
    let cleanSessions = 0;
    let lastDate: string | null = null;
    // Keyed by the week's Monday, so "twice this week" counts once towards the
    // spread however many clean sessions it contained.
    const cleanWeekKeys = new Set<string>();

    for (const [date, daySets] of days) {
      sets += daySets.length;
      if (lastDate === null || date > lastDate) lastDate = date;

      let clean = 0;
      for (const s of daySets) {
        if (s.reps !== null) bestReps = Math.max(bestReps ?? 0, s.reps);
        if (s.seconds !== null) bestSeconds = Math.max(bestSeconds ?? 0, s.seconds);
        if (s.weightKg !== null) bestWeightKg = Math.max(bestWeightKg ?? 0, s.weightKg);
        if (setClears(movement, s.reps, s.seconds, s.weightKg)) clean++;
      }

      // A day you said it hurt is not a day it was under control, whatever the
      // reps say. That is the whole reason the question is asked.
      const hurt = pain.get(movementKey(name))?.has(date) ?? false;
      if (!hurt) {
        bestCleanSets = Math.max(bestCleanSets, clean);
        if (clean >= needSets) {
          cleanSessions++;
          cleanWeekKeys.add(mondayOf(date));
        }
      }
    }

    const cleanWeeks = cleanWeekKeys.size;
    const mastered = cleanSessions >= needSessions && cleanWeeks >= needWeeks;

    // Whichever requirement is furthest away is the one shown, because that is
    // the one you are actually waiting on. A partial session's worth of credit
    // for sets cleared today keeps the bar from reading zero on a good day.
    const share = (have: number, need: number) => (need <= 0 ? 1 : have / need);
    const toward = Math.min(share(cleanSessions, needSessions), share(cleanWeeks, needWeeks));
    const partial = Math.min(1, bestCleanSets / Math.max(1, needSets));
    const progress = mastered
      ? 1
      : Math.min(0.99, (toward * needSessions + partial) / (needSessions + 1));

    out.set(name, {
      movement,
      bestReps,
      bestSeconds,
      bestWeightKg,
      sets,
      sessions: days.size,
      lastDate,
      bestCleanSets,
      cleanSessions,
      cleanWeeks,
      mastered,
      progress,
      painReports: pain.get(movementKey(name))?.size ?? 0,
    });
  }

  return out;
}

/**
 * How many separate days a movement was reported as hurting.
 *
 * Not filtered by a reset. A reset says "read my numbers from here", and a
 * number is a claim about a good day; "this shape hurts me" is not. Wanting to
 * re-place yourself on the ladder is not a reason to make the app forget that
 * something hurt twice — that is the one signal it cannot recover on its own.
 */
export function painCounts(): Map<string, number> {
  return new Map([...painDays()].map(([key, dates]) => [key, dates.size]));
}

/**
 * What was said about each movement on one day.
 *
 * Read by the session screen so the question shows its own answer. Asked once
 * ever this barely mattered; asked every session it is the whole difference
 * between a question and a nag.
 */
export function feedbackFor(date: string): { exerciseKey: string; verdict: Verdict }[] {
  return db
    .select({ exerciseKey: movementFeedback.exerciseKey, verdict: movementFeedback.verdict })
    .from(movementFeedback)
    .where(eq(movementFeedback.date, date))
    .all();
}

/**
 * The most recent answer for every movement, with the day it was given.
 *
 * One query rather than one per movement: the progression asks this for every
 * exercise in a session, and the session screen is the hottest path in the app.
 * The date travels with it so the caller can check the answer belongs to the
 * session it is about to progress from — feedback from three weeks ago should
 * not decide what today asks for.
 */
export function latestVerdicts(): Map<string, { date: string; verdict: Verdict }> {
  const rows = db
    .select({ key: movementFeedback.exerciseKey, date: movementFeedback.date, verdict: movementFeedback.verdict })
    .from(movementFeedback)
    .orderBy(asc(movementFeedback.date))
    .all();

  const out = new Map<string, { date: string; verdict: Verdict }>();
  // Ascending, so the last write for a key is the newest.
  for (const r of rows) out.set(r.key, { date: r.date, verdict: r.verdict });
  return out;
}

/**
 * Every answer ever given, keyed by "exerciseKey|date".
 *
 * For handing a session's history to the model with how each one felt attached.
 * A flat map rather than a nested one because the caller already has both parts
 * of the key and wants a single lookup per row.
 */
export function verdictsByKeyDate(): Map<string, Verdict> {
  const rows = db
    .select({ key: movementFeedback.exerciseKey, date: movementFeedback.date, verdict: movementFeedback.verdict })
    .from(movementFeedback)
    .all();
  return new Map(rows.map((r) => [`${r.key}|${r.date}`, r.verdict]));
}

/** Dates on which each movement was reported as hurting. */
function painDays(): Map<string, Set<string>> {
  const rows = db
    .select({ key: movementFeedback.exerciseKey, date: movementFeedback.date, verdict: movementFeedback.verdict })
    .from(movementFeedback)
    .all();

  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.verdict !== "painful") continue;
    const set = out.get(r.key) ?? new Set<string>();
    set.add(r.date);
    out.set(r.key, set);
  }
  return out;
}
