/**
 * Turns the plan's structural guideline into a concrete, personalised
 * prescription — and records what actually happened.
 *
 * Division of authority, deliberately:
 *   lib/plan.ts  — structure. Which day is which session, which phase you're
 *                  in, which movements belong to it, the calorie and
 *                  checkpoint targets. Read from the plan document, never
 *                  written by a model.
 *   here         — prescription. How many sets, how many reps, how much
 *                  weight, and when to progress. Adapts to what you logged.
 *
 * A model can make you add 2 kg to a goblet squat. It cannot decide that
 * Wednesday is now a push day or that month 12 wants 30 push-ups.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { exerciseLogs, foodEntries, sessionPlans, sessions } from "./db/schema";
import { addDays } from "./dates";
import { getHqStats } from "./stats";
import { apiKey, baseUrl } from "./nanogpt";
import { activeVisionModel, getSettings } from "./settings";
import { equipmentSummary, gateExercise, ownedKeys, upgradeExercise } from "./equipment";
import {
  isBaselinePhase,
  roundsForWeek,
  sessionFor,
  type DayKey,
  type Exercise,
  type PhaseId,
} from "./plan";
import { findMovement, ladder, masteryLabel, type Movement, type MovementFamily } from "./movements";
import {
  baselineEndDate,
  baselineSlotFor,
  bestSecondsFor,
  headroomForPhase,
  lockedBy,
  placeOnLadder,
  seedHoldTarget,
  standings,
  sweepMovement,
  type Placement,
  type Standing,
} from "./baseline";
import { stripFences } from "./vision";

export type Metric = "reps" | "time";

export interface PrescribedExercise {
  key: string;
  name: string;
  sets: number;
  metric: Metric;
  /** Display range straight from the plan, e.g. "8–12". */
  repRange: string | null;
  /** Concrete suggestion to prefill each set with. */
  targetReps: number | null;
  targetSeconds: number | null;
  targetWeightKg: number | null;
  note: string | null;
  perSide: boolean;
  /** Whether to show a load field by default. Always revealable. */
  loaded: boolean;
  /** Set when equipment gating replaced the plan's movement. */
  substitutedFrom: string | null;
  /**
   * You have never logged this movement. The form asks once how it felt — a
   * question asked every session is a question that stops being answered.
   */
  firstTime?: boolean;
}

/**
 * Bodyweight movements outnumber loaded ones in this plan, and a kg box on
 * every plank row is friction on the screen that most needs none. The field is
 * still one tap away when you do start adding load.
 */
const LOADED_PATTERN =
  /dumbbell|goblet|kettlebell|barbell|weighted|romanian|jefferson|lateral raise|shoulder press|curl|row\b/i;

export function looksLoaded(name: string): boolean {
  return LOADED_PATTERN.test(name);
}

export interface Prescription {
  date: string;
  dayKey: DayKey;
  phase: PhaseId;
  source: "ai" | "plan";
  model: string | null;
  exercises: PrescribedExercise[];
  /**
   * Movements the plan asked for and the tree is holding back, with the reason.
   *
   * Shown rather than silently dropped: a session that quietly loses the
   * shoulder roll looks like a bug, and "this is waiting on 30 s of plank" is
   * both the explanation and the next thing to go and do.
   */
  locked: LockedOut[];
}

export interface LockedOut {
  name: string;
  why: string;
}

export function exerciseKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reads the plan's dose strings — "8–12", "3× 45 s", "10 per side",
 * "5× 5 s" — into something a form can prefill.
 */
export function parseDose(
  dose: string,
  defaultSets: number,
  baseline = false,
  /**
   * The catalogue's metric for this movement, which overrides what the wording
   * of the dose looks like.
   *
   * Without it the dead hang was logged in reps: its dose is "3× to just short
   * of letting go", which contains no unit for the sniffer to find, so it fell
   * through to reps — and a hold recorded in reps can never clear a bar written
   * in seconds. The pulling strand sat at rung one for the entire year because
   * of a regex.
   */
  metric?: Metric,
): {
  sets: number;
  metric: Metric;
  repRange: string | null;
  reps: number | null;
  seconds: number | null;
  perSide: boolean;
} {
  const d = dose.trim();
  const perSide = /per side/i.test(d);

  // Leading "3×" or "5×" fixes the set count.
  const setMatch = d.match(/^(\d+)\s*[×x]\s*/i);
  const sets = setMatch ? Number(setMatch[1]) : defaultSets;
  const rest = setMatch ? d.slice(setMatch[0].length) : d;

  const isTime = metric ? metric === "time" : /\bs\b|\bsec|\bmin/i.test(rest);
  const range = rest.match(/(\d+)\s*[–-]\s*(\d+)/);
  const single = rest.match(/(\d+)/);

  if (isTime) {
    // Baseline takes the bottom of the range; every other phase takes the top.
    const secs = range ? Number(baseline ? range[1] : range[2]) : single ? Number(single[1]) : null;
    return {
      sets,
      metric: "time",
      repRange: range ? `${range[1]}–${range[2]} s` : secs !== null ? `${secs} s` : null,
      reps: null,
      seconds: secs,
      perSide,
    };
  }

  const reps = range ? Number(range[1]) : single ? Number(single[1]) : null;
  return {
    sets,
    metric: "reps",
    repRange: range ? `${range[1]}–${range[2]}` : reps !== null ? String(reps) : null,
    reps,
    seconds: null,
    perSide,
  };
}

