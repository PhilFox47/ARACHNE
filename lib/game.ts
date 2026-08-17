/**
 * ARACHNE progression engine.
 *
 * Everything here is derived from the database on read — no XP column to drift
 * out of sync, no migration when a rule changes. At a few thousand rows that is
 * free, and it means retroactively fixing a rule fixes history too.
 *
 * Two separate axes, deliberately:
 *   ARACHNE SCORE (lib/plan.ts) — how capable you are. Moves at THE TRIAL.
 *   LEVEL (here)                — how much work you've put in. Moves daily.
 * Capability can plateau for a month while effort keeps paying out. That gap is
 * exactly where people quit, so both need to be visible.
 */

import { addDays, dayKeyOf, daysBetween, weekIndex, weekStartDate } from "./dates";
import {
  CORRIDOR_TOLERANCE_KG,
  TRAINING_DAYS,
  isLowProfileWeek,
  type DayKey,
} from "./plan";
import { corridorTarget, kcalTargetForDay, proteinTargetForDay } from "./course";

// ─────────────────────────────────────────────────────────────
// XP table — tune freely, nothing else depends on the values
// ─────────────────────────────────────────────────────────────

export const XP = {
  weightLog: 25,
  session: 150,
  /** Per set actually recorded. Logging the work is work. */
  setLogged: 10,
  sessionRpe: 25,
  sessionNote: 25,
  fullPatrolWeek: 400,
  foodEntry: 15,
  kcalOnTarget: 75,
  /** Per day the water target is met. */
  waterOnTarget: 40,
  proteinOnTarget: 75,
  suitCheck: 200,
  measurements: 250,
  trial: 1500,
  abilityUnlocked: 500,
  checkpointPassed: 2500,
  challengeWeekly: 250,
  challengeMonthly: 800,
  /**
   * Tiered, not flat. A first-step marker like "log your first reading" and a
   * year-long grind like "250 sessions" are both achievements, but paying them
   * the same makes the opening tap worth as much as the whole year.
   */
  achievementTrivial: 50,
  achievementMilestone: 500,
  achievementMajor: 2000,
  /** Per quiet day beyond the grace period. */
  decayPerDay: -30,
  decayGraceDays: 3,
} as const;

// ─────────────────────────────────────────────────────────────
// Level curve
// ─────────────────────────────────────────────────────────────

/**
 * Set from measurement, not estimate: `npx tsx scripts/tune-curve.ts` runs whole
 * simulated years through this engine and reports what they actually pay out.
 * A consistent year earns ~249k XP, which lands at level 49 here, leaving real
 * headroom to the cap. Re-run that script after changing anything in the XP
 * table above — this constant is only correct relative to those values.
 *
 * The first weight log is deliberately just short of level 2. One tap should
 * show visible progress, not hand out a level.
 */
const LEVEL_K = 104;
export const MAX_LEVEL = 60;

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return LEVEL_K * Math.pow(level - 1, 2);
}

export function levelForXp(xp: number): number {
  if (xp <= 0) return 1;
  return Math.min(Math.floor(Math.sqrt(xp / LEVEL_K)) + 1, MAX_LEVEL);
}

const LEVEL_TITLES = [
  "Civilian",
  "Bystander",
  "First Responder",
  "Street Level",
  "Nightwatch",
  "Wall Crawler",
  "Skyline Regular",
  "City Fixture",
  "The One They Call",
  "No Ceiling",
];

export function levelTitle(level: number): string {
  const idx = Math.min(Math.floor((level - 1) / 6), LEVEL_TITLES.length - 1);
  return LEVEL_TITLES[idx];
}

// ─────────────────────────────────────────────────────────────
// Disciplines — one per training day, levelled independently
// ─────────────────────────────────────────────────────────────

const DISCIPLINE_K = 28;
const MAX_DISCIPLINE_LEVEL = 40;

export interface DisciplineDef {
  key: string;
  dayKey: DayKey;
  name: string;
  sessionTitle: string;
  titles: string[];
}

export const DISCIPLINES: DisciplineDef[] = [
  {
    key: "strike",
    dayKey: "mon",
    name: "STRIKE",
    sessionTitle: "Push & Core",
    titles: ["Untrained", "Steady Hands", "Heavy Set", "Impact", "Overhead"],
  },
  {
    key: "flow",
    dayKey: "tue",
    name: "FLOW",
    sessionTitle: "Mobility & Flow",
    titles: ["Stiff", "Loosening", "Supple", "Fluid", "Boneless"],
  },
  {
    key: "anchor",
    dayKey: "wed",
    name: "ANCHOR",
    sessionTitle: "Pull & Legs",
    titles: ["Hanging On", "Grip", "Lat Work", "Pull Through", "Dead Weightless"],
  },
  {
    key: "pursuit",
    dayKey: "thu",
    name: "PURSUIT",
    sessionTitle: "Conditioning",
    titles: ["Winded", "Second Wind", "Long Legs", "Relentless", "Untiring"],
  },
  {
    key: "acrobatics",
    dayKey: "fri",
    name: "ACROBATICS",
    sessionTitle: "Skills & Explosive",
    titles: ["Grounded", "Rolling", "Inverted", "Airborne", "Weightless"],
  },
];

