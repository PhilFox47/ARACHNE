/**
 * The first fortnight, and what the rest of the year reads out of it.
 *
 * Two jobs live here:
 *   1. Deciding which of the five baseline patrols falls on a given date. This
 *      is counted in patrols, not weekdays — nobody is obliged to start a
 *      twelve-month plan on a Monday, and a Thursday start should not mean the
 *      baseline opens with conditioning and never tests a press.
 *   2. Reading the logs back out as a position on each progression ladder, so
 *      Phase 1 onwards prescribes the variation you can actually do rather than
 *      the one the document's own athlete could.
 */

import { desc, sql } from "drizzle-orm";
import { db } from "./db";
import { exerciseLogs } from "./db/schema";
import { addDays, dayKeyOf, daysBetween } from "./dates";
import { gateExercise, ownedKeys, upgradeExercise } from "./equipment";
import { getSettings } from "./settings";
import {
  BASELINE_MODE,
  BASELINE_PATROLS,
  LADDERS,
  LADDER_ADVANCE_REPS,
  PHASES,
  TRAINING_DAYS,
  familyOf,
  rungOf,
  sessionFor,
  type BaselinePatrol,
  type MovementFamily,
  type Rung,
  type Session,
} from "./plan";

/** Last day of the baseline fortnight, inclusive. */
export const BASELINE_LAST_DAY = PHASES[0].endDay;

export function baselineEndDate(startDate: string): string {
  return addDays(startDate, BASELINE_LAST_DAY);
}

/**
 * How many training days have already gone by. Every seven-day window holds
 * each weekday exactly once, so this lands on a clean multiple of five at each
 * week boundary whatever day you started on — which is what makes week 2 an
 * exact repeat of week 1 rather than a rotation of it.
 */
function patrolOrdinal(startDate: string, date: string): number | null {
  const day = daysBetween(startDate, date);
  if (day < 0 || day > BASELINE_LAST_DAY) return null;
  if (!TRAINING_DAYS.includes(dayKeyOf(date))) return null;

  let n = 0;
  for (let d = 0; d < day; d++) {
    if (TRAINING_DAYS.includes(dayKeyOf(addDays(startDate, d)))) n++;
  }
  return n;
}

export interface BaselineSlot {
  patrol: BaselinePatrol;
  /** 0 on the first pass, 1 on the repeat week. */
  round: number;
}

/** Which baseline patrol a date carries, or null if it carries none. */
export function baselineSlotFor(startDate: string, date: string): BaselineSlot | null {
  const n = patrolOrdinal(startDate, date);
  if (n === null) return null;
  return {
    patrol: BASELINE_PATROLS[n % BASELINE_PATROLS.length],
    round: Math.floor(n / BASELINE_PATROLS.length),
  };
}

/** The whole fortnight's schedule, for the overview screens. */
export function baselineSchedule(startDate: string): { date: string; slot: BaselineSlot | null }[] {
  return Array.from({ length: BASELINE_LAST_DAY + 1 }, (_, d) => {
    const date = addDays(startDate, d);
    return { date, slot: baselineSlotFor(startDate, date) };
  });
}

// ─────────────────────────────────────────────────────────────
// Reading the logs back
// ─────────────────────────────────────────────────────────────

export interface Standing {
  family: MovementFamily;
  /** Highest ladder rung with a logged set. */
  loggedRung: number;
  /** Best reps at that rung. */
  bestReps: number | null;
  bestSeconds: number | null;
  /** Where the ladder's own advance rule puts you now. */
  rung: number;
  movement: string;
}

interface LogRow {
  exerciseKey: string;
  exerciseName: string;
  bestReps: number | null;
  bestSeconds: number | null;
  lastDate: string;
}

function allBests(): LogRow[] {
  return db
    .select({
      exerciseKey: exerciseLogs.exerciseKey,
      exerciseName: sql<string>`MAX(${exerciseLogs.exerciseName})`,
      bestReps: sql<number | null>`MAX(${exerciseLogs.reps})`,
      bestSeconds: sql<number | null>`MAX(${exerciseLogs.seconds})`,
      lastDate: sql<string>`MAX(${exerciseLogs.date})`,
    })
    .from(exerciseLogs)
    .groupBy(exerciseLogs.exerciseKey)
    .orderBy(desc(sql`MAX(${exerciseLogs.date})`))
    .all();
}

/**
 * Where every family currently stands, read out of everything ever logged
 * rather than the baseline fortnight alone. The document's advance rule — "only
 * move on at a clean 3×12" — then applies continuously instead of once: the
 * ladder keeps climbing all year on the same evidence it started from.
 */