/** The plan's own prescription, used as the baseline and as the AI fallback. */
export function baselinePrescription(
  phase: PhaseId,
  dayKey: DayKey,
  weekIdx: number,
  date: string,
): Prescription {
  const settings = getSettings();
  const owned = ownedKeys(settings.equipment);

  if (isBaselinePhase(phase)) {
    return sweepPrescription(settings.startDate, date, dayKey, phase, owned);
  }

  const session = sessionFor(phase, dayKey);
  const rounds = roundsForWeek(weekIdx);
  const source: Exercise[] = session ? [...session.main, ...(session.extras ?? [])] : [];

  // Where the ladders currently put you, as of this session's date rather than
  // the wall clock. Computed once for the whole session — it's one grouped
  // query, and it must not change between two exercises.
  const st = standings(date);
  const everLogged = loggedKeys();

  const exercises: PrescribedExercise[] = [];
  const locked: LockedOut[] = [];
  const seen = new Set<string>();
  // Rungs already handed out this session, per strand. Wednesday names three
  // squat-family movements and Friday names two crawls; without this they all
  // place onto the same rung and the session silently loses exercises.
  const usedTiers = new Map<MovementFamily, Set<number>>();
  const headroom = headroomForPhase(phase);

  for (const e of source) {
    // Ladder placement runs before gating, so the equipment rules are applied
    // to the variation you'll actually be doing rather than the one the plan
    // named for a beginner you may no longer be.
    let placed = placeOnLadder(e.name, e.dose, e.note ?? null, st, headroom);

    // A strand that is shut at the bottom is left out rather than swapped for
    // something off another strand. The plan puts the shoulder roll on your
    // first Friday and cartwheels on a later one; neither should appear before
    // the thing underneath it exists, and neither has an easier self to offer.
    if (placed.blocked) {
      locked.push({ name: e.name, why: placed.blocked.why });
      continue;
    }

    // Two plan entries from one strand collapse onto one rung as soon as your
    // standing is below both of them — the plan's goblet squat, Bulgarian split
    // squat and pistol progression all become a split squat, and two of the
    // three vanish. Step down to the next rung nobody has been given instead:
    // three squat-family movements is what the session was written to contain,
    // and an easier one still trains the pattern.
    const stepped = stepDownToFree(placed, usedTiers, st);
    if (stepped === null) continue;
    placed = stepped;

    // Gate before prescribing. Opening a session and finding work you
    // physically cannot do is worse than a substitution.
    const gate = gateExercise(placed.name, owned);
    if (!gate.allowed && gate.substitute === null) continue;

    let use = gate.allowed
      ? { name: placed.name, dose: placed.dose, note: placed.note }
      : { name: gate.substitute!.name, dose: gate.substitute!.dose, note: gate.substitute!.note };

    // Gating only goes down. Owning better kit adds a line about how to load
    // the movement — it never changes which movement, or which rung, this is.
    const up = upgradeExercise(use.name, owned);
    if (up) use = { ...use, note: use.note ? `${use.note} ${up.note}` : up.note };

    const key = exerciseKey(use.name);
    // Sets are keyed by movement, so the same movement twice in one session
    // would have its logs overwrite each other. A substitution that lands on
    // something already prescribed is simply dropped.
    if (seen.has(key)) continue;
    seen.add(key);

    const p = parseDose(use.dose, rounds, false, findMovement(use.name)?.metric);
    exercises.push({
      key,
      name: use.name,
      sets: p.sets,
      metric: p.metric,
      repRange: p.repRange,
      targetReps: p.reps,
      targetSeconds: p.seconds,
      targetWeightKg: null,
      note: use.note,
      perSide: p.perSide,
      loaded: looksLoaded(use.name),
      substitutedFrom: use.name === e.name ? null : e.name,
      firstTime: !everLogged.has(key),
    });
  }

  return {
    date,
    dayKey,
    phase,
    source: "plan",
    model: null,
    exercises: seedHolds(exercises),
    locked,
  };
}

