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

import { sql } from "drizzle-orm";
import { db } from "./db";
import { exerciseLogs } from "./db/schema";
import { addDays, dayKeyOf, daysBetween, todayISO } from "./dates";
import { gateExercise, ownedKeys } from "./equipment";
import { getSettings } from "./settings";
import {
  BASELINE_MODE,
  BASELINE_PATROLS,
  PHASES,
  TRAINING_DAYS,
  sessionFor,
  type BaselinePatrol,
  type Session,
} from "./plan";
import {
  FAMILY_LABELS,
  findMovement,
  ladder,
  movementKey,
  type Movement,
  type MovementFamily,
  type Prerequisite,
} from "./movements";
import { cutoffFor, cutoffs, movementRecords, painCounts } from "./skills";

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
// Reading the logs back — the skill tree
// ─────────────────────────────────────────────────────────────

/**
 * Come back after this long and the first session opens a tier lower.
 *
 * EXTRAPOLATED, and deliberately generous. Strength does not fall off a cliff in
 * a fortnight, but form does — and the whole point of the tiers is that the rung
 * above is harder to do *correctly*, which is the first thing to go after a
 * lay-off. One session to find it again, then straight back up.
 */
export const STALE_DAYS = 21;

export interface Standing {
  family: MovementFamily;
  /** Highest tier with a logged set. */
  loggedTier: number;
  /** The movement at that tier. */
  movement: Movement;
  bestReps: number | null;
  bestSeconds: number | null;
  /** Best anywhere in the strand, which is what a prerequisite is asked about. */
  familyBestReps: number | null;
  familyBestSeconds: number | null;
  lastDate: string;
  /** Held the bar under control often enough at `loggedTier` — see `lib/skills.ts`. */
  mastered: boolean;
  /** The tier you have earned the right to be prescribed. */
  tier: number;
  /** Set when the tier above is reachable but its prerequisites are not met. */
  blockedBy: Prerequisite | null;
  /** Set when a lay-off dropped you a tier for the session back. */
  rusty: boolean;
}

const bigger = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b);

/**
 * How many times a movement has been reported as hurting.
 *
 * Two is the threshold rather than one: any movement can feel wrong once, and a
 * single bad day should not close a strand. Twice is a pattern, and a pattern on
 * a movement you have just unlocked is the app being told something it cannot
 * see — that the shape is wrong, not that the load is heavy.
 */
export const PAIN_DEMOTES_AT = 2;

/**
 * Whether a strand has got far enough for something else to open.
 *
 * Every condition the gate states has to hold, not just the first one. `tier`
 * asks how far up the other strand you have actually climbed and is read from
 * `loggedTier` rather than the earned tier: pass 1 fills that in and pass 2
 * never touches it, so the answer cannot depend on which strand happens to be
 * resolved first. Since a rung is only ever prescribed once the one below it is
 * mastered, having logged a rung is already evidence of everything under it.
 */
export function meetsPrerequisite(req: Prerequisite, st: Map<MovementFamily, Standing>): boolean {
  const s = st.get(req.family);
  if (!s) return false;
  if (req.tier !== undefined && s.loggedTier < req.tier) return false;
  if (req.reps !== undefined && (s.familyBestReps ?? 0) < req.reps) return false;
  if (req.seconds !== undefined && (s.familyBestSeconds ?? 0) < req.seconds) return false;
  return true;
}

/** The first unmet gate on a movement, or null when it is open. */
export function lockedBy(m: Movement, st: Map<MovementFamily, Standing>): Prerequisite | null {
  for (const req of m.requires ?? []) {
    if (!meetsPrerequisite(req, st)) return req;
  }
  return null;
}

/**
 * Where every strand currently stands, read out of the logs that still count.
 *
 * The reading itself belongs to `lib/skills.ts` — which sets have survived a
 * reset, and whether a movement has been held under control often enough to be
 * called mastered. This function only turns those per-movement records into a
 * position per strand.
 *
 * Two passes, because a prerequisite asks about a different strand and all of
 * them have to exist before any of them can be checked. The first pass finds how
 * far up each strand you have climbed; the second walks each one back down until
 * it reaches a movement whose gates are actually open.
 */