export function standings(): Map<MovementFamily, Standing> {
  const out = new Map<MovementFamily, Standing>();

  for (const row of allBests()) {
    const family = familyOf(row.exerciseName);
    if (family === null || !LADDERS[family]) continue;
    const loggedRung = rungOf(family, row.exerciseName);
    if (loggedRung === null) continue;

    const prev = out.get(family);
    // A single hard set at a higher rung outranks a lot of easy ones below it,
    // which is exactly how you'd judge it in a gym.
    if (prev && prev.loggedRung >= loggedRung) continue;

    const ready = (row.bestReps ?? 0) >= LADDER_ADVANCE_REPS;
    out.set(family, {
      family,
      loggedRung,
      bestReps: row.bestReps,
      bestSeconds: row.bestSeconds,
      rung: Math.min(loggedRung + (ready ? 1 : 0), LADDERS[family]!.length - 1),
      movement: row.exerciseName,
    });
  }

  return out;
}

export interface Placement {
  name: string;
  dose: string;
  note: string | null;
  /** Set when the ladder moved you off the plan's own variation. */
  movedFrom: string | null;
}

/**
 * Puts a prescribed movement on the rung your logs justify.
 *
 * Clamped to one rung either side of what the plan asked for. The plan owns the
 * shape of the year and the baseline owns your starting point; letting one bad
 * reading jump you four rungs would be the tail wagging the dog, and letting it
 * jump you none would make the fortnight pointless.
 */
export function placeOnLadder(
  name: string,
  dose: string,
  note: string | null,
  st: Map<MovementFamily, Standing>,
): Placement {
  const unchanged: Placement = { name, dose, note, movedFrom: null };

  const family = familyOf(name);
  if (family === null) return unchanged;

  const ladder: Rung[] | undefined = LADDERS[family];
  if (!ladder) return unchanged;

  const planRung = rungOf(family, name);
  if (planRung === null) return unchanged;

  const standing = st.get(family);
  if (!standing) return unchanged;

  const target = Math.max(planRung - 1, Math.min(planRung + 1, standing.rung));
  if (target === planRung) return unchanged;

  const rung = ladder[target];
  const reason =
    target > planRung
      ? `Moved up from ${ladder[planRung].name.toLowerCase()} — you logged ${standing.bestReps ?? "a set"}${standing.bestReps ? " reps" : ""} on ${standing.movement.toLowerCase()}.`
      : `Eased down from ${ladder[planRung].name.toLowerCase()} until the reps are there.`;

  return {
    name: rung.name,
    dose: rung.dose,
    note: rung.note ? `${rung.note} ${reason}` : reason,
    movedFrom: name,
  };
}

/**
 * Holds have no variation ladder, so the only way to personalise them is the
 * number itself. A working set at 60% of a tested maximum is the ordinary
 * prescription for a hold, and the cap stops one heroic baseline turning every
 * plank for the next year into a max attempt.
 */
export const HOLD_WORKING_FRACTION = 0.6;
export const HOLD_MAX_MULTIPLE = 2;

export function seedHoldTarget(planSeconds: number | null, baselineBestSec: number | null): number | null {
  if (planSeconds === null) return null;
  if (baselineBestSec === null || baselineBestSec <= 0) return planSeconds;
  const working = Math.round(baselineBestSec * HOLD_WORKING_FRACTION);
  return Math.max(planSeconds, Math.min(working, planSeconds * HOLD_MAX_MULTIPLE));
}

/** Best hold ever logged for a movement, used to seed the working target. */
export function bestSecondsFor(keys: string[]): Map<string, number> {
  if (keys.length === 0) return new Map();
  const rows = db
    .select({
      exerciseKey: exerciseLogs.exerciseKey,
      bestSeconds: sql<number | null>`MAX(${exerciseLogs.seconds})`,
    })
    .from(exerciseLogs)
    .groupBy(exerciseLogs.exerciseKey)
    .all();
  const want = new Set(keys);
  return new Map(
    rows
      .filter((r) => want.has(r.exerciseKey) && r.bestSeconds !== null)
      .map((r) => [r.exerciseKey, r.bestSeconds as number]),
  );
}

export interface ProbeComparison {
  key: string;
  name: string;
  metric: "reps" | "time";
  first: number | null;
  second: number | null;
  delta: number | null;
  /** Change as a share of the first reading. */
  pct: number | null;
}

/**
 * Week 1 against week 2, movement by movement.
 *
 * This is the point of running the sweep twice. A big jump usually means the
 * first pass was cautious rather than that seven days made you stronger, and a
 * drop usually means the first pass went too near failure — either way the
 * second number is the one worth building on, and you can only tell by looking
 * at both.
 *
 * Read from the logs rather than from the probe list, so a movement that got
 * substituted for missing kit still appears under whatever you actually did.
 */