/**
 * Moves a placement down its strand until it lands on a rung this session has
 * not already handed out.
 *
 * Returns null when every rung at or below it is taken, which is the honest
 * answer: there is nothing left in that strand to give, and inventing a harder
 * one would put a number on a ladder nothing earned. Gated rungs are stepped
 * over on the way down for the same reason placement walks past them.
 */
function stepDownToFree(
  placed: Placement,
  usedTiers: Map<MovementFamily, Set<number>>,
  st: Map<MovementFamily, Standing>,
): Placement | null {
  const m = findMovement(placed.name);
  if (!m || m.track === "groundwork") return placed;

  const strand = ladder(m.family);
  if (strand.length === 0) return placed;

  const used = usedTiers.get(m.family) ?? new Set<number>();
  usedTiers.set(m.family, used);

  for (let tier = m.tier; tier >= 0; tier--) {
    if (used.has(tier)) continue;
    if (lockedBy(strand[tier], st)) continue;
    used.add(tier);
    if (tier === m.tier) return placed;
    const down = strand[tier];
    return {
      name: down.name,
      dose: down.dose,
      note: `Second movement from this strand today — ${down.name.toLowerCase()} rather than repeating ${strand[m.tier].name.toLowerCase()}.`,
      movedFrom: placed.movedFrom ?? placed.name,
      blocked: null,
    };
  }
  return null;
}

/**
 * Holds get their number from your own tested maximum rather than the
 * document's, because there's no easier variation of a plank to drop you onto.
 * `seedHoldTarget` keeps the result between the plan's figure and double it.
 */
function seedHolds(exercises: PrescribedExercise[]): PrescribedExercise[] {
  const timed = exercises.filter((e) => e.metric === "time");
  if (timed.length === 0) return exercises;

  const bests = bestSecondsFor(timed.map((e) => e.key));
  return exercises.map((e) =>
    e.metric === "time"
      ? { ...e, targetSeconds: seedHoldTarget(e.targetSeconds, bests.get(e.key) ?? null) }
      : e,
  );
}

/**
 * The baseline fortnight's own prescription: the five-patrol sweep, with no
 * targets at all.
 *
 * A prefilled number is a suggestion, and a suggestion is exactly what this
 * fortnight must not contain — the whole point is to find out what you can do,
 * not to check whether you can do what the document expected.
 */
function sweepPrescription(
  startDate: string,
  date: string,
  dayKey: DayKey,
  phase: PhaseId,
  owned: Set<string>,
): Prescription {
  const empty: Prescription = {
    date,
    dayKey,
    phase,
    source: "plan",
    model: null,
    exercises: [],
    locked: [],
  };
  const slot = baselineSlotFor(startDate, date);
  if (slot === null) return empty;

  const exercises: PrescribedExercise[] = [];
  const seen = new Set<string>();
  const usedTiers = new Map<MovementFamily, Set<number>>();
  const st = standings(date);
  const everLogged = loggedKeys();

  for (const probe of slot.patrol.probes) {
    // A ladder probe opens at the bottom and climbs as the fortnight earns it,
    // so the first patrol of someone's life is the easiest version of each
    // movement rather than the plan's default one.
    //
    // Two probes on one strand — the Control patrol measures both crawls — sweep
    // to the same rung, and the second would simply be dropped as a duplicate.
    // It walks up instead: the rung below has just been measured in this very
    // session, so the next one is exactly what a sweep is for.
    const rung = probe.ladder ? sweepUp(probe.family, st, usedTiers) : null;
    if (probe.ladder && rung === null) continue;
    const wanted = rung?.name ?? probe.name;
    // The rung carries its own metric — a dead hang is seconds where the rest
    // of the pull ladder is reps — and the probe's is only right for its own
    // name, which a ladder probe has just replaced.
    const metric = rung ? (rung.metric ?? "reps") : probe.metric;

    const gate = gateExercise(wanted, owned);
    if (!gate.allowed) {
      // A substituted ladder probe is dropped rather than swapped. Without a
      // bar the pull substitute is a row, and recording a row under the pull
      // family would put a number on the ladder that nothing on it earned.
      // The row probe already measures what you can actually do.
      if (rung) continue;
      if (gate.substitute === null) continue;
    }

    const name = gate.allowed ? wanted : gate.substitute!.name;
    let note = gate.allowed ? probe.how : `${gate.substitute!.note} ${probe.how}`;

    const up = upgradeExercise(name, owned);
    if (up) note = `${note} ${up.note}`;
    // The technique warning goes last, so it is the line left on screen next to
    // the set you are about to do.
    if (rung?.watch) note = `${note} ${rung.watch}`;

    const key = exerciseKey(name);
    if (seen.has(key)) continue;
    seen.add(key);

    exercises.push({
      key,
      name,
      sets: probe.sets,
      metric,
      repRange: null,
      targetReps: null,
      targetSeconds: null,
      targetWeightKg: null,
      note,
      perSide: probe.perSide ?? false,
      loaded: probe.loaded ?? looksLoaded(name),
      substitutedFrom: name === wanted ? null : wanted,
      firstTime: !everLogged.has(key),
    });
  }

  return { ...empty, exercises };
}