export function standings(today = todayISO()): Map<MovementFamily, Standing> {
  const out = new Map<MovementFamily, Standing>();
  const pain = painCounts();

  // ── Pass 1: how far up each strand, and the strand's best numbers ──
  for (const rec of movementRecords().values()) {
    const movement = rec.movement;
    if (rec.lastDate === null) continue;

    // Groundwork sits in a family for grouping but is not a rung on it. Letting
    // arm circles set the overhead standing would put the pike strand at its
    // bottom rung every time you warmed up.
    if (movement.track === "groundwork") continue;

    // A movement that has hurt twice does not count as reached, however many
    // reps went into it. It stops holding the strand open above it.
    if ((pain.get(movementKey(movement.name)) ?? 0) >= PAIN_DEMOTES_AT) continue;

    const prev = out.get(movement.family);
    const familyBestReps = bigger(prev?.familyBestReps ?? null, rec.bestReps);
    const familyBestSeconds = bigger(prev?.familyBestSeconds ?? null, rec.bestSeconds);
    const lastDate = prev && prev.lastDate > rec.lastDate ? prev.lastDate : rec.lastDate;

    // A single set at a higher tier outranks a lot of easy ones below it, which
    // is how you would judge it in a gym.
    if (prev && prev.loggedTier > movement.tier) {
      out.set(movement.family, { ...prev, familyBestReps, familyBestSeconds, lastDate });
      continue;
    }

    out.set(movement.family, {
      family: movement.family,
      loggedTier: movement.tier,
      movement,
      bestReps: rec.bestReps,
      bestSeconds: rec.bestSeconds,
      familyBestReps,
      familyBestSeconds,
      lastDate,
      mastered: rec.mastered,
      tier: movement.tier,
      blockedBy: null,
      rusty: false,
    });
  }

  // ── Pass 2: promotion, rust, and gates ──
  for (const [family, s] of out) {
    const strand = ladder(family);
    let tier = Math.min(s.loggedTier + (s.mastered ? 1 : 0), strand.length - 1);

    // A lay-off costs a tier for one session. Form is the first thing to go,
    // and form is exactly what the tier above asks more of.
    const rusty = daysBetween(s.lastDate, today) > STALE_DAYS;
    if (rusty) tier = Math.max(0, tier - 1);

    // Walk down past anything that has hurt twice, then past anything whose
    // gates are shut.
    let blockedBy: Prerequisite | null = null;
    while (tier > 0 && (pain.get(movementKey(strand[tier].name)) ?? 0) >= PAIN_DEMOTES_AT) tier--;
    while (tier > 0) {
      const gate = lockedBy(strand[tier], out);
      if (!gate) break;
      blockedBy = gate;
      tier--;
    }

    out.set(family, { ...s, tier, blockedBy, rusty });
  }

  return out;
}

/**
 * Where the baseline sweep should open a strand.
 *
 * The bottom, when nothing has been logged. The sweep exists to find a limit and
 * the safest way to find one is from underneath — the first patrol handing a
 * beginner pike push-ups was the plan's default variation leaking into a
 * measurement, and pike push-ups are both hard and easy to do badly.
 */
export function sweepMovement(family: MovementFamily, st: Map<MovementFamily, Standing>): Movement | null {
  const strand = ladder(family);
  if (strand.length === 0) return null;
  return strand[Math.min(st.get(family)?.tier ?? 0, strand.length - 1)];
}

export interface Placement {
  name: string;
  dose: string;
  note: string | null;
  /** Set when the ladder moved you off the plan's own variation. */
  movedFrom: string | null;
  /**
   * Set when even the bottom of the strand is gated shut, and the movement
   * should be left out of the session entirely.
   *
   * Some strands are locked as a whole rather than rung by rung — you should
   * not be attempting a cartwheel before you can roll out of one, and there is
   * no easier cartwheel to offer instead. Substituting something from another
   * strand would put a number on a ladder nothing earned, so the honest answer
   * is to leave it out and say why.
   */
  blocked: Prerequisite | null;
}

/**
 * How far above the plan's own named variation you may be put, by phase.
 *
 * The plan names one variation per movement per phase, and for months that
 * name is a floor written for someone at the start. Holding a hard cap of one
 * rung above it all year was measurably wrong: several strands reached the cap
 * by month six and then sat there for the next twenty-five weeks with the tree
 * saying "earned" and the session still prescribing the document's beginner
 * variation.
 *
 * So the leash lengthens. Early on the document knows better than your logs do;
 * by Phase 3 your logs are a year of evidence and the document is a guess made
 * before you started. What does *not* change is the other cap — `standing.tier`
 * — which is what actually keeps you off movements you have not earned.
 */
export function headroomForPhase(phase: number): number {
  return phase <= 1 ? 1 : phase === 2 ? 2 : 3;
}

/**
 * Puts a prescribed movement on the tier your logs justify.
 *
 * The plan owns the shape of the year and your logs own how hard it gets. A
 * variation is never prescribed above what you have actually earned, never more
 * than `headroom` rungs above the one the plan named, and never one whose
 * prerequisites are unmet — so the harder movements unlock rather than arrive
 * on schedule.
 */