export function baselineComparison(startDate: string): ProbeComparison[] {
  const w0End = addDays(startDate, 6);
  const w1Start = addDays(startDate, 7);
  const w1End = addDays(startDate, BASELINE_LAST_DAY);

  const inWeek = (from: string, to: string, col: string) =>
    sql<number | null>`MAX(CASE WHEN ${exerciseLogs.date} BETWEEN ${from} AND ${to} THEN ${sql.raw(col)} END)`;

  const rows = db
    .select({
      key: exerciseLogs.exerciseKey,
      name: sql<string>`MAX(${exerciseLogs.exerciseName})`,
      firstReps: inWeek(startDate, w0End, "reps"),
      firstSec: inWeek(startDate, w0End, "seconds"),
      secondReps: inWeek(w1Start, w1End, "reps"),
      secondSec: inWeek(w1Start, w1End, "seconds"),
    })
    .from(exerciseLogs)
    .where(sql`${exerciseLogs.date} >= ${startDate} AND ${exerciseLogs.date} <= ${w1End}`)
    .groupBy(exerciseLogs.exerciseKey)
    .all();

  const out: ProbeComparison[] = [];
  for (const r of rows) {
    const timed = r.firstSec !== null || r.secondSec !== null;
    const first = timed ? r.firstSec : r.firstReps;
    const second = timed ? r.secondSec : r.secondReps;
    if (first === null && second === null) continue;
    const delta = first !== null && second !== null ? second - first : null;
    out.push({
      key: r.key,
      name: r.name,
      metric: timed ? "time" : "reps",
      first,
      second,
      delta,
      pct: delta !== null && first ? Math.round((delta / first) * 100) : null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export interface StartingRung {
  family: MovementFamily;
  /** The variation the ladder puts you on for Phase 1. */
  movement: string;
  /** What you logged to earn it. */
  evidence: string;
  /** How far up the ladder that is. */
  rung: number;
  rungs: number;
}

/**
 * What the fortnight concluded: the rung each ladder now starts you on. This is
 * the deliverable of the whole two weeks, so it's worth stating outright rather
 * than leaving it to be inferred from a session that quietly reads differently.
 */
export function startingRungs(): StartingRung[] {
  const out: StartingRung[] = [];
  for (const [family, s] of standings()) {
    const ladder = LADDERS[family];
    if (!ladder) continue;
    const best =
      s.bestReps !== null ? `${s.bestReps} reps` : s.bestSeconds !== null ? `${s.bestSeconds} s` : "logged";
    out.push({
      family,
      movement: ladder[s.rung].name,
      evidence: `${best} on ${s.movement.toLowerCase()}`,
      rung: s.rung,
      rungs: ladder.length,
    });
  }
  return out;
}

/**
 * Coverage report — how much of the movement pool the fortnight has actually
 * read.
 *
 * Counted against the movements you can perform, not the full list: a dead hang
 * with no bar is dropped rather than substituted, and leaving it in the total
 * would show a permanent shortfall you have no way to close.
 */
export function baselineCoverage(startDate: string): {
  probes: number;
  measured: number;
  missing: { patrol: number; name: string }[];
} {
  const from = startDate;
  const to = baselineEndDate(startDate);
  const rows = db
    .select({ exerciseKey: exerciseLogs.exerciseKey })
    .from(exerciseLogs)
    .where(sql`${exerciseLogs.date} >= ${from} AND ${exerciseLogs.date} <= ${to}`)
    .all();
  const done = new Set(rows.map((r) => r.exerciseKey));
  const owned = ownedKeys(getSettings().equipment);

  const key = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

  const missing: { patrol: number; name: string }[] = [];
  let probes = 0;
  for (const p of BASELINE_PATROLS) {
    for (const probe of p.probes) {
      const gate = gateExercise(probe.name, owned);
      if (!gate.allowed && gate.substitute === null) continue;
      const name = gate.allowed ? probe.name : gate.substitute!.name;
      const up = upgradeExercise(name, "", owned);
      probes++;
      if (!done.has(key(up ? up.name : name))) missing.push({ patrol: p.index, name: up ? up.name : name });
    }
  }
  return { probes, measured: probes - missing.length, missing };
}

/**
 * The baseline patrol dressed as an ordinary `Session`, so every screen that
 * already knows how to render a training day renders these too.
 *
 * Warm-up and cooldown are borrowed from whichever weekday session the patrol
 * mirrors — those don't need a baseline, and writing a second set of arm circles
 * would only be a second place for them to drift.
 */
export function baselineSession(startDate: string, date: string): Session | null {
  const slot = baselineSlotFor(startDate, date);
  if (slot === null) return null;

  const p = slot.patrol;
  const mirror = sessionFor(1, p.mirrors);

  return {
    dayKey: dayKeyOf(date),
    title: p.title,
    blurb: slot.round === 0 ? p.blurb : BASELINE_MODE.repeatRule,
    warmup: mirror?.warmup,
    cooldown: mirror?.cooldown,
    main: p.probes.map((probe) => ({
      name: probe.name,
      dose: probe.metric === "time" ? "2× max hold" : `${probe.sets}× max`,
      note: probe.how,
    })),
    // Left as a placeholder the page replaces with the games you own, exactly
    // as it does for Thursday.
    options: p.pickOne ? ["Pick one"] : undefined,
    rule: p.rule,
  };
}