export function disciplineLevel(xp: number): number {
  if (xp <= 0) return 1;
  return Math.min(Math.floor(Math.sqrt(xp / DISCIPLINE_K)) + 1, MAX_DISCIPLINE_LEVEL);
}

function disciplineXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return DISCIPLINE_K * Math.pow(level - 1, 2);
}

export interface Discipline {
  key: string;
  name: string;
  title: string;
  level: number;
  xp: number;
  progress: number;
  sessions: number;
  /** 0–1 across the five, for the radar. */
  share: number;
}

// ─────────────────────────────────────────────────────────────
// Seeded PRNG — challenges must not reroll on refresh
// ─────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─────────────────────────────────────────────────────────────
// Input / output
// ─────────────────────────────────────────────────────────────

export interface GameSession {
  date: string;
  dayKey: string;
  completed: boolean;
  rpe: number | null;
  note: string | null;
}

export interface GameFood {
  date: string;
  loggedAt: number;
  kcal: number | null;
  proteinG: number | null;
  mealType: "meal" | "snack";
}

export interface GameInput {
  startDate: string;
  today: string;
  weights: { date: string; weightKg: number }[];
  sessions: GameSession[];
  food: GameFood[];
  trials: { date: string; monthIndex: number; score: number | null; pullupsReps: number | null }[];
  photos: { date: string; weekIndex: number; angle: string }[];
  measurements: { date: string }[];
  abilities: { abilityKey: string; achieved: boolean }[];
  /** One entry per recorded set. */
  sets: { date: string }[];
  /** Daily water totals, in ml. */
  water: { date: string; ml: number }[];
  waterTargetMl: number;
}

export interface LedgerRow {
  key: string;
  label: string;
  xp: number;
}

export interface Challenge {
  id: string;
  scope: "weekly" | "monthly";
  title: string;
  description: string;
  target: number;
  current: number;
  reward: number;
  done: boolean;
}

export interface Achievement {
  key: string;
  name: string;
  description: string;
  unlocked: boolean;
  tier: "trivial" | "milestone" | "major";
  xp: number;
  /** Present when the achievement has a natural progress bar. */
  progress?: { current: number; target: number };
}

export interface GameState {
  xp: number;
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number;
  levelProgress: number;
  ledger: LedgerRow[];
  disciplines: Discipline[];
  challenges: Challenge[];
  achievements: Achievement[];
  unlockedAchievements: number;
  patrolStreak: number;
  logStreak: number;
  sessionsTotal: number;
  quietDays: number;
}

// ─────────────────────────────────────────────────────────────
// Streaks
// ─────────────────────────────────────────────────────────────

/**
 * PATROL STREAK. Weekends don't break it — the plan prescribes rest on
 * Saturday and Sunday, so counting them as misses would punish following it.
 * A missed *training* day does break it.
 */