export function placeOnLadder(
  name: string,
  dose: string,
  note: string | null,
  st: Map<MovementFamily, Standing>,
  headroom = 1,
): Placement {
  const planned = findMovement(name);
  if (!planned) return { name, dose, note, movedFrom: null, blocked: null };

  // The catalogue's own spelling, not the plan's. The plan says "Clap push-ups"
  // and the catalogue calls it "Clap push-up"; both resolve to the same movement
  // but they key differently in the logs, which would split a movement's history
  // — and its personal best, and the numbers the next session prefills — in two.
  const unchanged: Placement = { name: planned.name, dose, note, movedFrom: null, blocked: null };

  // Groundwork is not on a ladder and is never moved. A warm-up you have to
  // earn is a warm-up nobody does.
  if (planned.track === "groundwork") return unchanged;

  const strand = ladder(planned.family);
  if (strand.length === 0) return unchanged;

  // A whole strand can be shut. Tumbling waits on being able to roll, vaults
  // wait on the same, and the kip-up waits on a trunk that can hold a hollow —
  // none of which have an easier version of themselves to fall back to.
  const entryGate = lockedBy(strand[0], st);
  if (entryGate) return { ...unchanged, blocked: entryGate };

  const standing = st.get(planned.family);

  /**
   * A strand with nothing logged on it opens at the bottom, not at whatever
   * the plan happened to name.
   *
   * This is the pike push-up problem generalised. Fixing the baseline sweep
   * fixed the fortnight, but every strand the fortnight does not reach — the
   * skills, the vaults, the range work the document only adds in Phase 2 —
   * still arrived at the plan's own variation the first time it appeared,
   * which for the shoulder roll meant rolling from a walk in week one. If the
   * logs say nothing about a strand, the honest reading is not "the plan's
   * level" but "we don't know yet", and the safe answer to that is the bottom.
   */
  if (!standing) {
    if (planned.tier === 0) return unchanged;
    const first = strand[0];
    return {
      name: first.name,
      dose: first.dose,
      note: `Starting at the bottom of the ${FAMILY_LABELS[planned.family].toLowerCase()} strand — nothing logged here yet. ${planned.name} is what this becomes.`,
      movedFrom: name,
      blocked: null,
    };
  }

  const target = Math.min(standing.tier, Math.min(planned.tier + headroom, strand.length - 1));
  if (target === planned.tier) return unchanged;

  const movement = strand[target];
  const best =
    standing.bestReps !== null
      ? `${standing.bestReps} reps`
      : standing.bestSeconds !== null
        ? `${standing.bestSeconds} s`
        : "a set";

  const reason = standing.rusty
    ? `Back a level for this session — nothing logged on this strand for over ${STALE_DAYS} days.`
    : target > planned.tier
      ? `Moved up from ${planned.name.toLowerCase()} — you logged ${best} on ${standing.movement.name.toLowerCase()}.`
      : standing.blockedBy
        ? `${planned.name} is still locked: ${standing.blockedBy.why}`
        : `The plan asks for ${planned.name.toLowerCase()}; this is the level your logs have earned.`;

  return {
    name: movement.name,
    dose: movement.dose,
    note: reason,
    movedFrom: name,
    blocked: null,
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

/**
 * Best hold still counting for a movement, used to seed the working target.
 *
 * Filtered by the same cutoffs as the tree. A hold target only ever climbs above
 * the plan's own number, so leaving a reset strand's old best in place would
 * keep prescribing a plank seeded off the reading you just said to disregard.
 */
export function bestSecondsFor(keys: string[]): Map<string, number> {
  if (keys.length === 0) return new Map();
  const want = new Set(keys);
  const cuts = cutoffs();

  const rows = db
    .select({
      exerciseKey: exerciseLogs.exerciseKey,
      exerciseName: exerciseLogs.exerciseName,
      seconds: exerciseLogs.seconds,
      createdAt: exerciseLogs.createdAt,
    })
    .from(exerciseLogs)
    .where(sql`${exerciseLogs.seconds} IS NOT NULL`)
    .all();

  const out = new Map<string, number>();
  for (const r of rows) {
    if (!want.has(r.exerciseKey) || r.seconds === null) continue;
    if (r.createdAt <= cutoffFor(cuts, findMovement(r.exerciseName)?.family ?? null)) continue;
    out.set(r.exerciseKey, Math.max(out.get(r.exerciseKey) ?? 0, r.seconds));
  }
  return out;
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
    const strand = ladder(family);
    if (strand.length === 0) continue;
    const best =
      s.bestReps !== null ? `${s.bestReps} reps` : s.bestSeconds !== null ? `${s.bestSeconds} s` : "logged";
    out.push({
      family,
      movement: strand[s.tier].name,
      evidence: `${best} on ${s.movement.name.toLowerCase()}`,
      rung: s.tier,
      rungs: strand.length,
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
      probes++;
      if (!done.has(key(name))) missing.push({ patrol: p.index, name });
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
