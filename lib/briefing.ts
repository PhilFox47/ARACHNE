import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  briefings, exerciseLogs, foodEntries, measurements as measurementsTable,
  movementFeedback, sessionPlans, sessions, trials, abilities, waterLogs,
} from "./db/schema";
import { addDays, dayKeyOf, dayOf, daysBetween, todayISO, weekIndex } from "./dates";
import { getSettings } from "./settings";
import { TRAINING_DAYS, isLowProfileWeek, roundsForWeek, sessionFor, type DayKey } from "./plan";
import { intakeForDay, isRefuelWeek, nutrientGuidesForDay, phaseForDay, proteinTargetForDay } from "./course";
import { buildComposition, compositionSummary, getHqStats, loadWeights, rollingAverage } from "./stats";
import { findMovement, masterySessions, masteryWeeks } from "./movements";
import { movementRecords } from "./skills";
import { VERDICT_KEYS, isOverreach, type Verdict } from "./feedback";
import { lockedFor } from "./training";
import { workingRange } from "./prescription";
import { WEEKLY_MALUS, malusFor, standingsFor } from "./chores";
import { allChores, choreLogBetween } from "./choreData";
import { apiKey, baseUrl } from "./nanogpt";
import { activeVisionModel } from "./settings";

/**
 * The trainer's morning paragraph.
 *
 * Every other screen reports one thing: PATROL knows about sessions, FUEL about
 * food, VITALS about the scale. Nobody was reading across them, and that is
 * where the useful observations live — protein short on exactly the days you
 * train hardest, the weekend snacking that undoes a good week, a strand that
 * has been one clean session from mastery for a fortnight.
 *
 * Written once a day and stored, which is the deliberate exception to this
 * app's derive-everything rule. It costs a model call, and a paragraph that
 * rewrites itself on every page load is a paragraph you stop reading. What it
 * says at 08:00 it says all day.
 */

/** Not before this hour. The briefing is a morning thing; it reads the day. */
export const BRIEFING_HOUR = 8;

/**
 * How long a locally-composed briefing waits before the model may replace it.
 *
 * The fallback exists so the screen is never empty, not so the day is settled
 * by whichever minute the network was down. It is upgradeable — but not on
 * every page load, or a flat network turns into a request per refresh.
 */
const LOCAL_RETRY_MINUTES = 30;

export interface BriefingRow {
  date: string;
  body: string;
  source: "ai" | "local";
  model: string | null;
  createdAt: number;
}

export function storedBriefing(date: string): BriefingRow | null {
  const row = db.select().from(briefings).where(eq(briefings.date, date)).get();
  return row
    ? { date: row.date, body: row.body, source: row.source, model: row.model, createdAt: row.createdAt }
    : null;
}

/**
 * Whether a briefing should exist for this date yet.
 *
 * Due from 08:00, so the morning's weight and breakfast are in it. The one
 * exception is a run that has never had one: an empty panel on the first
 * morning reads as a broken feature rather than as a thing that arrives later,
 * so the first is written whenever the app is first opened.
 */
export function briefingDue(date: string, now = new Date()): boolean {
  // Both halves read the same clock. It used to take `now` for the hour and
  // real time for the date, which agreed by accident until the day stopped
  // starting at midnight.
  if (date !== dayOf(now)) return false;
  // A wall-clock hour, deliberately: 08:00 is eight in the morning. Between
  // midnight and the day's turnover the hour is 0–3, which is below it, and
  // that day's briefing was written twenty hours ago anyway.
  if (now.getHours() >= BRIEFING_HOUR) return true;
  return db.select({ n: sql<number>`COUNT(*)` }).from(briefings).get()?.n === 0;
}

/** A stored local briefing the model may now have another go at. */
export function upgradable(row: BriefingRow, now = new Date()): boolean {
  if (row.source !== "local") return false;
  return now.getTime() / 1000 - row.createdAt > LOCAL_RETRY_MINUTES * 60;
}

/** How far back the trainer remembers what it has already said. */
export const RECALL_DAYS = 14;

/**
 * What the trainer has said recently, newest first.
 *
 * Without this it wrote every morning as though it had never spoken to you
 * before — the same protein observation, the same note about the corridor, in
 * the same order, for a week. A coach who tells you the same thing five days
 * running is one you stop listening to on day two, and the repetition also
 * crowds out whatever is actually new.
 *
 * Excludes the day being written, so a regeneration cannot read itself.
 */
export function recentBriefings(date: string, days = RECALL_DAYS): BriefingRow[] {
  return db
    .select()
    .from(briefings)
    .where(and(gte(briefings.date, addDays(date, -days)), lte(briefings.date, addDays(date, -1))))
    .orderBy(desc(briefings.date))
    .all()
    .map((r) => ({
      date: r.date,
      body: r.body,
      source: r.source,
      model: r.model,
      createdAt: r.createdAt,
    }));
}

// ─────────────────────────────────────────────────────────────
// The facts
// ─────────────────────────────────────────────────────────────