/**
 * The rung this probe should measure: the one the sweep is on, or the next one
 * up if this session has already measured that one. Null when the strand has
 * nothing left to offer.
 */
function sweepUp(
  family: MovementFamily,
  st: Map<MovementFamily, Standing>,
  usedTiers: Map<MovementFamily, Set<number>>,
): Movement | null {
  const strand = ladder(family);
  if (strand.length === 0) return null;
  const used = usedTiers.get(family) ?? new Set<number>();
  usedTiers.set(family, used);

  const start = Math.min(st.get(family)?.tier ?? 0, strand.length - 1);
  for (let tier = start; tier < strand.length; tier++) {
    if (used.has(tier)) continue;
    used.add(tier);
    return strand[tier];
  }
  return null;
}

/** Every movement with at least one logged set, for the first-time check. */
function loggedKeys(): Set<string> {
  const rows = db.selectDistinct({ key: exerciseLogs.exerciseKey }).from(exerciseLogs).all();
  return new Set(rows.map((r) => r.key));
}

export interface ExerciseHistoryRow {
  date: string;
  bestReps: number | null;
  bestWeightKg: number | null;
  bestSeconds: number | null;
  totalSets: number;
}

/** Best set per session for one movement, most recent first. */
export function exerciseHistory(key: string, limit = 4, after?: string): ExerciseHistoryRow[] {
  return db
    .select({
      date: exerciseLogs.date,
      bestReps: sql<number | null>`MAX(${exerciseLogs.reps})`,
      bestWeightKg: sql<number | null>`MAX(${exerciseLogs.weightKg})`,
      bestSeconds: sql<number | null>`MAX(${exerciseLogs.seconds})`,
      totalSets: sql<number>`COUNT(*)`,
    })
    .from(exerciseLogs)
    .where(
      after
        ? and(eq(exerciseLogs.exerciseKey, key), sql`${exerciseLogs.date} > ${after}`)
        : eq(exerciseLogs.exerciseKey, key),
    )
    .groupBy(exerciseLogs.date)
    .orderBy(desc(exerciseLogs.date))
    .limit(limit)
    .all();
}

/**
 * The window of logs that counts as "what you did last time".
 *
 * The baseline fortnight is excluded from every later phase. Those sets were
 * max attempts taken under an explicit instruction not to train, so reading one
 * back as last session's working number would turn every plank from Phase 1
 * onwards into a max hold. They still feed the ladders, which is what they were
 * recorded for.
 */
function historyWindow(phase: PhaseId): string | undefined {
  return isBaselinePhase(phase) ? undefined : baselineEndDate(getSettings().startDate);
}

/**
 * The working range behind a display string like "8–12" or "30–45 s".
 *
 * Read back out of `repRange` rather than carried separately, because that
 * string is already on every stored prescription and adding a field would mean
 * every session saved before this release had none.
 */
function workingRange(repRange: string | null, fallback: number | null): { floor: number; top: number } | null {
  const m = repRange?.match(/(\d+)(?:\s*[–-]\s*(\d+))?/);
  if (m) return { floor: Number(m[1]), top: Number(m[2] ?? m[1]) };
  return fallback === null ? null : { floor: fallback, top: fallback };
}

/** Never suggest more than double what the plan asked for. */
const RUNAWAY_MULTIPLE = 2;

/**
 * Applies the last session's numbers, and adds to them.
 *
 * The old version prefilled last session's best exactly, which meant that with
 * no model configured — or on any day the model call failed — the plan quietly
 * stopped progressing. A form that suggests precisely what you already did is a
 * form that asks you to volunteer for overload, every session, forever.
 *
 * The rule is ordinary double progression, and it deliberately lives here in
 * the fallback rather than only in the prompt:
 *
 *   Fell short of the working range   →  repeat it. Nothing is added to a set
 *                                        you did not finish.
 *   Inside the range                  →  one more rep, or five more seconds.
 *   At the top of the range, loaded   →  2.5 kg more and back to the bottom of
 *                                        the range. That is what the weight is
 *                                        for.
 *   At the top, bodyweight            →  keep adding reps. The tree decides when
 *                                        the movement itself gets harder, and it
 *                                        now takes weeks to do it — reps are what
 *                                        carries the load in the meantime.
 */