export function patrolStreak(sessions: GameSession[], today: string): number {
  const done = new Set(sessions.filter((s) => s.completed).map((s) => s.date));
  let streak = 0;
  let cursor = today;

  // Don't penalise today until it's over — a streak shouldn't read as broken
  // at 9am on a training day you haven't done yet.
  if (TRAINING_DAYS.includes(dayKeyOf(cursor) as DayKey) && !done.has(cursor)) {
    cursor = addDays(cursor, -1);
  }

  for (let guard = 0; guard < 400; guard++) {
    const dk = dayKeyOf(cursor) as DayKey;
    if (!TRAINING_DAYS.includes(dk)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (done.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    } else break;
  }
  return streak;
}

export function logStreak(weights: { date: string }[], today: string): number {
  const days = new Set(weights.map((w) => w.date));
  let streak = 0;
  let cursor = today;
  if (!days.has(cursor)) cursor = addDays(cursor, -1);
  for (let guard = 0; guard < 400; guard++) {
    if (days.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    } else break;
  }
  return streak;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * The calendar week a week index covers — Monday to Sunday.
 *
 * This counted from the start date rather than from the Monday of the week the
 * start date fell in, and `weekIndex` has always counted calendar weeks. Start
 * on a Tuesday and the two disagreed by a day in a way that lost work rather
 * than misfiling it: on Monday the index had already rolled over to the new
 * week, while the window that index produced did not open until the Tuesday.
 * Monday sat in the gap. Every Monday, not only the first — a patrol, a weight,
 * a meal logged on one counted towards no weekly challenge at all.
 *
 * The general shape was worse than the report: a run started on day N lost
 * Monday through day N-1 of every week, so a Saturday start would have thrown
 * away five days in seven.
 */
function weekRange(startDate: string, wk: number): { from: string; to: string } {
  const from = weekStartDate(startDate, wk);
  return { from, to: addDays(from, 6) };
}

/**
 * The days of a window the run had actually begun for.
 *
 * Anchoring the window on Monday means a mid-week start has a short week 0 —
 * the days before it are real calendar days the plan simply did not exist for.
 * Counting them would set targets that cannot be met, which is the same defect
 * as losing the Monday wearing different clothes.
 */
function daysIn(from: string, to: string, startDate: string): string[] {
  const out: string[] = [];
  for (let d = from > startDate ? from : startDate; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function patrolDaysIn(from: string, to: string, startDate: string): string[] {
  return daysIn(from, to, startDate).filter((d) => TRAINING_DAYS.includes(dayKeyOf(d) as DayKey));
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function kcalByDate(food: GameFood[]): Map<string, { kcal: number; protein: number; snack: number }> {
  const m = new Map<string, { kcal: number; protein: number; snack: number }>();
  for (const f of food) {
    const cur = m.get(f.date) ?? { kcal: 0, protein: 0, snack: 0 };
    cur.kcal += f.kcal ?? 0;
    cur.protein += f.proteinG ?? 0;
    if (f.mealType === "snack") cur.snack += f.kcal ?? 0;
    m.set(f.date, cur);
  }
  return m;
}

/** Full patrol weeks: every training day in the week completed. */
function fullPatrolWeeks(sessions: GameSession[], startDate: string, today: string): number {
  const done = new Set(sessions.filter((s) => s.completed).map((s) => s.date));
  const lastWeek = weekIndex(startDate, today);
  let count = 0;
  for (let wk = 0; wk <= lastWeek; wk++) {
    const { from, to } = weekRange(startDate, wk);
    if (to > today) break;
    // Only the training days the run had begun for. A Tuesday start would
    // otherwise fail week 0 on the Monday before it — a day with nothing to
    // turn up for.
    const patrols = patrolDaysIn(from, to, startDate);
    if (patrols.length > 0 && patrols.every((date) => done.has(date))) count++;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────
// Challenges
// ─────────────────────────────────────────────────────────────

interface ChallengeTemplate {
  key: string;
  scope: "weekly" | "monthly" | "both";
  build: (ctx: ChallengeCtx) => { title: string; description: string; target: number; current: number } | null;
}

interface ChallengeCtx {
  scope: "weekly" | "monthly";
  from: string;
  to: string;
  rng: () => number;
  input: GameInput;
  sessions: GameSession[];
  weights: { date: string; weightKg: number }[];
  food: GameFood[];
  photos: { date: string; weekIndex: number; angle: string }[];
  trials: { date: string; monthIndex: number; score: number | null; pullupsReps: number | null }[];
  measurements: { date: string }[];
  lowProfile: boolean;
  daily: Map<string, { kcal: number; protein: number; snack: number }>;
  /** Days in the window the run had begun for — 7 except in a short week 0. */
  days: string[];
  /** Those of them that are training days. */
  patrolDays: string[];
}

/**
 * A target, never asking for more days than the window holds.
 *
 * A mid-week start has a week 0 shorter than seven days, and a challenge that
 * cannot be cleared is worse than no challenge — it reads as the app not
 * noticing what you did, which is exactly the complaint this release answers.
 */
const fit = (target: number, available: number) => Math.min(target, available);

const TEMPLATES: ChallengeTemplate[] = [
  {
    key: "full_patrol",
    scope: "weekly",
    build: (c) => {
      const need = c.patrolDays.length;
      if (need === 0) return null;
      const done = c.sessions.filter((s) => s.completed).length;
      return {
        title: "Full Patrol",
        description: `Complete all ${need} sessions this week.`,
        target: need,
        current: done,
      };
    },
  },
  {
    key: "mobility_kept",
    scope: "weekly",
    build: (c) => {
      // A start later in the week can produce a week 0 with no Tuesday in it.
      if (!c.patrolDays.some((d) => dayKeyOf(d) === "tue")) return null;
      const done = c.sessions.some((s) => s.completed && s.dayKey === "tue") ? 1 : 0;
      return {
        title: "Don't Skip Tuesday",
        description: "Mobility is the session you'll want to skip. Keep it.",
        target: 1,
        current: done,
      };
    },
  },
  {
    key: "weigh_days",
    scope: "both",
    build: (c) => {
      const target = c.scope === "weekly" ? fit(6, c.days.length) : 24;
      return {
        title: "On the Scale",
        description: `Log your weight on ${target} days.`,
        target,
        current: c.weights.length,
      };
    },
  },
  {
    key: "rpe_logged",
    scope: "weekly",
    build: (c) => {
      const target = fit(3, c.patrolDays.length);
      if (target === 0) return null;
      const current = c.sessions.filter((s) => s.completed && s.rpe !== null).length;
      return {
        title: "Rate the Effort",
        description: `Record an RPE on ${target} sessions.`,
        target,
        current,
      };
    },
  },
  {
    key: "hard_sessions",
    scope: "weekly",
    build: (c) => {
      if (c.lowProfile) return null; // Never ask for intensity in a deload week.
      const target = fit(2, c.patrolDays.length);
      if (target === 0) return null;
      const current = c.sessions.filter((s) => s.completed && (s.rpe ?? 0) >= 4).length;
      return {
        title: "Dig In",
        description: `Finish ${target} sessions at RPE 4 or above.`,
        target,
        current,
      };
    },
  },
  {
    key: "low_profile",
    scope: "weekly",
    build: (c) => {
      if (!c.lowProfile) return null;
      const target = c.patrolDays.length;
      if (target === 0) return null;
      const current = c.sessions.filter((s) => s.completed).length;
      return {
        title: "Low Profile",
        description: "Deload week. Turn up for every session, 2 rounds, nothing to failure.",
        target,
        current,
      };
    },
  },
  {
    key: "notes",
    scope: "weekly",
    build: (c) => {
      const target = fit(2, c.patrolDays.length);
      if (target === 0) return null;
      const current = c.sessions.filter((s) => s.note && s.note.trim().length >= 8).length;
      return {
        title: "Field Notes",
        description: `Write a note on ${target} sessions.`,
        target,
        current,
      };
    },
  },
  {
    key: "kcal_days",
    scope: "both",
    build: (c) => {
      if (c.food.length === 0) return null;
      const target = c.scope === "weekly" ? fit(5, c.days.length) : 20;
      let current = 0;
      for (const [date, tot] of c.daily) {
        if (!inRange(date, c.from, c.to)) continue;
        const day = daysBetween(c.input.startDate, date);
        const { kcal } = kcalTargetForDay(day);
        if (tot.kcal > 0 && tot.kcal <= kcal * 1.05) current++;
      }
      return {
        title: "Under the Line",
        description: `Finish ${target} days at or under the calorie target.`,
        target,
        current,
      };
    },
  },
  {
    key: "protein_days",
    scope: "both",
    build: (c) => {
      if (c.food.length === 0) return null;
      const target = c.scope === "weekly" ? fit(5, c.days.length) : 20;
      // The phase's own figure, read on the window's last day — 160 g through
      // Phases 1 and 2, not the 120 g that three meals of the per-meal rule
      // happens to add up to.
      const need = proteinTargetForDay(daysBetween(c.input.startDate, c.to));
      let current = 0;
      for (const [date, tot] of c.daily) {
        if (!inRange(date, c.from, c.to)) continue;
        if (tot.protein >= need) current++;
      }
      return {
        title: "Protein Wall",
        description: `Hit ${need} g of protein on ${target} days.`,
        target,
        current,
      };
    },
  },
  {
    key: "snack_share",
    scope: "weekly",
    build: (c) => {
      if (c.food.length < 5) return null;
      let total = 0;
      let snack = 0;
      for (const [date, tot] of c.daily) {
        if (!inRange(date, c.from, c.to)) continue;
        total += tot.kcal;
        snack += tot.snack;
      }
      if (total <= 0) return null;
      const pct = Math.round((snack / total) * 100);
      // Inverted: "current" counts as met when the share is under the cap.
      return {
        title: "Quiet Hands",
        description: "Keep snacks under 20% of the week's calories.",
        target: 1,
        current: pct <= 20 ? 1 : 0,
      };
    },
  },
  {
    key: "log_everything",
    scope: "weekly",
    build: (c) => {
      if (c.food.length === 0) return null;
      const days = new Set(c.food.map((f) => f.date)).size;
      const target = fit(6, c.days.length);
      return {
        title: "Nothing Unlogged",
        description: `Log fuel on ${target} days. Awareness is the whole point.`,
        target,
        current: days,
      };
    },
  },
  {
    key: "suit_check",
    scope: "weekly",
    build: (c) => ({
      title: "Suit Check",
      description: "All four angles, same light, same spot.",
      target: 4,
      current: new Set(c.photos.map((p) => p.angle)).size,
    }),
  },
  {
    key: "corridor_hold",
    scope: "monthly",
    build: (c) => {
      if (c.weights.length < 5) return null;
      let current = 0;
      for (const w of c.weights) {
        const day = daysBetween(c.input.startDate, w.date);
        if (Math.abs(w.weightKg - corridorTarget(day)) <= CORRIDOR_TOLERANCE_KG + 1) current++;
      }
      return {
        title: "Hold the Corridor",
        description: "Stay within the target band on 20 days.",
        target: 20,
        current,
      };
    },
  },
  {
    key: "the_trial",
    scope: "monthly",
    build: (c) => ({
      title: "The Trial",
      description: "Run the full benchmark. Six stations and the circuit.",
      target: 1,
      current: c.trials.length > 0 ? 1 : 0,
    }),
  },
  {
    key: "measure",
    scope: "monthly",
    build: (c) => ({
      title: "Tape Measure",
      description: "Waist and neck at minimum — body fat needs both.",
      target: 1,
      current: c.measurements.length > 0 ? 1 : 0,
    }),
  },
  {
    key: "volume",
    scope: "monthly",
    build: (c) => {
      const target = 16;
      return {
        title: "Volume",
        description: `Complete ${target} sessions this month.`,
        target,
        current: c.sessions.filter((s) => s.completed).length,
      };
    },
  },
  {
    key: "perfect_weeks",
    scope: "monthly",
    build: (c) => {
      const target = 2;
      const byWeek = new Map<number, number>();
      for (const s of c.sessions) {
        if (!s.completed) continue;
        const wk = weekIndex(c.input.startDate, s.date);
        byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
      }
      // Against that week's own training days, not a flat five — week 0 of a
      // mid-week start has fewer, and turning up for all of them is still clean.
      const current = [...byWeek].filter(([wk, n]) => {
        const { from, to } = weekRange(c.input.startDate, wk);
        const need = patrolDaysIn(from, to, c.input.startDate).length;
        return need > 0 && n >= need;
      }).length;
      return {
        title: "Clean Weeks",
        description: `Complete ${target} weeks with every session done.`,
        target,
        current,
      };
    },
  },
  {
    key: "spread",
    scope: "monthly",
    build: (c) => {
      const kinds = new Set(c.sessions.filter((s) => s.completed).map((s) => s.dayKey));
      return {
        title: "No Weak Link",
        description: "Complete at least one of all five session types.",
        target: 5,
        current: kinds.size,
      };
    },
  },
];

function buildChallenges(ctx: Omit<ChallengeCtx, "rng">, count: number, periodKey: string): Challenge[] {
  const rng = mulberry32(seedFrom(periodKey));
  const pool = TEMPLATES.filter((t) => t.scope === ctx.scope || t.scope === "both");

  // Deterministic shuffle keyed on the period, so the set is stable all week
  // but different next week.
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const reward = ctx.scope === "weekly" ? XP.challengeWeekly : XP.challengeMonthly;
  const out: Challenge[] = [];

  for (const t of order) {
    if (out.length >= count) break;
    const built = t.build({ ...ctx, rng });
    if (!built || built.target <= 0) continue;
    out.push({
      id: `${periodKey}-${t.key}`,
      scope: ctx.scope,
      title: built.title,
      description: built.description,
      target: built.target,
      current: Math.min(built.current, built.target),
      reward,
      done: built.current >= built.target,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────────

type AchievementTier = "trivial" | "milestone" | "major";

interface AchievementDef {
  key: string;
  name: string;
  description: string;
  tier: AchievementTier;
  evaluate: (i: GameInput, d: Derived) => { unlocked: boolean; current?: number; target?: number };
}

function achievementXp(tier: AchievementTier): number {
  return tier === "major"
    ? XP.achievementMajor
    : tier === "milestone"
      ? XP.achievementMilestone
      : XP.achievementTrivial;
}

interface Derived {
  sessionsDone: number;
  patrolStreak: number;
  logStreak: number;
  fullWeeks: number;
  lostKg: number;
  bestScore: number | null;
  abilitiesDone: number;
  photoWeeks: number;
  trialCount: number;
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: "first_web",
    name: "First Web",
    description: "Log your first reading.",
    tier: "trivial",
    evaluate: (i) => ({ unlocked: i.weights.length > 0 }),
  },
  {
    key: "first_patrol",
    name: "Out the Window",
    description: "Complete your first session.",
    tier: "trivial",
    evaluate: (_i, d) => ({ unlocked: d.sessionsDone > 0 }),
  },
  {
    key: "streak_7",
    name: "Seven",
    description: "A 7-session patrol streak.",
    tier: "milestone",
    evaluate: (_i, d) => ({ unlocked: d.patrolStreak >= 7, current: d.patrolStreak, target: 7 }),
  },
  {
    key: "streak_25",
    name: "Five Clean Weeks",
    description: "A 25-session patrol streak.",
    tier: "milestone",
    evaluate: (_i, d) => ({ unlocked: d.patrolStreak >= 25, current: d.patrolStreak, target: 25 }),
  },
  {
    key: "streak_50",
    name: "Nobody's Watching",
    description: "A 50-session patrol streak. Nobody's watching. You went anyway.",
    tier: "major",
    evaluate: (_i, d) => ({ unlocked: d.patrolStreak >= 50, current: d.patrolStreak, target: 50 }),
  },
  {
    key: "log_30",
    name: "Thirty Mornings",
    description: "Thirty consecutive days on the scale.",
    tier: "milestone",
    evaluate: (_i, d) => ({ unlocked: d.logStreak >= 30, current: d.logStreak, target: 30 }),
  },
  {
    key: "sessions_50",
    name: "Fifty Out",
    description: "Fifty sessions completed.",
    tier: "milestone",
    evaluate: (_i, d) => ({ unlocked: d.sessionsDone >= 50, current: d.sessionsDone, target: 50 }),
  },
  {
    key: "sessions_150",
    name: "One Fifty",
    description: "A hundred and fifty sessions completed.",
    tier: "major",
    evaluate: (_i, d) => ({ unlocked: d.sessionsDone >= 150, current: d.sessionsDone, target: 150 }),
  },
  {
    key: "sessions_250",
    name: "The Whole Year",
    description: "Two hundred and fifty sessions completed.",
    tier: "major",
    evaluate: (_i, d) => ({ unlocked: d.sessionsDone >= 250, current: d.sessionsDone, target: 250 }),
  },
  {
    key: "clean_week",
    name: "Clean Week",
    description: "Every session in a single week.",
    tier: "trivial",
    evaluate: (_i, d) => ({ unlocked: d.fullWeeks >= 1 }),
  },
  {
    key: "clean_month",
    name: "Four in a Row",
    description: "Four full patrol weeks.",
    tier: "milestone",
    evaluate: (_i, d) => ({ unlocked: d.fullWeeks >= 4, current: d.fullWeeks, target: 4 }),
  },
  {
    key: "kg_5",
    name: "Five Down",
    description: "Five kilograms off the starting weight.",
    tier: "milestone",
    evaluate: (_i, d) => ({ unlocked: d.lostKg >= 5, current: Math.max(0, Math.round(d.lostKg)), target: 5 }),
  },
  {
    key: "kg_10",
    name: "Halfway Suit",
    description: "Ten kilograms off. Halfway.",
    tier: "major",
    evaluate: (_i, d) => ({ unlocked: d.lostKg >= 10, current: Math.max(0, Math.round(d.lostKg)), target: 10 }),
  },
  {
    key: "kg_20",
    name: "Suit-Ready",
    description: "Twenty kilograms. The number on the plan.",
    tier: "major",
    evaluate: (_i, d) => ({ unlocked: d.lostKg >= 20, current: Math.max(0, Math.round(d.lostKg)), target: 20 }),
  },
  {
    key: "first_trial",
    name: "Benchmarked",
    description: "Complete your first TRIAL.",
    tier: "trivial",
    evaluate: (_i, d) => ({ unlocked: d.trialCount >= 1 }),
  },
  {
    key: "trials_all",
    name: "Twelve Trials",
    description: "Every monthly benchmark, start to finish.",
    tier: "major",
    evaluate: (_i, d) => ({ unlocked: d.trialCount >= 12, current: d.trialCount, target: 12 }),
  },
  {
    key: "score_300",
    name: "Measurable",
    description: "An ARACHNE Score of 300.",
    tier: "milestone",
    evaluate: (_i, d) => ({ unlocked: (d.bestScore ?? 0) >= 300, current: d.bestScore ?? 0, target: 300 }),
  },
  {
    key: "score_600",
    name: "Target Met",
    description: "An ARACHNE Score of 600 — every station at its month-12 target.",
    tier: "major",
    evaluate: (_i, d) => ({ unlocked: (d.bestScore ?? 0) >= 600, current: d.bestScore ?? 0, target: 600 }),
  },
  {
    key: "first_pullup",
    name: "First Blood",
    description: "One clean pull-up. From zero.",
    tier: "milestone",
    evaluate: (i) => ({ unlocked: i.trials.some((t) => (t.pullupsReps ?? 0) >= 1) }),
  },
  {
    key: "pullups_12",
    name: "Twelve",
    description: "Twelve clean pull-ups — the month-12 target.",
    tier: "major",
    evaluate: (i) => {
      const best = i.trials.reduce((m, t) => Math.max(m, t.pullupsReps ?? 0), 0);
      return { unlocked: best >= 12, current: best, target: 12 };
    },
  },
  {
    key: "suit_4",
    name: "Four Angles",
    description: "A complete SUIT CHECK.",
    tier: "trivial",
    evaluate: (_i, d) => ({ unlocked: d.photoWeeks >= 1 }),
  },
  {
    key: "suit_12",
    name: "Time Lapse",
    description: "Twelve weeks of SUIT CHECK. Now scroll back.",
    tier: "milestone",
    evaluate: (_i, d) => ({ unlocked: d.photoWeeks >= 12, current: d.photoWeeks, target: 12 }),
  },
  {
    key: "ability_1",
    name: "New Trick",
    description: "Unlock your first ABILITY.",
    tier: "trivial",
    evaluate: (_i, d) => ({ unlocked: d.abilitiesDone >= 1 }),
  },
  {
    key: "ability_5",
    name: "Moveset",
    description: "Five ABILITIES unlocked.",
    tier: "milestone",
    evaluate: (_i, d) => ({ unlocked: d.abilitiesDone >= 5, current: d.abilitiesDone, target: 5 }),
  },
];

// ─────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────

export function computeGameState(input: GameInput): GameState {
  const { startDate, today } = input;
  const doneSessions = input.sessions.filter((s) => s.completed);
  const daily = kcalByDate(input.food);

  // ── Ledger ──
  const ledger: LedgerRow[] = [];
  const add = (key: string, label: string, xp: number) => {
    if (xp !== 0) ledger.push({ key, label, xp: Math.round(xp) });
  };

  add("weights", "Readings logged", input.weights.length * XP.weightLog);
  add("sessions", "Sessions completed", doneSessions.length * XP.session);
  add("sets", "Sets recorded", input.sets.length * XP.setLogged);
  add("rpe", "Effort rated", doneSessions.filter((s) => s.rpe !== null).length * XP.sessionRpe);
  add(
    "notes",
    "Notes written",
    doneSessions.filter((s) => s.note && s.note.trim().length >= 8).length * XP.sessionNote,
  );

  const fullWeeks = fullPatrolWeeks(input.sessions, startDate, today);
  add("fullweeks", "Full patrol weeks", fullWeeks * XP.fullPatrolWeek);

  add("food", "Fuel entries", input.food.length * XP.foodEntry);

  let kcalDays = 0;
  let proteinDays = 0;
  for (const [date, tot] of daily) {
    const day = daysBetween(startDate, date);
    const { kcal } = kcalTargetForDay(day);
    if (tot.kcal > 0 && tot.kcal <= kcal * 1.05) kcalDays++;
    if (tot.protein >= proteinTargetForDay(day)) proteinDays++;
  }
  const waterDays = input.water.filter((w) => w.ml >= input.waterTargetMl).length;
  add("water", "Days on water target", waterDays * XP.waterOnTarget);
  add("kcal", "Days on calorie target", kcalDays * XP.kcalOnTarget);
  add("protein", "Days on protein target", proteinDays * XP.proteinOnTarget);

  // A SUIT CHECK counts once its full set of four angles exists for the week.
  const anglesByWeek = new Map<number, Set<string>>();
  for (const p of input.photos) {
    const set = anglesByWeek.get(p.weekIndex) ?? new Set<string>();
    set.add(p.angle);
    anglesByWeek.set(p.weekIndex, set);
  }
  const photoWeeks = [...anglesByWeek.values()].filter((s) => s.size >= 4).length;
  add("suit", "Suit checks", photoWeeks * XP.suitCheck);

  add("measure", "Measurement sets", input.measurements.length * XP.measurements);
  add("trials", "Trials run", input.trials.length * XP.trial);

  const abilitiesDone = input.abilities.filter((a) => a.achieved).length;
  add("abilities", "Abilities unlocked", abilitiesDone * XP.abilityUnlocked);

  // ── Decay ──
  const activeDays = new Set<string>([
    ...input.weights.map((w) => w.date),
    ...doneSessions.map((s) => s.date),
    ...input.food.map((f) => f.date),
    ...input.sets.map((s) => s.date),
    ...input.water.map((w) => w.date),
  ]);
  let quietDays = 0;
  const totalDays = Math.max(daysBetween(startDate, today), 0);
  let run = 0;
  for (let d = 0; d <= totalDays; d++) {
    const date = addDays(startDate, d);
    if (activeDays.has(date)) run = 0;
    else {
      run++;
      if (run > XP.decayGraceDays) quietDays++;
    }
  }
  add("decay", "Quiet days", quietDays * XP.decayPerDay);

  // ── Challenges ──
  const wk = weekIndex(startDate, today);
  const { from: wFrom, to: wTo } = weekRange(startDate, wk);
  const monthKey = today.slice(0, 7);
  const mFrom = `${monthKey}-01`;
  const mTo = `${monthKey}-31`;

  const scoped = (from: string, to: string) => ({
    from,
    to,
    input,
    sessions: input.sessions.filter((s) => inRange(s.date, from, to)),
    weights: input.weights.filter((w) => inRange(w.date, from, to)),
    food: input.food.filter((f) => inRange(f.date, from, to)),
    photos: input.photos.filter((p) => inRange(p.date, from, to)),
    trials: input.trials.filter((t) => inRange(t.date, from, to)),
    measurements: input.measurements.filter((m) => inRange(m.date, from, to)),
    lowProfile: isLowProfileWeek(wk),
    daily,
    days: daysIn(from, to, startDate),
    patrolDays: patrolDaysIn(from, to, startDate),
  });

  const weekly = buildChallenges({ ...scoped(wFrom, wTo), scope: "weekly" }, 3, `w-${startDate}-${wk}`);
  const monthly = buildChallenges({ ...scoped(mFrom, mTo), scope: "monthly" }, 4, `m-${monthKey}`);
  const challenges = [...weekly, ...monthly];

  add(
    "challenges",
    "Challenges cleared",
    challenges.filter((c) => c.done).reduce((s, c) => s + c.reward, 0),
  );

  // ── Disciplines ──
  const disciplineXp = new Map<string, number>();
  const disciplineCount = new Map<string, number>();
  for (const s of doneSessions) {
    const def = DISCIPLINES.find((d) => d.dayKey === s.dayKey);
    if (!def) continue;
    let x = XP.session;
    if (s.rpe !== null) x += XP.sessionRpe;
    if (s.note && s.note.trim().length >= 8) x += XP.sessionNote;
    disciplineXp.set(def.key, (disciplineXp.get(def.key) ?? 0) + x);
    disciplineCount.set(def.key, (disciplineCount.get(def.key) ?? 0) + 1);
  }
  const maxDisc = Math.max(1, ...[...disciplineXp.values()]);
  const disciplines: Discipline[] = DISCIPLINES.map((d) => {
    const x = disciplineXp.get(d.key) ?? 0;
    const lvl = disciplineLevel(x);
    const cur = disciplineXpForLevel(lvl);
    const next = disciplineXpForLevel(lvl + 1);
    return {
      key: d.key,
      name: d.name,
      title: d.titles[Math.min(Math.floor((lvl - 1) / 8), d.titles.length - 1)],
      level: lvl,
      xp: Math.round(x),
      progress: lvl >= MAX_DISCIPLINE_LEVEL ? 1 : (x - cur) / (next - cur),
      sessions: disciplineCount.get(d.key) ?? 0,
      share: x / maxDisc,
    };
  });

  // ── Achievements ──
  const streakP = patrolStreak(input.sessions, today);
  const streakL = logStreak(input.weights, today);
  const startW = input.weights.length ? input.weights[0].weightKg : null;
  const lastW = input.weights.length ? input.weights[input.weights.length - 1].weightKg : null;
  const derived: Derived = {
    sessionsDone: doneSessions.length,
    patrolStreak: streakP,
    logStreak: streakL,
    fullWeeks,
    lostKg: startW !== null && lastW !== null ? startW - lastW : 0,
    bestScore: input.trials.reduce<number | null>(
      (best, t) => (t.score === null ? best : best === null ? t.score : Math.max(best, t.score)),
      null,
    ),
    abilitiesDone,
    photoWeeks,
    trialCount: input.trials.length,
  };

  const achievements: Achievement[] = ACHIEVEMENTS.map((a) => {
    const r = a.evaluate(input, derived);
    return {
      key: a.key,
      name: a.name,
      description: a.description,
      unlocked: r.unlocked,
      tier: a.tier,
      xp: achievementXp(a.tier),
      progress:
        r.target !== undefined ? { current: Math.min(r.current ?? 0, r.target), target: r.target } : undefined,
    };
  });

  add(
    "achievements",
    "Achievements",
    achievements.filter((a) => a.unlocked).reduce((s, a) => s + a.xp, 0),
  );

  // ── Totals ──
  const xp = Math.max(0, ledger.reduce((s, r) => s + r.xp, 0));
  const level = levelForXp(xp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);

  return {
    xp: Math.round(xp),
    level,
    title: levelTitle(level),
    currentLevelXp: Math.round(currentLevelXp),
    nextLevelXp: Math.round(nextLevelXp),
    levelProgress: level >= MAX_LEVEL ? 1 : (xp - currentLevelXp) / (nextLevelXp - currentLevelXp),
    ledger: ledger.sort((a, b) => b.xp - a.xp),
    disciplines,
    challenges,
    achievements,
    unlockedAchievements: achievements.filter((a) => a.unlocked).length,
    patrolStreak: streakP,
    logStreak: streakL,
    sessionsTotal: doneSessions.length,
    quietDays,
  };
}