export interface BriefingFacts {
  today: string;
  dayKey: DayKey;
  day: number;
  totalDays: number;
  phase: { id: number; name: string; focus: string };
  week: { index: number; lowProfile: boolean; refuel: boolean; rounds: number };
  vitals: {
    latestKg: number | null;
    avg7: number | null;
    avg7LastWeek: number | null;
    corridorKg: number;
    corridorState: string;
    deltaFromStartKg: number | null;
    targetKg: number;
    daysSinceWeighIn: number | null;
    bodyfatPct: number | null;
  };
  fuel: {
    kcalTargetToday: number;
    plannedKcal: number;
    adjustment: number;
    proteinTargetG: number;
    last7: { date: string; kcal: number; proteinG: number; waterMl: number; snackPct: number; entries: number }[];
    daysLogged7: number;
    avgKcal7: number | null;
    avgProtein7: number | null;
    proteinDaysMet7: number;
    /**
     * Days over the target, and what actually put them there.
     *
     * Totals alone let a trainer say "you were over"; only the items let it say
     * which thing to drop. The second is the useful sentence, so the entries
     * that did the damage travel with the number.
     */
    overTargetDays: {
      date: string;
      kcal: number;
      target: number;
      overBy: number;
      worstItems: { description: string; kcal: number; mealType: string }[];
    }[];
    /** The week's most expensive snacks, which is usually the same short list. */
    topSnacks7: { description: string; kcal: number; times: number }[];
    /**
     * Reference values for everything protein is not, with the week's average
     * against each.
     *
     * Orientation, and the facts say so in the `kind` field: `around` for a
     * rough share, `rest` for what the calories have left, `atLeast` for a
     * floor, `under` for a soft ceiling. Two come from the plan document and
     * three are ordinary public guidance the document never mentions, which is
     * why `source` travels with them — the trainer should not cite a number as
     * the plan's when it is not.
     */
    guides: {
      label: string;
      kind: string;
      grams: number;
      source: string;
      avg7: number | null;
    }[];
  };
  patrol: {
    last7: { date: string; dayKey: string; title: string | null; completed: boolean; rpe: number | null; note: string | null; sets: number }[];
    doneThisWeek: number;
    dueThisWeek: number;
    todaysSession: { title: string; movements: string[] } | null;
    nextThreeDays: { date: string; dayKey: string; title: string | null }[];
    lastSessionDaysAgo: number | null;
    /**
     * Training days that came and went with nothing completed.
     *
     * A missing row and a row marked incomplete mean the same thing to the
     * person reading the briefing, and neither is visible from a list of the
     * sessions that did happen.
     */
    skipped: { date: string; dayKey: string; title: string | null; started: boolean }[];
    /**
     * Movements that came in under what was prescribed, with the catalogue's
     * own coaching notes attached.
     *
     * The notes travel with the shortfall on purpose. "Your rows dropped to six"
     * is an observation; "your rows dropped to six — hips stay up, a sagging
     * middle turns this into an arm exercise" is the reason it happened, and it
     * is already written down in the catalogue rather than something a model
     * should be inventing.
     */
    shortfalls: {
      date: string;
      name: string;
      metric: string;
      /** The bottom of the working range — what the set actually had to clear. */
      target: number | null;
      /** The range as written, e.g. "8–12", where the prescription gives one. */
      range: string | null;
      best: number | null;
      previousBest: number | null;
      setsDone: number;
      setsPlanned: number;
      watch: string | null;
      cues: string[];
    }[];
  };
  /**
   * How a movement *felt*, which no number in the session says.
   *
   * The gap this closes is the one that could do harm. The trainer could see
   * that your rows fell from ten to six and could not see that you had told the
   * app your shoulder hurt — so a coach told to push you had every reason to
   * push, on exactly the day it should have said stop. "pain" outranks every
   * other observation in the briefing for that reason.
   */
  feedback: {
    recent: { date: string; movement: string; verdict: Verdict }[];
    /**
     * How many of each answer in the window, and how many there were at all.
     *
     * Every count needs the denominator. The question is asked of every
     * movement after every session, so "four hard" is drawn from sixty answers
     * rather than from a handful of first attempts and means nothing on its own.
     */
    counts: Record<Verdict, number>;
    answered: number;
    /** Movements flagged painful in the window, newest first. */
    painful: { movement: string; date: string; times: number }[];
    /**
     * Movements whose most recent answers in a row were all "easy".
     *
     * The signal the old three-answer scale could not carry at all: "controlled"
     * meant both *exactly right* and *far too light*, so a movement someone had
     * outgrown looked identical to one that fitted. This is the one place in the
     * data that says to make something harder.
     */
    easyStreak: { movement: string; sessions: number }[];
    /**
     * Movements whose most recent answers in a row were all at or past the edge
     * — "hard" or "limit", in any mix.
     *
     * A single one is training working. The same movement four sessions running
     * is a load that is not being absorbed, and it is the signal that says to
     * change the programming rather than ask for more effort. `worst` says
     * whether they were merely finishing them or failing them.
     */
    hardStreak: { movement: string; sessions: number; worst: Verdict }[];
  };
  /**
   * The tape. Better evidence than the scale on a stalled fortnight, and the
   * one reading that keeps moving when the weight does not.
   */
  measurements: {
    latest: { date: string; waistCm: number | null; neckCm: number | null; chestCm: number | null; thighCm: number | null; upperArmCm: number | null } | null;
    /** Change since the earliest reading, where there are two far enough apart. */
    waistDeltaCm: number | null;
    spanDays: number | null;
    daysSinceLast: number | null;
  };
  /**
   * What the last fortnight of weight was actually made of. Ahead of the
   * corridor is a bad result if the missing kilos came off the wrong tissue.
   */
  composition: {
    fatDeltaKg: number;
    leanDeltaKg: number;
    fatSharePct: number | null;
    spanDays: number;
  } | null;
  /**
   * THE WEB. What is nearly mastered is the most motivating sentence available
   * and was completely invisible — "two more clean sessions and the next rung
   * opens" is a reason to do a boring movement properly.
   */
  web: {
    nearMastery: { movement: string; cleanSessions: number; needSessions: number; cleanWeeks: number; needWeeks: number }[];
    masteredRecently: string[];
    lockedInTodaysSession: { name: string; why: string }[];
  };
  /** Capability milestones — THE TRIAL and ABILITIES. */
  milestones: {
    trialsRun: number;
    lastTrial: { date: string; monthIndex: number; score: number | null } | null;
    abilitiesUnlocked: number;
  };
  /**
   * MAINTENANCE — the chores, and what neglecting them is costing.
   *
   * The fifth source. It is the only one that touches XP directly, so the
   * trainer can point at a number rather than at a habit.
   */
  maintenance: {
    dailyTotal: number;
    dailyDone: number;
    weeklyTotal: number;
    weeklyDone: number;
    outstandingToday: string[];
    outstandingThisWeek: string[];
    /** Today's penalty, as a percentage, and what earned it. */
    malusPct: number;
    missedYesterday: string[];
    missedLastWeek: string[];
    /** Days in the last week that ended with every daily chore done. */
    cleanDays7: number;
  };
}

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

const TRAINING_DAY_KEYS: string[] = [...TRAINING_DAYS];

const DAY_NAMES: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const dayName = (k: string) => DAY_NAMES[k] ?? k;

const WEEKLY_MALUS_PCT = Math.round(WEEKLY_MALUS * 100);

/** "Monday, Tuesday and Thursday" — not three ands in a row. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The shape stored in `session_plans.payload`, narrowed to what is read here. */
interface PlannedExercise {
  key: string;
  name: string;
  sets: number;
  metric: "reps" | "time";
  /**
   * The working range as shown, e.g. "8–12". This is the requirement.
   *
   * `targetReps` below is only the number the form prefills — one more than last
   * session, or the bottom of the range after a weight increase. Judging a set
   * against it treats a suggestion as a floor.
   */
  repRange: string | null;
  targetReps: number | null;
  targetSeconds: number | null;
  targetWeightKg: number | null;
}

/**
 * Movements that came in under what the day actually asked for.
 *
 * Read from the stored prescription rather than from the plan, because the
 * prescription is what was on the screen: it has already been placed on the
 * ladder, gated on equipment and adjusted for how the last session went. Judging
 * a set against a number that was never shown would be a trainer marking you on
 * a paper you did not sit.
 *
 * A set count that fell short counts too. Three prescribed and one logged is a
 * session that was abandoned partway, and that is worth saying out loud —
 * whereas a rep or two under target on the last set is not, which is why the
 * miss has to be more than a rounding error to be reported at all.
 */
function findShortfalls(from: string, to: string): BriefingFacts["patrol"]["shortfalls"] {
  const plans = db
    .select()
    .from(sessionPlans)
    .where(and(gte(sessionPlans.date, from), lte(sessionPlans.date, to)))
    .all();
  if (plans.length === 0) return [];

  const logs = db
    .select()
    .from(exerciseLogs)
    .where(and(gte(exerciseLogs.date, from), lte(exerciseLogs.date, to)))
    .all();

  const out: BriefingFacts["patrol"]["shortfalls"] = [];

  for (const plan of plans) {
    let planned: PlannedExercise[];
    try {
      planned = JSON.parse(plan.payload) as PlannedExercise[];
    } catch {
      continue;
    }
    for (const p of planned) {
      const sets = logs.filter((l) => l.date === plan.date && l.exerciseKey === p.key);
      // Nothing logged at all is not a shortfall on this movement — it is a
      // skipped session, and that is reported separately and only once.
      if (sets.length === 0) continue;

      const isTime = p.metric === "time";
      const best = isTime
        ? Math.max(...sets.map((s) => s.seconds ?? 0))
        : Math.max(...sets.map((s) => s.reps ?? 0));

      // The requirement is the bottom of the working range, not the number the
      // form happened to prefill. Double progression asks you to land anywhere
      // inside 8–12; the prefill creeps up through it a rep at a time and drops
      // back to the floor when the weight goes up. Reading that suggestion as a
      // target meant a perfectly good set of ten was reported as two reps short,
      // and the day after a weight increase looked like a collapse.
      const range = workingRange(p.repRange, isTime ? p.targetSeconds : p.targetReps);
      const target = range?.floor ?? (isTime ? p.targetSeconds : p.targetReps);
      const spread = range !== null && range.top > range.floor;

      // The same movement before this date, for "down from" rather than just "under".
      const earlier = db
        .select({ reps: exerciseLogs.reps, seconds: exerciseLogs.seconds, weightKg: exerciseLogs.weightKg })
        .from(exerciseLogs)
        .where(and(eq(exerciseLogs.exerciseKey, p.key), lte(exerciseLogs.date, addDays(plan.date, -1))))
        .orderBy(desc(exerciseLogs.date))
        .limit(12)
        .all();
      const previousBest = earlier.length
        ? Math.max(...earlier.map((e) => (isTime ? (e.seconds ?? 0) : (e.reps ?? 0))))
        : null;

      // Fewer reps under a heavier bar is the whole point of the weight going
      // up, so it is never a step backwards.
      const heaviest = (rows: { weightKg: number | null }[]) =>
        rows.reduce<number | null>((m2, r) => (r.weightKg === null ? m2 : Math.max(m2 ?? 0, r.weightKg)), null);
      const liftedMore =
        heaviest(sets) !== null && heaviest(earlier) !== null && heaviest(sets)! > heaviest(earlier)!;

      const missedTarget = target !== null && best > 0 && best < target;
      const missedSets = sets.length < p.sets;
      // Only where there is no range to land inside. With one, a drop from the
      // top to the middle is ordinary variation the programme already allows —
      // and calling it a regression is the same misreading in another costume.
      const wentBackwards =
        !spread && !liftedMore && previousBest !== null && previousBest > 0 && best < previousBest;
      if (!missedTarget && !missedSets && !wentBackwards) continue;

      const m = findMovement(p.name);
      out.push({
        date: plan.date,
        name: p.name,
        metric: p.metric,
        target,
        range: spread ? p.repRange : null,
        best,
        previousBest,
        setsDone: sets.length,
        setsPlanned: p.sets,
        watch: m?.watch ?? null,
        cues: m?.cues?.slice(0, 3) ?? [],
      });
    }
  }

  // Worst first, newest first, and capped — four specific movements is already
  // more than one paragraph can act on.
  return out
    .sort((a, b) => {
      const gap = (x: (typeof out)[number]) =>
        x.target && x.best !== null ? (x.target - x.best) / x.target : 0;
      return gap(b) - gap(a) || b.date.localeCompare(a.date);
    })
    .slice(0, 4);
}