function withHistory(p: Prescription): Prescription {
  const after = historyWindow(p.phase);
  return {
    ...p,
    exercises: p.exercises.map((e) => {
      const hist = exerciseHistory(e.key, 1, after);
      if (hist.length === 0) return e;
      const last = hist[0];
      const loaded = e.loaded || last.bestWeightKg !== null;

      if (e.metric === "time") {
        const range = workingRange(e.repRange, e.targetSeconds);
        const from = last.bestSeconds;
        const next =
          from === null || range === null
            ? (from ?? e.targetSeconds)
            : from >= range.floor
              ? Math.min(from + 5, range.top * RUNAWAY_MULTIPLE)
              : from;
        return { ...e, targetSeconds: next, targetWeightKg: last.bestWeightKg ?? e.targetWeightKg, loaded };
      }

      const range = workingRange(e.repRange, e.targetReps);
      const from = last.bestReps;
      if (from === null || range === null) {
        return { ...e, targetWeightKg: last.bestWeightKg ?? e.targetWeightKg, loaded };
      }

      // Top of the range on a loaded movement: the weight goes up and the reps
      // go back to the bottom. On a bodyweight movement there is nothing to add
      // but reps, so they keep climbing.
      if (from >= range.top && last.bestWeightKg !== null) {
        return { ...e, targetReps: range.floor, targetWeightKg: last.bestWeightKg + 2.5, loaded };
      }

      const next = from >= range.floor ? Math.min(from + 1, range.top * RUNAWAY_MULTIPLE) : from;
      return { ...e, targetReps: next, targetWeightKg: last.bestWeightKg ?? e.targetWeightKg, loaded };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// What the body is being asked to recover from
// ─────────────────────────────────────────────────────────────

/**
 * How hard the last few sessions felt, how much you weigh, and how far under
 * maintenance you have been eating.
 *
 * None of this reached the model before, which meant it was programming
 * progression for someone with no bodyweight, no fatigue and no calorie
 * deficit. All three change the right answer: a 100 kg athlete's push-up is a
 * different exercise from a 80 kg athlete's, four sessions at RPE 9 means the
 * next one holds rather than adds, and a month at 800 kcal under maintenance is
 * a month in which strength is defended rather than built.
 */
function recoveryContext(date: string) {
  const from = addDays(date, -13);

  const rpe = db
    .select({ date: sessions.date, rpe: sessions.rpe })
    .from(sessions)
    .where(and(sql`${sessions.date} < ${date}`, sql`${sessions.rpe} IS NOT NULL`))
    .orderBy(desc(sessions.date))
    .limit(6)
    .all();

  const days = db
    .select({ date: foodEntries.date, kcal: sql<number>`SUM(COALESCE(${foodEntries.kcal}, 0))` })
    .from(foodEntries)
    .where(and(sql`${foodEntries.date} >= ${from}`, sql`${foodEntries.date} < ${date}`))
    .groupBy(foodEntries.date)
    .all();

  const hq = getHqStats();
  // Only days with something logged: a day nobody recorded is a day with no
  // reading, not a day with no food, and averaging zeros in would invent a
  // deficit large enough for the model to hold every number in the session.
  const eaten = days.filter((d) => d.kcal > 0);
  const meanIntake =
    eaten.length === 0 ? null : Math.round(eaten.reduce((n, d) => n + d.kcal, 0) / eaten.length);

  const recent = rpe.map((r) => r.rpe as number);
  const meanRpe = recent.length === 0 ? null : recent.reduce((a, b) => a + b, 0) / recent.length;

  return {
    bodyweight_kg: hq.avg7 ?? hq.latest?.weightKg ?? null,
    weight_change_kg_since_start: hq.deltaFromStart,
    kcal_target: hq.kcalTarget,
    mean_kcal_last_14_days: meanIntake,
    // Negative means eating under target. Stated rather than left to be worked
    // out, because it is the number that decides whether to push at all.
    kcal_vs_target: meanIntake === null ? null : meanIntake - hq.kcalTarget,
    days_of_intake_logged: eaten.length,
    recent_session_rpe: recent,
    mean_recent_rpe: meanRpe === null ? null : Math.round(meanRpe * 10) / 10,
  };
}

// ─────────────────────────────────────────────────────────────
// AI prescription
// ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a strength coach adjusting one training session.

You will be given the session's prescribed movements and the athlete's recent
logged performance on each. Adjust sets, reps, seconds and weight for today.

RULES — these are not yours to change:
- Use ONLY the movements given. Do not add, remove, substitute or rename any.
  The movement list comes from a fixed 12-month plan.
- Keep the set count within one of what is given.
- Progress conservatively. Roughly +2.5 kg on a loaded movement, or +1 to +2
  reps, and only when the last session met or beat its target. Never jump more
  than one increment.
- If a movement regressed or was missed, hold or reduce slightly. Do not push.
- On a deload week, reduce: fewer sets, roughly 70% of usual load, nothing near
  failure.
- With no history for a movement, keep the plan's own numbers and set weight to
  null rather than inventing one.
- Bodyweight movements take weight null unless history shows added load.
- You are told what equipment the athlete owns. Pick loads and variations that
  fit it. Never prescribe a load they have no way to produce.
- "movements" describes every movement you are being given: what it is, what it
  trains, how it is executed, what goes wrong on it, and which variation sits
  either side of it. Program the movement described there, not whatever the name
  suggests to you.
- "skill_tree" says where the athlete stands on each strand — which variation
  they are on, how many harder ones exist above it, and whether the one above is
  locked. A movement near the top of its strand has little room to be pushed; one
  near the bottom is a beginner still learning the shape, and reps matter less
  than the shape does.
- If "returning_after_a_break" is set, they have been away. Ease the first
  session back rather than resuming where they left off.
- Where "form_risk" describes something that goes wrong, prefer fewer clean sets
  to more fatigued ones. A movement done badly is worse than one not done.
- "recovery" says what the body is being asked to recover from. Read it before
  deciding to add anything:
    * "mean_recent_rpe" at or above 8 means the last sessions were already near
      the limit. Hold every number where it is. Above 9, reduce.
    * "kcal_vs_target" well below zero, or a "bodyweight_kg" falling faster than
      about 1 kg a week, means they are in a real deficit. Strength is defended
      in a deficit, not built: hold, and add at most on a movement that was
      clearly easy.
    * "bodyweight_kg" is what every bodyweight movement here is actually loaded
      with. A push-up at 100 kg is a different exercise from one at 80 kg, and a
      rep target that made sense last month may be a heavier set now.
  When recovery says hold and the history says progress, hold. Missing a small
  gain costs a week; an injury costs the year.

Return ONLY a JSON object. No markdown, no code fences, no commentary.

{
  "exercises": [
    {
      "name": "exact name as given",
      "sets": number,
      "reps": number | null,
      "seconds": number | null,
      "weight_kg": number | null,
      "note": "short reason, max 60 chars, or null"
    }
  ]
}`;

/**
 * Where each strand of the skill tree stands, flattened for the prompt.
 *
 * The tier matters as much as the numbers: it tells the model how much room is
 * left above this movement, which is the difference between "push a little" and
 * "this is the hardest variation there is".
 */
function skillTreeContext(st: Map<MovementFamily, Standing>) {
  const out: Record<string, unknown> = {};
  for (const [family, s] of st) {
    out[family] = {
      doing: s.movement.name,
      tier: `${s.tier + 1} of ${ladder(family).length}`,
      best_reps: s.bestReps,
      best_seconds: s.bestSeconds,
      mastered_current_tier: s.mastered,
      locked_above_by: s.blockedBy ? s.blockedBy.why : null,
      returning_after_a_break: s.rusty,
    };
  }
  return out;
}

/**
 * What each prescribed movement actually is.
 *
 * The single most useful thing in the prompt. A model told only "Pike push-ups,
 * 3 sets" is programming from whatever it happens to associate with the name; a
 * model told the setup, the execution, what the movement trains and what goes
 * wrong on it is programming the thing in front of the athlete. Movements the
 * catalogue doesn't know — the plan's mobility and skill work — are sent as
 * names alone rather than being dropped, so the model still sees the session.
 */
function movementBriefs(names: string[]) {
  const out: Record<string, unknown> = {};
  for (const name of names) {
    const m = findMovement(name);
    if (!m) continue;
    out[m.name] = {
      is: m.summary,
      family: m.family,
      tier: `${m.tier + 1} of ${ladder(m.family).length}`,
      trains: m.trains,
      execution: m.execution,
      form_risk: m.watch,
      cues: m.cues,
      easier: m.tier > 0 ? ladder(m.family)[m.tier - 1].name : null,
      harder: ladder(m.family)[m.tier + 1]?.name ?? null,
      counts_as_mastered_at: masteryLabel(m),
    };
  }
  return out;
}

interface AiExercise {
  name?: unknown;
  sets?: unknown;
  reps?: unknown;
  seconds?: unknown;
  weight_kg?: unknown;
  note?: unknown;
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number.parseFloat(v) : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Asks the model to adjust the prescription. Falls back to the plan's own
 * numbers on any failure — a session must never be blocked on a model call.
 */
export async function generatePrescription(
  base: Prescription,
  isDeload: boolean,
  timeoutMs = 25_000,
): Promise<Prescription> {
  const key = apiKey();
  const model = activeVisionModel();
  const withHist = withHistory(base);

  if (!key || !model || base.exercises.length === 0) return withHist;

  // Phase 0 is measurement. Progressing a number you have not yet established
  // is exactly the mistake this fortnight exists to prevent, so the model is
  // not consulted at all.
  if (isBaselinePhase(base.phase)) return withHist;

  const st = standings();
  const after = historyWindow(base.phase);
  const context = base.exercises.map((e) => ({
    name: e.name,
    metric: e.metric,
    plan_sets: e.sets,
    plan_reps: e.repRange,
    per_side: e.perSide,
    history: exerciseHistory(e.key, 4, after).map((h) => ({
      date: h.date,
      best_reps: h.bestReps,
      best_weight_kg: h.bestWeightKg,
      best_seconds: h.bestSeconds,
      sets: h.totalSets,
    })),
  }));

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 1400,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: JSON.stringify({
              phase: base.phase,
              session: base.dayKey,
              deload_week: isDeload,
              equipment_available: equipmentSummary(getSettings().equipment),
              // Bodyweight, deficit and how hard the last sessions felt. Without
              // these the model is programming for a body it knows nothing about.
              recovery: recoveryContext(base.date),
              // The skill tree, so the model isn't guessing at a fitness level
              // the database already knows.
              skill_tree: skillTreeContext(st),
              // And what each movement in front of it actually is.
              movements: movementBriefs(base.exercises.map((e) => e.name)),
              exercises: context,
            }),
          },
        ],
      }),
    });

    if (!res.ok) return withHist;

    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") return withHist;

    const parsed = JSON.parse(stripFences(content)) as { exercises?: AiExercise[] };
    if (!Array.isArray(parsed.exercises)) return withHist;

    // Merge by name against the baseline. Anything the model invented is
    // dropped, and anything it omitted keeps the plan's numbers — the movement
    // list is not negotiable.
    const byName = new Map<string, AiExercise>();
    for (const e of parsed.exercises) {
      if (typeof e?.name === "string") byName.set(exerciseKey(e.name), e);
    }

    return {
      ...withHist,
      source: "ai",
      model,
      exercises: withHist.exercises.map((e) => {
        const ai = byName.get(e.key);
        if (!ai) return e;
        const sets = numOrNull(ai.sets);
        return {
          ...e,
          // Clamp to ±1 of the plan even if the model ignored the instruction.
          sets: sets === null ? e.sets : Math.max(e.sets - 1, Math.min(e.sets + 1, Math.round(sets))),
          targetReps: e.metric === "reps" ? (numOrNull(ai.reps) ?? e.targetReps) : e.targetReps,
          targetSeconds: e.metric === "time" ? (numOrNull(ai.seconds) ?? e.targetSeconds) : e.targetSeconds,
          targetWeightKg: numOrNull(ai.weight_kg) ?? e.targetWeightKg,
          loaded: e.loaded || numOrNull(ai.weight_kg) !== null,
          note: typeof ai.note === "string" && ai.note.trim() ? ai.note.trim().slice(0, 80) : e.note,
        };
      }),
    };
  } catch {
    return withHist;
  }
}

// ─────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────

/**
 * What the plan asked for on this day that the tree is currently holding back.
 *
 * Recomputed rather than stored alongside the session, because a lock is a
 * statement about where you stand today. Earn the plank that the shoulder roll
 * was waiting on and yesterday's saved session should stop claiming it is still
 * shut.
 */
export function lockedFor(phase: PhaseId, dayKey: DayKey, date?: string): LockedOut[] {
  const session = sessionFor(phase, dayKey);
  if (!session) return [];
  const st = standings(date);
  const headroom = headroomForPhase(phase);
  const out: LockedOut[] = [];
  for (const e of [...session.main, ...(session.extras ?? [])]) {
    const placed = placeOnLadder(e.name, e.dose, e.note ?? null, st, headroom);
    if (placed.blocked) out.push({ name: e.name, why: placed.blocked.why });
  }
  return out;
}

export function storedPrescription(date: string): Prescription | null {
  const row = db.select().from(sessionPlans).where(eq(sessionPlans.date, date)).get();
  if (!row) return null;
  try {
    return {
      date: row.date,
      dayKey: row.dayKey as DayKey,
      phase: row.phase as PhaseId,
      source: row.source,
      model: row.model,
      exercises: JSON.parse(row.payload) as PrescribedExercise[],
      locked: lockedFor(row.phase as PhaseId, row.dayKey as DayKey, row.date),
    };
  } catch {
    return null;
  }
}

export function storePrescription(p: Prescription): void {
  db.insert(sessionPlans)
    .values({
      date: p.date,
      dayKey: p.dayKey,
      phase: p.phase,
      source: p.source,
      model: p.model,
      payload: JSON.stringify(p.exercises),
    })
    .onConflictDoUpdate({
      target: sessionPlans.date,
      set: { source: p.source, model: p.model, payload: JSON.stringify(p.exercises) },
    })
    .run();
}

/** Sets already logged for a session, keyed by exercise. */
export function loggedSets(sessionId: number): Record<string, { setIndex: number; reps: number | null; weightKg: number | null; seconds: number | null }[]> {
  const rows = db
    .select()
    .from(exerciseLogs)
    .where(eq(exerciseLogs.sessionId, sessionId))
    .orderBy(exerciseLogs.setIndex)
    .all();

  const out: Record<string, { setIndex: number; reps: number | null; weightKg: number | null; seconds: number | null }[]> = {};
  for (const r of rows) {
    (out[r.exerciseKey] ??= []).push({
      setIndex: r.setIndex,
      reps: r.reps,
      weightKg: r.weightKg,
      seconds: r.seconds,
    });
  }
  return out;
}

/** Personal best per movement, for the "beat this" line on the set form. */
export function personalBest(key: string): { reps: number | null; weightKg: number | null; seconds: number | null } | null {
  const row = db
    .select({
      reps: sql<number | null>`MAX(${exerciseLogs.reps})`,
      weightKg: sql<number | null>`MAX(${exerciseLogs.weightKg})`,
      seconds: sql<number | null>`MAX(${exerciseLogs.seconds})`,
    })
    .from(exerciseLogs)
    .where(eq(exerciseLogs.exerciseKey, key))
    .get();
  if (!row || (row.reps === null && row.weightKg === null && row.seconds === null)) return null;
  return row;
}

/** Total tonnage across a session — a single number that should trend up. */
export function sessionVolume(sessionId: number): number {
  const rows = db
    .select({ reps: exerciseLogs.reps, weightKg: exerciseLogs.weightKg })
    .from(exerciseLogs)
    .where(and(eq(exerciseLogs.sessionId, sessionId), sql`${exerciseLogs.weightKg} IS NOT NULL`))
    .all();
  return rows.reduce((s, r) => s + (r.reps ?? 0) * (r.weightKg ?? 0), 0);
}

// ─────────────────────────────────────────────────────────────
// Conditioning
// ─────────────────────────────────────────────────────────────

/**
 * Thursday's pick-one list, built from the games you actually own rather than
 * the document's fixed five.
 *
 * With no headset it falls back to the plan's own non-VR conditioning — the
 * outdoor sprint intervals it prescribes from Phase 3 — so the session still
 * happens rather than listing software you can't run.
 */
export function conditioningOptions(phase: PhaseId): { label: string; detail: string }[] {
  const s = getSettings();
  const owned = ownedKeys(s.equipment);
  const hasVr = owned.has("vr");
  const games = s.vrGames.filter((g) => g.owned);

  const out: { label: string; detail: string }[] = [];

  if (hasVr && games.length > 0) {
    for (const g of games) out.push({ label: g.label, detail: g.howTo });
  }

  // Always available, and the document's own Phase 3 alternative.
  out.push({
    label: "Outdoor sprint intervals",
    detail: "8× 30 s hard / 90 s walk. The plan swaps this in from Phase 3 anyway.",
  });

  if (owned.has("jump_rope")) {
    out.push({ label: "Jump rope intervals", detail: "10× 1 min on / 30 s off." });
  }
  if (owned.has("gym")) {
    out.push({ label: "Rower or bike intervals", detail: "2 min hard / 1 min easy × 8." });
  }
  if (out.length === 1) {
    out.push({ label: "Brisk walk or run", detail: "25 minutes unbroken, heart rate up." });
  }

  // Phase 2 onward the plan makes this interval work rather than steady state.
  if (phase >= 2) {
    out.unshift({
      label: "Intervals, whichever you pick",
      detail: "2 min all-out / 1 min easy × 8.",
    });
  }

  return out;
}

/** Whether a headset is even in play, for the copy on the session screen. */
export function hasVrHeadset(): boolean {
  return ownedKeys(getSettings().equipment).has("vr");
}