export function gatherFacts(date = todayISO()): BriefingFacts {
  const settings = getSettings();
  const stats = getHqStats();
  const rows = loadWeights();
  const day = Math.max(0, daysBetween(settings.startDate, date));
  const wk = weekIndex(settings.startDate, date);
  const from = addDays(date, -7);

  // ── VITALS ──
  const avg7 = rollingAverage(rows, date);
  const avg7Prev = rollingAverage(rows, addDays(date, -7));
  const last = rows.length ? rows[rows.length - 1] : null;

  // ── FUEL ──
  const food = db
    .select()
    .from(foodEntries)
    .where(and(gte(foodEntries.date, from), lte(foodEntries.date, date)))
    .all();
  const water = db
    .select({ date: waterLogs.date, ml: sql<number>`SUM(${waterLogs.ml})` })
    .from(waterLogs)
    .where(and(gte(waterLogs.date, from), lte(waterLogs.date, date)))
    .groupBy(waterLogs.date)
    .all();
  const waterByDate = new Map(water.map((w) => [w.date, w.ml]));

  const fuelDays: BriefingFacts["fuel"]["last7"] = [];
  for (let i = 7; i >= 0; i--) {
    const d = addDays(date, -i);
    const rowsForDay = food.filter((f) => f.date === d);
    const kcal = rowsForDay.reduce((s, f) => s + (f.kcal ?? 0), 0);
    const snack = rowsForDay.filter((f) => f.mealType === "snack").reduce((s, f) => s + (f.kcal ?? 0), 0);
    fuelDays.push({
      date: d,
      kcal: Math.round(kcal),
      proteinG: Math.round(rowsForDay.reduce((s, f) => s + (f.proteinG ?? 0), 0)),
      waterMl: waterByDate.get(d) ?? 0,
      snackPct: kcal > 0 ? Math.round((snack / kcal) * 100) : 0,
      entries: rowsForDay.length,
    });
  }
  const logged = fuelDays.filter((d) => d.entries > 0);
  const proteinTarget = proteinTargetForDay(day);

  // The week's average for each nutrient that carries a reference value. Kept
  // as five numbers rather than five more columns on every day: the guides are
  // about the shape of a week, and a day-by-day salt figure is noise.
  const loggedDates = new Set(logged.map((d) => d.date));
  const avgOf = (f: (r: (typeof food)[number]) => number | null): number | null => {
    if (loggedDates.size === 0) return null;
    const total = food.filter((r) => loggedDates.has(r.date)).reduce((s, r) => s + (f(r) ?? 0), 0);
    return Math.round((total / loggedDates.size) * 10) / 10;
  };
  const guideAverages: Record<string, number | null> = {
    carbsG: avgOf((r) => r.carbsG),
    fatG: avgOf((r) => r.fatG),
    fiberG: avgOf((r) => r.fiberG),
    sugarG: avgOf((r) => r.sugarG),
    saltG: avgOf((r) => r.saltG),
  };

  // ── Which days went over, and on what ──
  const overTargetDays: BriefingFacts["fuel"]["overTargetDays"] = [];
  for (const d of logged) {
    const target = intakeForDay(daysBetween(settings.startDate, d.date)).kcal;
    if (d.kcal <= target) continue;
    overTargetDays.push({
      date: d.date,
      kcal: d.kcal,
      target,
      overBy: d.kcal - target,
      worstItems: food
        .filter((f) => f.date === d.date && (f.kcal ?? 0) > 0)
        .sort((a, b) => (b.kcal ?? 0) - (a.kcal ?? 0))
        .slice(0, 4)
        .map((f) => ({
          description: f.description,
          kcal: Math.round(f.kcal ?? 0),
          mealType: f.mealType,
        })),
    });
  }

  const snackTally = new Map<string, { description: string; kcal: number; times: number }>();
  for (const f of food) {
    if (f.mealType !== "snack" || !f.kcal) continue;
    const cur = snackTally.get(f.normKey) ?? { description: f.description, kcal: 0, times: 0 };
    cur.kcal += f.kcal;
    cur.times += 1;
    snackTally.set(f.normKey, cur);
  }
  const topSnacks7 = [...snackTally.values()]
    .map((s) => ({ ...s, kcal: Math.round(s.kcal) }))
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, 4);

  // ── PATROL ──
  const sess = db
    .select()
    .from(sessions)
    .where(and(gte(sessions.date, from), lte(sessions.date, date)))
    .orderBy(asc(sessions.date))
    .all();
  const setCounts = db
    .select({ date: exerciseLogs.date, n: sql<number>`COUNT(*)` })
    .from(exerciseLogs)
    .where(and(gte(exerciseLogs.date, from), lte(exerciseLogs.date, date)))
    .groupBy(exerciseLogs.date)
    .all();
  const setsByDate = new Map(setCounts.map((s) => [s.date, s.n]));

  const patrolDays = sess.map((s) => ({
    date: s.date,
    dayKey: s.dayKey,
    title: sessionFor(phaseForDay(daysBetween(settings.startDate, s.date)).id, s.dayKey as DayKey)?.title ?? null,
    completed: s.completed,
    rpe: s.rpe,
    note: s.note,
    sets: setsByDate.get(s.date) ?? 0,
  }));

  const lastDone = db
    .select({ date: sessions.date })
    .from(sessions)
    .where(eq(sessions.completed, true))
    .orderBy(desc(sessions.date))
    .get();

  // This week's attendance, Monday to Sunday.
  const monday = addDays(date, -((dayKeyOf(date) === "sun" ? 7 : ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(dayKeyOf(date))) - 1));
  const weekSessions = db
    .select()
    .from(sessions)
    .where(and(gte(sessions.date, monday), lte(sessions.date, addDays(monday, 6))))
    .all();

  // ── Training days that produced nothing ──
  const doneDates = new Set(sess.filter((s) => s.completed).map((s) => s.date));
  const startedDates = new Set(sess.map((s) => s.date));
  const skipped: BriefingFacts["patrol"]["skipped"] = [];
  for (let i = 7; i >= 1; i--) {
    const d = addDays(date, -i);
    if (d < settings.startDate) continue;
    const dk = dayKeyOf(d);
    if (!TRAINING_DAY_KEYS.includes(dk)) continue;
    if (doneDates.has(d)) continue;
    skipped.push({
      date: d,
      dayKey: dk,
      title: sessionFor(phaseForDay(daysBetween(settings.startDate, d)).id, dk)?.title ?? null,
      started: startedDates.has(d),
    });
  }

  // ── Movements that came in short ──
  const shortfalls = findShortfalls(from, date);

  // ── MAINTENANCE ──
  const choreRows = allChores();
  const choreEntries = choreLogBetween(addDays(date, -21), date);
  const standings = standingsFor(date, choreRows, choreEntries);
  const malus = malusFor(date, choreRows, choreEntries);

  // Days in the last week that ended with every daily chore ticked. Counted
  // here rather than left to the model, which cannot do it from a list of rows.
  let cleanDays7 = 0;
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, -i);
    if (d < settings.startDate) continue;
    const s = standingsFor(d, choreRows, choreEntries).daily;
    if (s.length > 0 && s.every((x) => x.done)) cleanDays7++;
  }

  // ── How movements felt ──
  // The one that could do harm if missing: a coach told to push you, on the
  // day you reported pain.
  const fbRows = db
    .select()
    .from(movementFeedback)
    .where(and(gte(movementFeedback.date, addDays(date, -14)), lte(movementFeedback.date, date)))
    .orderBy(desc(movementFeedback.date))
    .all();
  const painTally = new Map<string, { movement: string; date: string; times: number }>();
  for (const f of fbRows) {
    if (f.verdict !== "painful") continue;
    const name = findMovement(f.exerciseKey)?.name ?? f.exerciseKey;
    const cur = painTally.get(f.exerciseKey);
    if (cur) cur.times += 1;
    else painTally.set(f.exerciseKey, { movement: name, date: f.date, times: 1 });
  }

  const verdictCounts = Object.fromEntries(
    VERDICT_KEYS.map((k) => [k, fbRows.filter((f) => f.verdict === k).length]),
  ) as Record<Verdict, number>;

  // Runs of the same kind of answer on the same movement, most recent first.
  //
  // Only the *current* run counts. A movement that was hard three times and came
  // back clean last session is one you are winning, and reporting it as a
  // three-session streak would say the opposite of what happened.
  const byMovement = new Map<string, typeof fbRows>();
  for (const f of fbRows) byMovement.set(f.exerciseKey, [...(byMovement.get(f.exerciseKey) ?? []), f]);

  const runOf = (entries: typeof fbRows, matches: (v: Verdict) => boolean) => {
    let sessions = 0;
    for (const e of entries) {
      if (!matches(e.verdict)) break;
      sessions++;
    }
    return sessions;
  };

  const easyStreak = [...byMovement]
    .map(([key, entries]) => ({
      movement: findMovement(key)?.name ?? key,
      sessions: runOf(entries, (v) => v === "easy"),
    }))
    .filter((s) => s.sessions >= 2)
    .sort((a, b) => b.sessions - a.sessions);

  // "hard" and "limit" both mean at or past what can be absorbed, so a run that
  // alternates between them is still a run — splitting them into two streaks
  // would hide the thing they have in common, which is the thing to act on.
  const hardStreak = [...byMovement]
    .map(([key, entries]) => {
      const sessions = runOf(entries, (v) => v === "hard" || v === "limit");
      const run = entries.slice(0, sessions);
      return {
        movement: findMovement(key)?.name ?? key,
        sessions,
        worst: (run.some((e) => e.verdict === "limit") ? "limit" : "hard") as Verdict,
      };
    })
    .filter((s) => s.sessions >= 2)
    .sort((a, b) => b.sessions - a.sessions);

  // ── The tape ──
  const tape = db
    .select()
    .from(measurementsTable)
    .orderBy(asc(measurementsTable.date))
    .all();
  const lastTape = tape.length ? tape[tape.length - 1] : null;
  const firstWaist = tape.find((r) => r.waistCm !== null) ?? null;
  const lastWaist = [...tape].reverse().find((r) => r.waistCm !== null) ?? null;
  const waistSpan =
    firstWaist && lastWaist && firstWaist.date !== lastWaist.date
      ? daysBetween(firstWaist.date, lastWaist.date)
      : null;

  // ── What the weight was made of ──
  const split = compositionSummary(buildComposition(rows));

  // ── THE WEB ──
  const records = movementRecords();
  const nearMastery = [...records.values()]
    .filter((r) => !r.mastered && r.cleanSessions > 0)
    .map((r) => ({
      movement: r.movement.name,
      cleanSessions: r.cleanSessions,
      needSessions: masterySessions(r.movement),
      cleanWeeks: r.cleanWeeks,
      needWeeks: masteryWeeks(r.movement),
    }))
    .sort(
      (a, b) =>
        b.cleanSessions / b.needSessions - a.cleanSessions / a.needSessions,
    )
    .slice(0, 4);
  const masteredRecently = [...records.values()]
    .filter((r) => r.mastered && r.lastDate !== null && r.lastDate >= addDays(date, -14))
    .map((r) => r.movement.name)
    .slice(0, 4);

  // ── Milestones ──
  const trialRows = db.select().from(trials).orderBy(asc(trials.date)).all();
  const lastTrial = trialRows.length ? trialRows[trialRows.length - 1] : null;
  const abilityCount = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(abilities)
    .where(eq(abilities.achieved, true))
    .get()?.n ?? 0;

  const phase = phaseForDay(day);
  const todaysPlan = sessionFor(phase.id, dayKeyOf(date));
  const intake = intakeForDay(day);

  return {
    today: date,
    dayKey: dayKeyOf(date),
    day,
    totalDays: stats.totalDays,
    phase: { id: phase.id, name: phase.codename, focus: phase.focus },
    week: {
      index: wk,
      lowProfile: isLowProfileWeek(wk),
      refuel: isRefuelWeek(wk),
      rounds: roundsForWeek(wk),
    },
    vitals: {
      latestKg: round1(last?.weightKg ?? null),
      avg7: round1(avg7),
      avg7LastWeek: round1(avg7Prev),
      corridorKg: round1(stats.corridorTarget)!,
      corridorState: stats.corridorState,
      deltaFromStartKg: round1(stats.deltaFromStart),
      targetKg: stats.targetWeightKg,
      daysSinceWeighIn: last ? daysBetween(last.date, date) : null,
      bodyfatPct: stats.latestBodyfat?.pct ?? null,
    },
    fuel: {
      kcalTargetToday: intake.kcal,
      plannedKcal: intake.planned,
      adjustment: intake.adjustment,
      proteinTargetG: proteinTarget,
      last7: fuelDays,
      daysLogged7: logged.length,
      avgKcal7: logged.length ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length) : null,
      avgProtein7: logged.length ? Math.round(logged.reduce((s, d) => s + d.proteinG, 0) / logged.length) : null,
      proteinDaysMet7: logged.filter((d) => d.proteinG >= proteinTarget).length,
      overTargetDays,
      topSnacks7,
      guides: nutrientGuidesForDay(day, intake.kcal).map((g) => ({
        label: g.label,
        kind: g.kind,
        grams: g.grams,
        source: g.source,
        avg7: guideAverages[g.key] ?? null,
      })),
    },
    patrol: {
      last7: patrolDays,
      doneThisWeek: weekSessions.filter((s) => s.completed).length,
      dueThisWeek: 5,
      todaysSession: todaysPlan
        ? { title: todaysPlan.title, movements: todaysPlan.main.map((m) => m.name).slice(0, 8) }
        : null,
      nextThreeDays: [1, 2, 3].map((i) => {
        const d = addDays(date, i);
        const p = phaseForDay(daysBetween(settings.startDate, d));
        return { date: d, dayKey: dayKeyOf(d), title: sessionFor(p.id, dayKeyOf(d))?.title ?? null };
      }),
      lastSessionDaysAgo: lastDone ? daysBetween(lastDone.date, date) : null,
      skipped,
      shortfalls,
    },
    maintenance: {
      dailyTotal: standings.daily.length,
      dailyDone: standings.daily.filter((s) => s.done).length,
      weeklyTotal: standings.weekly.length,
      weeklyDone: standings.weekly.filter((s) => s.done).length,
      outstandingToday: standings.daily.filter((s) => !s.done).map((s) => s.chore.name),
      outstandingThisWeek: standings.weekly.filter((s) => !s.done).map((s) => s.chore.name),
      malusPct: Math.round(malus.fraction * 100),
      missedYesterday: malus.missedDaily,
      missedLastWeek: malus.missedWeekly,
      cleanDays7,
    },
    feedback: {
      recent: fbRows.slice(0, 12).map((f) => ({
        date: f.date,
        movement: findMovement(f.exerciseKey)?.name ?? f.exerciseKey,
        verdict: f.verdict,
      })),
      counts: verdictCounts,
      answered: fbRows.length,
      painful: [...painTally.values()].sort((a, b) => b.date.localeCompare(a.date)),
      easyStreak,
      hardStreak,
    },
    measurements: {
      latest: lastTape
        ? {
            date: lastTape.date,
            waistCm: lastTape.waistCm,
            neckCm: lastTape.neckCm,
            chestCm: lastTape.chestCm,
            thighCm: lastTape.thighCm,
            upperArmCm: lastTape.upperArmCm,
          }
        : null,
      waistDeltaCm:
        firstWaist && lastWaist && waistSpan !== null && waistSpan >= 14
          ? round1(lastWaist.waistCm! - firstWaist.waistCm!)
          : null,
      spanDays: waistSpan,
      daysSinceLast: lastTape ? daysBetween(lastTape.date, date) : null,
    },
    composition: split
      ? {
          fatDeltaKg: split.fatDeltaKg,
          leanDeltaKg: split.leanDeltaKg,
          fatSharePct: split.fatShare === null ? null : Math.round(split.fatShare * 100),
          spanDays: split.spanDays,
        }
      : null,
    web: {
      nearMastery,
      masteredRecently,
      lockedInTodaysSession: lockedFor(phase.id, dayKeyOf(date), date).map((l) => ({
        name: l.name,
        why: l.why,
      })),
    },
    milestones: {
      trialsRun: trialRows.length,
      lastTrial: lastTrial
        ? { date: lastTrial.date, monthIndex: lastTrial.monthIndex, score: lastTrial.score }
        : null,
      abilitiesUnlocked: abilityCount,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// The prompt
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the coach for ARACHNE, a twelve-month Spider-Man-inspired fitness programme run by one person from a private app. You write the briefing that sits at the top of their home screen each morning.

WHAT THIS IS
A short, direct paragraph or two — 90 to 150 words, never more. Read across everything: PATROL (training), FUEL (food and water), VITALS (weight), and where they are in the year. Say what went well, say plainly what did not, and give them today.

VOICE
Spoken by a coach who knows them and has seen the numbers. Calm, specific, faintly wry. Never chirpy, never a motivational poster, never a listicle. British English. Address them as "you". Prose only — no headings, no bullet points, no emoji, no markdown.

BE HONEST, NOT NICE
This is the part that matters most. You are a coach, not a cheerleader. They have asked you to push them, and a briefing that congratulates them on a bad week is worse than no briefing.

- Never praise for the sake of it. Say something went well only when the data shows it went well, and say which number says so. No praise without evidence.
- If they went over the calorie target, say so and name the item. "You were 480 over on Thursday, and 620 of that was the pizza" is the sentence. "Watch your intake" is not.
- If a movement came in under what was prescribed, say what it was and by how much, then give one concrete correction. The data hands you the catalogue's own coaching notes for that movement — use them. Do not invent technique advice.
- If they skipped a patrol, say so plainly and without softening it. Skipping one is a fact to state; skipping two or more in a week deserves a sharper sentence than that. Do not pretend it was a rest day.
- If a number went backwards, say it went backwards.
- Do not open with reassurance before getting to the problem, and do not end by taking the criticism back. Say the hard thing once, mean it, then say what to do about it.

PAIN OVERRIDES EVERYTHING
feedback.painful lists movements they marked as painful, with how many times. If anything is in there, it is the most important thing in the data and it changes what you are for that morning: say which movement, and tell them to leave it out or drop to an easier version rather than push through it. Do not tell someone to work harder on a movement they have reported pain on — not in the same paragraph, not anywhere. If the pain has repeated, say so and tell them to get it looked at. You are not diagnosing anything; you are declining to coach through it.

Only "painful" triggers any of the above. It is the one answer on the scale that is not about effort at all.

THE FIVE ANSWERS, AND WHAT EACH ONE ASKS YOU TO DO
After every session they rate every movement on one scale. Read left to right it runs from too little to too much:

- easy — almost no effort. This is an instruction to make it harder, and it is the one thing the data cannot work out on its own: the reps say nothing about whether they flew up. Name the movement and say to add weight, or reps, or take the next rung.
- clean — done as asked, the right amount. Nothing to say. This is the target state, not an absence of information.
- hard — finished it, but it took everything. Ordinary and good. Hard is what training is; a week full of "hard" is a week that worked.
- limit — could not reach the goal, and nothing hurt. Different from hard in the way that matters: the load was past what could be absorbed that day. Once is a bad night's sleep. Repeated is a programming problem.
- painful — a joint, or somewhere that should not hurt. See above.

feedback.counts is how many of each there were and feedback.answered is how many answers in total, so read any one against the total rather than on its own.

feedback.easyStreak is movements that came back "easy" two or more sessions running. That is the clearest actionable signal in the whole dataset and the one most likely to go unsaid, because nothing is going wrong — say the movement, say it has been effortless that many times, and say what to add. Leaving it alone is how a rung stops training anyone.

feedback.hardStreak is the mirror: movements at or past the edge — "hard" or "limit", in any mix — that many sessions in a row. Its "worst" field says which. Two is worth naming; three or more is a load that is not being absorbed, and the answer is to change the programming rather than ask for more effort: hold the weight and reps where they are until it comes back clean, or drop to the rung below for a session. Never respond to a hard streak by telling them to push harder. A movement that has left either list has changed, and saying so is earned praise.

WHERE THE LINE IS
Blunt about the work, never about them as a person. Criticise the session, the choice, the week — never their character, their body or their worth. Do not shame, do not moralise about food, do not call anything a cheat or a sin, and never imply they should punish themselves with training or by eating less. Sharp and fair, the way a good coach is. If the week was genuinely good, say that plainly too — earned praise is not flattery.

THE PROGRAMME'S OWN WORDS — use these, they are what the screens say:
PATROL is a training session. FUEL is food. VITALS is the scale. THE WEB is the skill tree. MAINTENANCE is the household chores — daily ones like brushing teeth, weekly ones like laundry. LOW PROFILE WEEK is a deload. REFUEL WEEK is a planned week at maintenance calories. OFF-DUTY is a rest day.

RULES
- Use only the numbers in the data. Never invent a figure, a weight, a calorie count, a food or a session that is not there.
- Lead with what actually matters today. One sharp observation beats four weak ones.
- Always name specifics: the food, the movement, the day, the number. Vagueness is the failure mode.
- Finish on today: what this session is for, or what to watch, or what to eat. One sentence of the days ahead is welcome; today is the focus.
- Do not give medical advice. Never suggest eating below the plan's calorie target, and never suggest training to make up for food.
- If there is barely any data yet — a new run, a quiet week — say something short and useful rather than padding it out.

DO NOT REPEAT YOURSELF
You will be given the briefings you wrote over the last fortnight, newest first. Read them before you write. They are what this person has already been told, and saying it again as though for the first time is the fastest way to make them stop reading.

- Default to finding something you have not said. There is almost always more in the data than fits in one paragraph, so a point you made two days ago should lose to one you have not made at all.
- If the only thing worth saying is something you have said, say it differently and say what has changed since. "Protein short again — third week now, and it is the reason the scale has stalled" is a new sentence. Repeating the old one word for word is not.
- Never re-use a phrase or an opening you used in the last few days. Vary how a briefing starts; several in a row that open the same way read as a template.
- Do not congratulate them on something you already congratulated them on this week unless it has grown into a streak worth naming.

WHEN REPEATING IS RIGHT
Repetition is a tool, not a rule to break. Say a thing again, deliberately and harder, when:
- it is getting worse rather than staying the same;
- they have been told and it has changed nothing, and naming that pattern is the point ("that is the fourth time this fortnight");
- it is the single most important thing in the data today and everything else is noise.
In those cases be explicit that it is not the first time. The problem is amnesia, not emphasis.

WHAT THE DATA GIVES YOU
fuel.overTargetDays carries each day that went over, with worstItems — the biggest entries by calories. That is where you find the thing to name.
fuel.topSnacks7 is the week's most expensive snacking, usually the same short list repeating.
patrol.skipped is training days that produced nothing. "started": true means they opened the session and abandoned it, which is a different failure from not turning up and can be said differently.
patrol.last7 carries their own note against each session. Read them. A note is the only thing in this entire dataset written by them rather than measured about them, and it will often explain a number you would otherwise misread — a bad session with "slept four hours" in the note is not a discipline problem. Quote or answer a note where it is relevant; never ignore one that explains a shortfall you are about to criticise.

measurements is the tape. waistDeltaCm is the honest progress number when the scale stalls — say so when the weight has not moved but the waist has. composition splits the last fortnight's weight change into fat and lean: a large lean loss is bad news however good the scale looks, and fatSharePct above 85 is the deficit working properly.

web.nearMastery is what is closest to unlocking on THE WEB, with clean sessions and weeks against what is needed. "Two more clean sessions on the incline row and the next rung opens" is the single most motivating sentence available to you — use it when something is genuinely close. web.lockedInTodaysSession is work the tree is holding back today, with the reason.

milestones is THE TRIAL and ABILITIES. Rarely the story; worth a line when a trial has just happened or is overdue.

maintenance is the chores. A daily one missed yesterday costs 10% of today's XP and a weekly one missed last week costs 20%, added together and capped at 50% — so malusPct is a real number you can name. missedYesterday and missedLastWeek are what earned it; outstandingToday and outstandingThisWeek are what is still open. cleanDays7 counts days last week that ended with every daily chore done.

Treat this like the rest: worth a sentence when there is something to say, not a daily roll-call. Do not list the chores back at them. A running penalty, a chore missed several days in a row, or a week where they cleared everything are all worth naming; one forgotten toothbrushing is not. Never moralise about it — a missed chore is a missed chore, not a character flaw.

patrol.shortfalls is movements that came in under the prescription, each with target, best, previousBest, the sets done against the sets planned, and the catalogue's own "watch" and "cues" for that movement. Use those for the correction — they are the programme's own coaching, and they are why you can be specific about technique without guessing.

PROTEIN IS THE ONLY NUMBER TO HIT
fuel.guides carries reference values for carbs, fat, fibre, sugar and salt, each with the week's average against it. They are orientation, not targets, and you must not turn them into targets. Do not read them back as a list, do not score the day against them, and never suggest that being under one is a failure — a day at 22 g of fibre is a normal day, not a lapse.

Their "kind" field says what each one even means: "around" is a rough share, "rest" is whatever the calories have left, "atLeast" is a floor you cannot overshoot, "under" is a soft ceiling. A number below an "atLeast" is worth knowing; a number below an "under" is simply good. And "source" matters when you name one: two come from the plan document, three are ordinary public guidance it never mentions — never cite the latter as the plan's.

The bar for mentioning one at all is high: a full week substantially adrift, where saying so would change what they buy. "Fibre has averaged 12 g against 30 — that is most of why you are hungry at nine" is worth a sentence once. Salt and sugar almost never are, and the rule against moralising about food applies to them with particular force.

MOST SETS ARE A RANGE, AND ANYWHERE INSIDE IT IS A PASS
The programme prescribes ranges: 8–12 reps, 30–45 seconds. Landing anywhere inside one is a set done right, not a set half done. Ten reps of an 8–12 set is a success and adding a rep next time is the plan working exactly as intended — never describe it as being two short, and never compute a gap against the top of a range. Only what falls below the bottom is a shortfall, and shortfalls[].target is already that bottom, with shortfalls[].range carrying the range as written when there is one. Anything not in shortfalls at all cleared what it was asked for; say nothing about it.

The same applies across sessions. Reps drifting around inside the range is ordinary, and reps dropping right after the weight went up is the point of the weight going up — that is progression, not a regression, and calling it a bad session tells them to undo the thing that is working.`;

export function buildUserText(f: BriefingFacts, previous: BriefingRow[] = []): string {
  const parts = ["Write today's briefing from this data.", "", JSON.stringify(f, null, 1)];

  if (previous.length > 0) {
    parts.push(
      "",
      `WHAT YOU ALREADY TOLD THEM — your last ${previous.length} ${previous.length === 1 ? "briefing" : "briefings"}, newest first.`,
      "Do not repeat these points as though they were new. Find something you have not said, or say it differently and say what has changed.",
      "",
      ...previous.map((p) => `[${p.date}] ${p.body}`),
    );
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────
// The fallback
// ─────────────────────────────────────────────────────────────

/**
 * What to say when the model cannot be reached.
 *
 * Not an apology and not an error — the same observations, composed from the
 * same facts by hand. It is worse prose and it is never nothing, which is the
 * right trade at 08:00 on a Tuesday with no internet.
 */
export function localBriefing(f: BriefingFacts, previous: BriefingRow[] = []): string {
  const { vitals, fuel, patrol, week } = f;
  /** Observations, ranked. Only the sharpest few make it into the paragraph. */
  const seen: { p: number; topic: string; text: string; context?: boolean }[] = [];
  /**
   * `context: true` marks a standing state rather than a finding — that this is
   * a REFUEL WEEK, that it is a deload. Those are true all week and are never
   * the headline: the headline slot is exempt from repetition demotion, so a
   * week-long state parked in it makes seven identical mornings, which is the
   * exact complaint the rotation exists to answer.
   */
  const say = (p: number, topic: string, text: string, context = false) =>
    seen.push({ p, topic, text, context });

  if (week.refuel) {
    say(86, "refuel", `REFUEL WEEK. Eat at maintenance — ${fuel.kcalTargetToday.toLocaleString("en-GB")} kcal — and take the two-round sessions. Scheduled recovery, not a slip.`, true);
  } else if (week.lowProfile) {
    say(60, "lowprofile", "LOW PROFILE WEEK — two rounds instead of three, and nothing to failure.", true);
  }

  // ── Skipped patrols. The loudest thing in the data. ──
  if (patrol.skipped.length >= 2) {
    say(98, "skipped", `${patrol.skipped.length} patrols missed this week — ${listOf(patrol.skipped.map((s) => dayName(s.dayKey)))}. That is not a slow week, it is most of one gone. Turning up is the whole of Phase 1.`);
  } else if (patrol.skipped.length === 1) {
    const s = patrol.skipped[0];
    say(
      88,
      "skipped",
      s.started
        ? `You opened ${dayName(s.dayKey)}'s ${s.title ?? "session"} and did not finish it. An abandoned session is still a miss.`
        : `${dayName(s.dayKey)}'s ${s.title ?? "patrol"} did not happen. Recoverable — but do not stack it on top of today's.`,
    );
  } else if (patrol.lastSessionDaysAgo !== null && patrol.lastSessionDaysAgo >= 3) {
    say(95, "skipped", `${patrol.lastSessionDaysAgo} days since the last PATROL. Start with today's and do not try to make up the others.`);
  } else if (patrol.doneThisWeek >= 4) {
    say(40, "attendance", `${patrol.doneThisWeek} of ${patrol.dueThisWeek} patrols done this week — that is the number that decides the year.`);
  }

  // ── The movement that went worst, and the catalogue's reason why. ──
  const worst = patrol.shortfalls[0];
  if (worst) {
    const u = worst.metric === "time" ? "s" : "";
    // Both can be true at once — one set, and that set short — and saying only
    // the louder half loses the reason it happened.
    const short = worst.target !== null && worst.best !== null && worst.best < worst.target;
    // Mirrors findShortfalls: inside a range is not a step backwards, so the
    // sentence must not claim one either.
    const back =
      worst.range === null &&
      worst.previousBest !== null &&
      worst.best !== null &&
      worst.best < worst.previousBest;
    const cut = worst.setsDone < worst.setsPlanned;

    const parts: string[] = [];
    if (cut) parts.push(`${worst.setsDone} ${worst.setsDone === 1 ? "set" : "sets"} of ${worst.setsPlanned}`);
    // Against the range where there is one — "6 against 8–12" is a miss you can
    // act on, where "6 against 8" hides what the set was actually asking for.
    if (short) parts.push(`${worst.best}${u} against ${worst.range ?? worst.target}${u}`);
    else if (back) parts.push(`${worst.best}${u}, down from ${worst.previousBest}${u}`);

    if (parts.length > 0) {
      say(
        cut && !short ? 80 : short ? 85 : 83,
        `shortfall:${worst.name}`,
        `${worst.name}: ${listOf(parts)}.` +
          (cut ? " Finish the sets — the last one is the one doing the work." : "") +
          (short || back ? correction(worst) : ""),
      );
    }
  }

  // ── FUEL, naming what actually did the damage. ──
  if (fuel.daysLogged7 === 0) {
    say(92, "logging", "Nothing logged in FUEL this week. Photograph what you eat — you cannot fix a week you cannot see.");
  } else {
    const over = [...fuel.overTargetDays].sort((a, b) => b.overBy - a.overBy);
    if (over.length > 0) {
      const d = over[0];
      const item = d.worstItems[0];
      say(
        90,
        "overtarget",
        `${dayName(dayKeyOf(d.date))} finished ${d.overBy} kcal over at ${d.kcal.toLocaleString("en-GB")}` +
          (item ? `, and ${item.kcal} of that was the ${item.description.toLowerCase()}` : "") +
          `.${over.length > 1 ? ` ${over.length} days over this week.` : ""}`,
      );
    }
    if (fuel.daysLogged7 <= 4) say(70, "logging", `FUEL logged on only ${fuel.daysLogged7} of the last 8 days.`);
    if (fuel.avgProtein7 !== null && fuel.avgProtein7 < fuel.proteinTargetG) {
      say(75, "protein", `Protein is averaging ${fuel.avgProtein7} g against ${fuel.proteinTargetG} g — the gap that costs muscle in a deficit.`);
    } else if (fuel.proteinDaysMet7 >= 5 && over.length === 0) {
      say(50, "protein", `Protein hit on ${fuel.proteinDaysMet7} of the logged days and nothing over target. That is a good week.`);
    }
  }

  // ── Pain ──
  // Above everything, including a week of missed patrols. A briefing that tells
  // you to push on a movement you flagged as painful is the one way this panel
  // could actually do harm, and severity ranking is what prevents it.
  const hurt = f.feedback?.painful ?? [];
  if (hurt.length > 0) {
    const worstPain = [...hurt].sort((a, b) => b.times - a.times)[0];
    say(
      100,
      `pain:${worstPain.movement}`,
      worstPain.times > 1
        ? `You have marked ${worstPain.movement.toLowerCase()} as painful ${worstPain.times === 2 ? "twice" : `${worstPain.times} times`}. Leave it out and use the easier version underneath it — and if it keeps happening, get it looked at rather than trained through.`
        : `You marked ${worstPain.movement.toLowerCase()} as painful on ${dayName(dayKeyOf(worstPain.date))}. Drop to the rung below it today rather than pushing through.`,
    );
  }

  // ── A movement that keeps coming back hard ──
  // Below pain and below a missed patrol, but above the weight trend: it is a
  // programming problem with a specific answer, and it is only visible at all
  // because the question is asked after every session rather than the first.
  const streak = (f.feedback?.hardStreak ?? []).filter(
    (s) => !hurt.some((p) => p.movement === s.movement),
  )[0];
  if (streak) {
    const times = streak.sessions === 2 ? "twice" : `${streak.sessions} times`;
    say(
      72,
      `hard:${streak.movement}`,
      streak.worst === "limit"
        ? `${streak.movement} has come in under the target ${times} in a row without hurting. That is the load being past what you can absorb, not a lack of effort — hold it, or drop to the rung below for a session.`
        : `${streak.movement} has come back hard ${times} in a row. Hold the load where it is until it feels clean again — adding to it now buys nothing.`,
    );
  }

  // ── And the other direction ──
  // Nothing is going wrong here, which is exactly why it goes unsaid: a rung
  // that costs no effort has stopped training anyone, and the reps alone cannot
  // tell you that. Below a hard streak, because a load that is too light is a
  // wasted session and a load that is too heavy is an injury.
  const tooEasy = (f.feedback?.easyStreak ?? [])[0];
  if (tooEasy) {
    say(
      64,
      `easy:${tooEasy.movement}`,
      `${tooEasy.movement} has felt easy ${tooEasy.sessions === 2 ? "twice" : `${tooEasy.sessions} times`} in a row. Add weight, or take it to the top of the range and then add weight — it has stopped asking anything of you.`,
    );
  }

  // ── The tape, when the scale is being unhelpful ──
  const tape = f.measurements;
  if (tape?.waistDeltaCm !== null && tape?.waistDeltaCm !== undefined && tape.waistDeltaCm <= -1) {
    say(
      68,
      "waist",
      `Waist is down ${Math.abs(tape.waistDeltaCm)} cm over ${tape.spanDays} days. That is the number that matters when the scale is being stubborn.`,
    );
  } else if (tape?.daysSinceLast !== null && tape?.daysSinceLast !== undefined && tape.daysSinceLast >= 30) {
    say(48, "tape", `No tape measurements for ${tape.daysSinceLast} days. The waist reading is the one that keeps moving when the scale does not.`);
  }

  // ── What the weight was made of ──
  const comp = f.composition;
  if (comp && comp.leanDeltaKg <= -1 && (comp.fatSharePct ?? 100) < 70) {
    say(
      93,
      "composition",
      `Only ${comp.fatSharePct}% of the last ${comp.spanDays} days' change came off as fat — lean mass is down ${Math.abs(comp.leanDeltaKg)} kg. Hit the protein every day and do not deepen the deficit.`,
    );
  } else if (comp && (comp.fatSharePct ?? 0) >= 85) {
    // Over 100% is not a rounding error: it means lean mass went *up* while fat
    // came down, which is the best outcome available and reads as nonsense if
    // reported as a percentage.
    say(
      44,
      "composition",
      (comp.fatSharePct ?? 0) > 100
        ? `Over the last ${comp.spanDays} days you lost ${Math.abs(comp.fatDeltaKg)} kg of fat and gained ${comp.leanDeltaKg} kg of lean mass. That is the outcome everything else is in service of.`
        : `${comp.fatSharePct}% of the last ${comp.spanDays} days' change was fat. That is the deficit doing exactly its job.`,
    );
  }

  // ── THE WEB ──
  const close = (f.web?.nearMastery ?? []).filter(
    (n) => n.needSessions - n.cleanSessions <= 2 || n.needWeeks - n.cleanWeeks <= 1,
  );
  if (close.length > 0) {
    const n = close[0];
    const sessionsLeft = Math.max(0, n.needSessions - n.cleanSessions);
    const weeksLeft = Math.max(0, n.needWeeks - n.cleanWeeks);
    // The sessions can all be there and the movement still not be mastered:
    // the bar asks for them spread across calendar weeks, and that is the part
    // you cannot cram. Saying "0 sessions from mastered" would be a lie.
    say(
      66,
      `web:${n.movement}`,
      sessionsLeft === 0 && weeksLeft > 0
        ? `${n.movement} has its ${n.needSessions} clean sessions — it is waiting on the calendar now, ${weeksLeft} more ${weeksLeft === 1 ? "week" : "weeks"} with a clean session in ${weeksLeft === 1 ? "it" : "each"}.`
        : `${n.movement} is ${sessionsLeft} clean ${sessionsLeft === 1 ? "session" : "sessions"} from mastered — ${n.cleanSessions} of ${n.needSessions}, across ${n.cleanWeeks} of ${n.needWeeks} weeks.`,
    );
  }

  // ── MAINTENANCE ──
  // The malus first, because it is the only observation here attached to a
  // number the person is actively losing.
  // Defensive: a caller assembling facts by hand (a test, a probe) should not
  // be able to take the top of HQ down over a missing section.
  const m = f.maintenance ?? {
    dailyTotal: 0, dailyDone: 0, weeklyTotal: 0, weeklyDone: 0,
    outstandingToday: [], outstandingThisWeek: [],
    malusPct: 0, missedYesterday: [], missedLastWeek: [], cleanDays7: 0,
  };
  if (m.malusPct > 0) {
    const why = [
      m.missedYesterday.length > 0 ? `${listOf(m.missedYesterday.map((s) => s.toLowerCase()))} yesterday` : null,
      m.missedLastWeek.length > 0 ? `${listOf(m.missedLastWeek.map((s) => s.toLowerCase()))} last week` : null,
    ].filter(Boolean);
    say(
      87,
      "malus",
      `You are on −${m.malusPct}% XP today for ${why.join(" and ")}. Clear today's list and tomorrow is back to full.`,
    );
  } else if (m.cleanDays7 >= 6 && m.dailyTotal > 0) {
    say(42, "chores", `${m.cleanDays7} clean days of MAINTENANCE last week, and no malus to show for it.`);
  }
  if (m.outstandingThisWeek.length > 0 && ["fri", "sat", "sun"].includes(f.dayKey)) {
    say(
      72,
      "choresweek",
      `${listOf(m.outstandingThisWeek)} still open and the week is nearly gone — after Sunday it is a ${WEEKLY_MALUS_PCT}% malus on every day of next week.`,
    );
  }

  // ── VITALS ──
  if (vitals.daysSinceWeighIn === null) {
    say(94, "weighin", "No weight logged yet. The corridor cannot tell you anything without a reading.");
  } else if (vitals.daysSinceWeighIn >= 3) {
    say(91, "weighin", `No reading for ${vitals.daysSinceWeighIn} days — the average is guesswork until you step on the scale.`);
  } else if (vitals.avg7 !== null && vitals.avg7LastWeek !== null) {
    const move = Math.round((vitals.avg7LastWeek - vitals.avg7) * 10) / 10;
    if (move > 0.1) say(45, "trend", `Average is down ${move} kg on last week.`);
    else if (move < -0.1) say(65, "trend", `Average is up ${Math.abs(move)} kg on last week. One week is noise; two is a trend.`);
    else say(55, "trend", "Average is flat on last week.");
  }

  // The closing line always survives — a briefing that does not land on today
  // is a report, and a report is not what the top of the home screen is for.
  const closing = patrol.todaysSession
    ? `Today is ${patrol.todaysSession.title} — ${week.rounds} rounds. ${fuel.kcalTargetToday.toLocaleString("en-GB")} kcal and ${fuel.proteinTargetG} g of protein.`
    : `OFF-DUTY today. Still weigh in and still log — ${fuel.kcalTargetToday.toLocaleString("en-GB")} kcal, ${fuel.proteinTargetG} g of protein.`;

  // Three observations at most. Everything true is not the same as everything
  // worth saying, and a paragraph nobody finishes coaches nobody.
  //
  // Demoted rather than dropped if it was said in the last few days: a point
  // that keeps being true deserves to resurface, just not ahead of something
  // that has never been said at all. A missed patrol at 98 still outranks a
  // fresh weight trend at 45 even after the penalty, which is correct — some
  // things are worth saying twice.
  const said = recentTopics(previous);

  // The worst thing survives the rotation, always.
  //
  // Demoting purely by recency put a missed patrol and a 600 kcal overshoot
  // below a notice that this is a LOW PROFILE WEEK, because both had been
  // mentioned yesterday and the deload notice had not. That is the rotation
  // working against the point of the paragraph: a problem does not stop being
  // the biggest problem because you were told about it once.
  //
  // So the top slot goes to the highest severity, undemoted, and the other two
  // rotate. Repetition is discouraged in the places where there is a genuine
  // alternative, and nowhere else.
  const ranked = [...seen].sort((a, b) => b.p - a.p);
  const headline = ranked.find((o) => !o.context);
  const rest = ranked
    .filter((o) => o !== headline)
    .map((o) => ({ ...o, p: o.p - (said.get(o.topic) ?? 0) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 2);

  const chosen = headline ? [headline, ...rest] : rest;
  return [...chosen.map((c) => c.text), closing].join(" ");
}

/**
 * What a topic loses for having been raised recently, by how recently.
 *
 * Graded rather than flat. A flat penalty saturates: after two mornings every
 * topic has been said, every topic is docked the same amount, and the order
 * collapses back to raw severity — which is the loop this was meant to break.
 * Decaying by age keeps the ranking moving, and a point drops far enough to
 * make room for something unsaid without ever being silenced.
 */
const REPEAT_PENALTIES = [35, 25, 15, 8];

/**
 * The most repetition can cost, however many times it has been said.
 *
 * Without a ceiling a topic raised four days running would be buried under
 * roughly everything, and some topics are worth saying four days running.
 */
const REPEAT_PENALTY_CAP = 60;

/** Only the last few days count — a fortnight ago is not repeating yourself. */
const REPEAT_WINDOW_DAYS = REPEAT_PENALTIES.length;

/**
 * Which topics recent briefings already covered.
 *
 * Matched against the composer's own phrasings, which is reliable for the text
 * it wrote itself and best-effort for anything the model wrote. A miss costs a
 * repeated sentence, not a wrong one, so best-effort is the right bar — and the
 * model has the full texts anyway and is told not to repeat them.
 */
const TOPIC_SIGNS: [string, RegExp][] = [
  ["skipped", /patrols? missed|did not happen|still a miss|since the last PATROL|abandoned/i],
  ["attendance", /patrols done this week/i],
  ["overtarget", /kcal over at|days over this week/i],
  // Specific to the observation, not to the word. The closing line names the
  // protein target every single day — a bare /protein/ matched that and left
  // the topic permanently flagged as already said, so the one observation the
  // rotation most needed to surface was the one it could never reach.
  ["protein", /protein is averaging|protein hit on/i],
  ["logging", /logged on only|nothing logged in FUEL|photograph what you eat/i],
  ["weighin", /no reading for|no weight logged|step on the scale/i],
  ["trend", /average is (down|up|flat)/i],
  ["waist", /waist is down|tape measurements/i],
  ["tape", /tape measurements/i],
  ["composition", /came off as fat|change was fat/i],
  ["malus", /% XP today|malus/i],
  ["chores", /MAINTENANCE/],
  ["choresweek", /still open and the week/i],
  ["refuel", /REFUEL WEEK/i],
  ["lowprofile", /LOW PROFILE WEEK/i],
];

/**
 * Topic → what it should lose for having been said recently.
 *
 * Accumulated across every morning it appeared, not just the most recent one.
 * Counting only the latest mention made the ranking oscillate with a period of
 * two and then settle: a high-severity topic dropped for one morning, came
 * straight back the next, and three mornings in four were identical — which is
 * the complaint this whole mechanism exists to answer. Repetition fatigue
 * builds up, so the penalty does too.
 */
export function recentTopics(previous: BriefingRow[]): Map<string, number> {
  const out = new Map<string, number>();
  // Newest first, so index 0 is yesterday.
  previous.slice(0, REPEAT_WINDOW_DAYS).forEach((row, i) => {
    const cost = REPEAT_PENALTIES[i] ?? 0;
    const note = (topic: string) => {
      out.set(topic, Math.min(REPEAT_PENALTY_CAP, (out.get(topic) ?? 0) + cost));
    };
    for (const [topic, sign] of TOPIC_SIGNS) if (sign.test(row.body)) note(topic);
    // Shortfalls are keyed by movement, so the name in the text is the signal.
    for (const m of row.body.matchAll(/\b([A-Z][a-z]+(?: [a-z-]+){1,3})(?=:| came in| went backwards)/g)) {
      note(`shortfall:${m[1]}`);
    }
    // As is a hard streak, which is a different thing to say about the same
    // movement and so is tracked separately rather than folded into the above.
    for (const m of row.body.matchAll(/\b([A-Z][a-z]+(?: [a-z-]+){1,3}) has (?:come back hard|come in under the target)/g)) {
      note(`hard:${m[1]}`);
    }
    for (const m of row.body.matchAll(/\b([A-Z][a-z]+(?: [a-z-]+){1,3}) has felt easy/g)) {
      note(`easy:${m[1]}`);
    }
  });
  return out;
}

/**
 * The correction to append to a shortfall, from the catalogue rather than invented.
 *
 * The cues, not the "what goes wrong" note. Both are good coaching, but `watch`
 * often opens with setup — the inverted row's begins "check the table takes your
 * weight before you get under it", which is sound advice and not the reason you
 * managed six instead of ten. The cues are the technique, they are already
 * imperative, and three of them fit in a clause.
 */
function correction(s: BriefingFacts["patrol"]["shortfalls"][number]): string {
  if (s.cues.length === 0) return s.watch ? ` ${s.watch}` : "";
  const cues = s.cues.map((c) => c.toLowerCase()).join(", ");
  return ` ${cues.charAt(0).toUpperCase()}${cues.slice(1)}.`;
}

// ─────────────────────────────────────────────────────────────
// Generation
// ─────────────────────────────────────────────────────────────

function save(date: string, body: string, source: "ai" | "local", model: string | null): BriefingRow {
  // Upsert on the date index: two tabs opening at 08:00 must not race into two
  // rows, and the second one through should simply replace the first.
  db.insert(briefings)
    .values({ date, body, source, model, createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({
      target: briefings.date,
      set: { body, source, model, createdAt: Math.floor(Date.now() / 1000) },
    })
    .run();
  return storedBriefing(date)!;
}

/**
 * Today's briefing, writing it if it is due and missing.
 *
 * Never throws and never returns nothing: a model that is slow, unreachable or
 * talking nonsense falls through to the locally composed version, which is
 * stored so the screen has something and marked so a later load can improve it.
 */
export async function ensureBriefing(date = todayISO(), timeoutMs = 30_000): Promise<BriefingRow | null> {
  const existing = storedBriefing(date);
  if (existing && !upgradable(existing)) return existing;
  if (!existing && !briefingDue(date)) return null;

  const facts = gatherFacts(date);
  const previous = recentBriefings(date);
  const key = apiKey();
  const model = activeVisionModel();

  if (!key || !model) return existing ?? save(date, localBriefing(facts, previous), "local", null);

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserText(facts, previous) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();

    // A refusal, an empty answer or a wall of text are all "the model did not
    // do the job" — the local version is better than any of them.
    if (text.length < 40 || text.length > 2000) throw new Error("unusable length");
    return save(date, stripFormatting(text), "ai", model);
  } catch {
    return existing ?? save(date, localBriefing(facts, previous), "local", null);
  }
}

/**
 * Markdown the prompt asked it not to use, removed rather than rendered.
 *
 * The panel is plain text on purpose; a stray "**" or a bullet in the middle of
 * a paragraph is the one thing that makes it look machine-written.
 */
export function stripFormatting(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)[*_](\S(?:.*?\S)?)[*_](?=\s|$)/g, "$1$2")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
