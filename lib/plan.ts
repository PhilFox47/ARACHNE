import type { MovementFamily } from "./movements";

/**
 * Families and the movement catalogue live in lib/movements.ts. This file keeps
 * the document's own structure — which day is which session, which phase, which
 * targets — and names a family only to say which slot a probe fills.
 */
export type { MovementFamily };

/**
 * ARACHNE — plan configuration.
 *
 * Every value here is read out of `spiderman-transformation-12-monate.md`.
 * Adjust numbers here and nowhere else.
 *
 * Values the document does NOT state are marked `EXTRAPOLATED` with the
 * reasoning. Those are the only invented numbers in this file — change them
 * freely, nothing else depends on how they were derived.
 */

// ─────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────

export const PROFILE = {
  ageAtStart: 29,
  heightCm: 180,
  startWeightKg: 100,
  targetWeightKg: 80,
  totalDays: 365,
  /** Document: "8,000–10,000 steps/day… burns more than your entire workout." */
  dailyStepsTarget: 8000,
  waterLitresPerDay: 3,
  sleepHours: [7, 8] as const,
} as const;

// ─────────────────────────────────────────────────────────────
// Phases
// ─────────────────────────────────────────────────────────────

export type PhaseId = 0 | 1 | 2 | 3 | 4;

export interface Phase {
  id: PhaseId;
  /** In-world name shown in the UI. */
  codename: string;
  /** The document's own name for the phase. */
  planName: string;
  startDay: number;
  endDay: number;
  kcal: number;
  proteinG: number | null;
  fatG: number | null;
  weightFromKg: number | null;
  weightToKg: number | null;
  brief: string;
  /** One line on what this phase is for. */
  focus: string;
  /** What actually changes here, relative to the phase before. */
  changes: string[];
}

/**
 * Phase 0 occupies the first 14 days. The document is explicit: train from day
 * one, but hold calories at maintenance and only track — "start the deficit in
 * week 3, once tracking and training are already habit."
 */
export const PHASES: Phase[] = [
  {
    id: 0,
    codename: "SETUP",
    planName: "Phase 0 — Setup",
    startDay: 0,
    endDay: 13,
    kcal: 2700,
    proteinG: null,
    fatG: null,
    weightFromKg: 100,
    weightToKg: 100,
    brief:
      "No deficit yet. Two weeks of measuring and tracking only. Without a baseline you won't know in month 6 whether you're making progress.",
    focus: "Measure, don't change",
    changes: [
      "Day 1: weight, waist at navel height, chest, thigh, flexed upper arm — and four photos in the same light and the same spot.",
      "Day 2: the baseline fitness test. Without it you won't know in month 6 whether you're improving.",
      "Buy the kit. The doorframe pull-up bar first — lats are what fill the suit.",
      "Track food honestly at maintenance and change nothing — including the snacking. A baseline you have already tidied up tells you nothing.",
      "Log water too, so you find out whether the target is a change or already normal.",
      "Week 1 is five baseline patrols covering every movement the year uses. No targets — you're measuring, and two or three reps left in the tank is close enough to a limit.",
      "Week 2 repeats the same five in the same order. Two readings a week apart is a baseline; one is a guess.",
      "From week 3 the plan picks each movement's starting variation from what you logged, rather than from what the document assumed.",
    ],
  },
  {
    id: 1,
    codename: "FOUNDATION",
    planName: "Phase 1 — Fundament",
    startDay: 14,
    endDay: 91,
    kcal: 2300,
    proteinG: 160,
    fatG: 70,
    weightFromKg: 100,
    weightToKg: 93,
    brief:
      "The goal is habit, not performance. Turning up five times a week for twelve weeks straight is the actual win. The muscle comes on its own.",
    focus: "Habit, not performance",
    changes: [
      "Turning up five times a week for twelve weeks is the win. The muscle follows on its own.",
      "Push-ups start elevated and walk down: wall → waist height → bench height → floor. Only advance at a clean 3×12.",
      "Three dead hangs every Wednesday — grip and shoulder stability underpin everything later.",
      "Pressing and pulling both happen twice a week here. Once a week is enough to learn a pattern and not enough to build one, and these are the twelve weeks where the patterns are actually laid down.",
      "40 g of protein per meal, non-negotiable. Weigh daily, judge weekly.",
      "The deficit starts in week 3, at 2,300 kcal.",
      "Every eighth training week is a REFUEL WEEK: two rounds instead of three, and calories back at maintenance for the whole week. Planned, not a reward and not a failure — a year-long unbroken deficit loses more muscle and gets abandoned more often than one with breaks built into it.",
      "Start creatine monohydrate, 3–5 g a day, any time of day, no loading and no cycling. It is the most evidenced supplement there is and it does more in a deficit than out of one, because it is holding onto strength while calories are low.",
      "Get vitamin D tested. At this latitude your skin makes essentially none of it between October and March, and it moves both muscle function and mood — and mood is a performance variable across twelve months.",
      "Book the bloods now: blood pressure, lipids, HbA1c. Partly to catch anything that changes how you should train, partly because repeating them at month twelve gives you a result the mirror cannot show you.",
    ],
  },
  {
    id: 2,
    codename: "BUILD",
    planName: "Phase 2 — Aufbau",
    startDay: 92,
    endDay: 182,
    kcal: 2200,
    proteinG: 160,
    fatG: null,
    weightFromKg: 93,
    weightToKg: 88,
    brief:
      "Training now, not acclimatising. The movement patterns are in place — from here it's progression.",
    focus: "Progression begins",
    changes: [
      "Negative pull-ups, 5 sets of 5 seconds, Wednesday and Friday. This is the phase's headline progression.",
      "From your first real rep: grease the groove — 1–2 pull-ups in passing through the day, never to failure.",
      "Push-ups move to the floor, then diamond, then archer. Pike push-ups enter as handstand preparation.",
      "Dips move between two chairs; lunges become Bulgarian split squats; Nordic curl negatives are added.",
      "Handstand practice becomes daily — five minutes, rest days included. It's a habit, not a training block.",
      "Cartwheel, kip-up progression and the tuck L-sit join Friday. Thursday VR becomes intervals: 2 min hard / 1 min easy × 8.",
    ],
  },
  {
    id: 3,
    codename: "ATHLETIC",
    planName: "Phase 3 — Athletik",
    startDay: 183,
    endDay: 273,
    kcal: 2150,
    proteinG: 165,
    fatG: null,
    weightFromKg: 88,
    weightToKg: 84,
    brief:
      "The explosive work starts. You're light enough now that jumps and skills actually work.",
    focus: "Explosive",
    changes: [
      "You're light enough now that jumps and skills actually work.",
      "Clap push-ups and archer push-ups; pike push-ups go elevated toward the handstand push-up.",
      "Pull-ups become explosive. Archer rows, pistol-squat progression to a chair, and broad jumps come in.",
      "Roundoff, muscle-up progression, precision jumps and the wall run join Friday.",
      "Mobility turns active: pancake, bridge push-up, active hip rotations.",
      "Every second Thursday, swap VR for outdoor sprints — 8 × 30 s hard / 90 s walk.",
      "Injury rule: everything new is learned slowly, on something soft, never at the tired end of a session.",
    ],
  },
  {
    id: 4,
    codename: "SUIT-READY",
    planName: "Phase 4 — Suit-Ready",
    startDay: 274,
    endDay: 365,
    kcal: 2100,
    proteinG: 170,
    fatG: null,
    weightFromKg: 84,
    weightToKg: 80,
    brief:
      "The last 4 kg are the hardest. Smaller deficit, more resistance, thinner motivation after nine months. Discipline wins here, not enthusiasm.",
    focus: "Optics and combination",
    changes: [
      "Shoulders and lats get priority — they build the V-silhouette that fills the suit. Lateral raises and pull-ups each get an extra volume set.",
      "Core becomes daily and short: hollow hold, dragon flag negatives, hanging knee raises.",
      "Skills combine into flows — roll → kip-up → jump → landing in the Spidey crouch. This is where it stops feeling like training.",
      "If weight stalls three weeks or more: check steps, check tracking, then take one week at maintenance before returning to the deficit.",
      "Never below 2,000 kcal. Below that you lose muscle, strength and hair rather than fat.",
      "Final two weeks: back to ~2,400 kcal. You look fuller and more defined, and you don't start the rest of your life starving.",
    ],
  },
];

/** Document, Phase 4: final two weeks return to maintenance. */
export const TAPER = { days: 14, kcal: 2400 } as const;

/** Document, Phase 4 stall rule. Never go below this. */
export const KCAL_FLOOR = 2000;
export const MAINTENANCE_KCAL = 2400;

// ─────────────────────────────────────────────────────────────
// Course — the document's shape, fitted to your own numbers
// ─────────────────────────────────────────────────────────────

/**
 * Everything above is the document as written: a 100 kg man reaching 80 kg in
 * twelve months. Your start weight, goal and timeframe are yours to set, so the
 * schedule below is expressed as the document's *proportions* and stretched
 * onto whatever course you actually chose.
 *
 * With the document's own numbers this is the identity transform — every phase
 * boundary, corridor anchor and calorie target comes out exactly as printed.
 */
export interface CourseConfig {
  startWeightKg: number;
  targetWeightKg: number;
  totalDays: number;
}

export const DOCUMENT_COURSE: CourseConfig = {
  startWeightKg: PROFILE.startWeightKg,
  targetWeightKg: PROFILE.targetWeightKg,
  totalDays: PROFILE.totalDays,
};

/**
 * Eight weeks is the shortest run in which the four phases are still
 * distinguishable from each other; two years is past the point where a plan
 * written as a twelve-month arc means anything.
 */
export const MIN_TOTAL_DAYS = 56;
export const MAX_TOTAL_DAYS = 730;

/**
 * Above roughly 1% of body weight per week the loss stops being mostly fat.
 * The document never states the figure, but its whole argument — 40 g of
 * protein a meal, never below 2,000 kcal, "faster loss is more muscle lost" —
 * is an argument for staying under it.
 */
export const MAX_WEEKLY_LOSS_FRACTION = 0.01;

export function normaliseCourse(c: Partial<CourseConfig>): CourseConfig {
  const startWeightKg = clamp(c.startWeightKg ?? DOCUMENT_COURSE.startWeightKg, 35, 300);
  const targetWeightKg = clamp(c.targetWeightKg ?? DOCUMENT_COURSE.targetWeightKg, 35, 300);
  const totalDays = Math.round(
    clamp(c.totalDays ?? DOCUMENT_COURSE.totalDays, MIN_TOTAL_DAYS, MAX_TOTAL_DAYS),
  );
  return { startWeightKg, targetWeightKg, totalDays };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/** Implied average loss per week, and whether it's faster than is sensible. */
export function courseRate(c: CourseConfig): { kgPerWeek: number; tooFast: boolean } {
  const weeks = c.totalDays / 7;
  const kgPerWeek = weeks > 0 ? (c.startWeightKg - c.targetWeightKg) / weeks : 0;
  return {
    kgPerWeek: Math.round(kgPerWeek * 100) / 100,
    tooFast: kgPerWeek > c.startWeightKg * MAX_WEEKLY_LOSS_FRACTION,
  };
}

/**
 * Phase 0 is a fixed fortnight whatever the total — the baseline sweep needs
 * two weeks to run twice, and that has nothing to do with how long the year is.
 * The remaining four keep the document's proportions of what's left.
 */
const PHASE_END_FRACTIONS = PHASES.slice(1).map(
  (p) => (p.endDay - PHASES[0].endDay) / (PROFILE.totalDays - PHASES[0].endDay),
);

/** Share of the total loss the document has banked by the end of each phase. */
const PHASE_LOSS_FRACTIONS = PHASES.slice(1).map(
  (p) =>
    (PROFILE.startWeightKg - (p.weightToKg ?? PROFILE.targetWeightKg)) /
    (PROFILE.startWeightKg - PROFILE.targetWeightKg),
);

/**
 * The calorie ladder is stated for a 100 kg man and nothing in the document
 * generalises it, so it's scaled by body weight and by nothing else — the
 * relative deficits are preserved exactly. Clamped, because a factor far from 1
 * means the document is being applied to someone it wasn't written for, and a
 * wrong number should at least be a conservatively wrong one.
 */
function kcalScale(c: CourseConfig): number {
  return clamp(c.startWeightKg / PROFILE.startWeightKg, 0.7, 1.3);
}

const round50 = (n: number) => Math.round(n / 50) * 50;

export function phasesFor(config: CourseConfig): Phase[] {
  const c = normaliseCourse(config);
  const totalLoss = c.startWeightKg - c.targetWeightKg;
  const span = c.totalDays - PHASES[0].endDay;
  const scale = kcalScale(c);

  return PHASES.map((p, i) => {
    if (i === 0) {
      return {
        ...p,
        kcal: round50(p.kcal * scale),
        weightFromKg: c.startWeightKg,
        weightToKg: c.startWeightKg,
      };
    }
    const endDay = PHASES[0].endDay + Math.round(PHASE_END_FRACTIONS[i - 1] * span);
    const prevEnd =
      i === 1 ? PHASES[0].endDay : PHASES[0].endDay + Math.round(PHASE_END_FRACTIONS[i - 2] * span);
    const from = i === 1 ? c.startWeightKg : c.startWeightKg - PHASE_LOSS_FRACTIONS[i - 2] * totalLoss;
    return {
      ...p,
      startDay: prevEnd + 1,
      endDay,
      kcal: round50(p.kcal * scale),
      proteinG: p.proteinG === null ? null : Math.round(p.proteinG * scale),
      weightFromKg: round1(from),
      weightToKg: round1(c.startWeightKg - PHASE_LOSS_FRACTIONS[i - 1] * totalLoss),
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function phaseForDayIn(config: CourseConfig, day: number): Phase {
  const phases = phasesFor(config);
  const clamped = Math.max(0, Math.min(day, normaliseCourse(config).totalDays));
  return (
    phases.find((p) => clamped >= p.startDay && clamped <= p.endDay) ?? phases[phases.length - 1]
  );
}

export function taperFor(config: CourseConfig): { days: number; kcal: number } {
  return { days: TAPER.days, kcal: round50(TAPER.kcal * kcalScale(config)) };
}

/**
 * Maintenance on a given day, which is not a constant.
 *
 * A 100 kg man and an 80 kg man do not maintain on the same intake, and the
 * document quietly says so — Phase 0 holds at 2,700 while the closing fortnight
 * calls 2,400 maintenance. Those are the same statement at two body weights, so
 * maintenance is read off the corridor between them.
 */
export function maintenanceForDayIn(config: CourseConfig, day: number): number {
  const c = normaliseCourse(config);
  const phases = phasesFor(c);
  const from = phases[0].kcal;
  const to = taperFor(c).kcal;
  const span = c.startWeightKg - c.targetWeightKg;
  if (span <= 0) return round50(from);
  const lost = c.startWeightKg - corridorTargetIn(c, day);
  return round50(from + (to - from) * clamp(lost / span, 0, 1));
}

/**
 * A planned week at maintenance, every second LOW PROFILE WEEK.
 *
 * A twelve-month unbroken deficit is the plan's one real physiological gap.
 * Byrne's MATADOR trial ran intermittent maintenance blocks against a
 * continuous cut and the intermittent arm lost *more* fat while showing less
 * suppression of resting metabolic rate — and, over a year, a break you can see
 * coming is the difference between a diet you finish and one you abandon in
 * month seven.
 *
 * Pinned to every second deload rather than given a cadence of its own, because
 * a week of reduced training and a week of maintenance calories are the same
 * idea said twice: the point of both is that you arrive at the next block
 * recovered. One concept, once every eight training weeks.
 */
export function isRefuelWeek(weekIndex: number): boolean {
  if (!isLowProfileWeek(weekIndex)) return false;
  const trainingWeek = weekIndex - FIRST_TRAINING_WEEK;
  return ((trainingWeek + 1) / 4) % 2 === 0;
}

/** Calorie target for a day, accounting for refuel weeks and the closing taper. */
export function kcalTargetForDayIn(
  config: CourseConfig,
  day: number,
): { kcal: number; taper: boolean; refuel: boolean } {
  const c = normaliseCourse(config);
  const t = taperFor(c);
  if (day > c.totalDays - t.days && day <= c.totalDays) {
    return { kcal: t.kcal, taper: true, refuel: false };
  }
  const phase = phaseForDayIn(c, day);
  // Never during the baseline fortnight — it is already at maintenance, and a
  // "break" from a phase with no deficit in it is a contradiction.
  if (phase.id !== 0 && isRefuelWeek(Math.floor(day / 7))) {
    return { kcal: maintenanceForDayIn(c, day), taper: false, refuel: true };
  }
  return { kcal: phase.kcal, taper: false, refuel: false };
}

export function kcalFloorFor(config: CourseConfig): number {
  return round50(KCAL_FLOOR * kcalScale(config));
}

// ─────────────────────────────────────────────────────────────
// Adaptive intake — the ladder answers to the scale
// ─────────────────────────────────────────────────────────────

/**
 * The calorie ladder was a function of the date and nothing else, which makes
 * it a prediction rather than a plan. It lands on the goal only if maintenance
 * really is what the document assumed: modelled against Mifflin-St Jeor, the
 * schedule implies ~2,755 kcal at 100 kg, and at a genuinely plausible activity
 * level of 1.45 the same intake finishes four kilos under target, at 1.55 ten
 * kilos under. Undershooting a cut is not harmless — it is muscle, and nine
 * months of eating less than you needed to.
 *
 * So the target now reads the scale. The correction is deliberately slow and
 * small: it acts on a fortnight of rolling averages rather than any single
 * morning, only once the drift is outside the corridor's own tolerance, and it
 * is capped. This is a trim, not a controller — a diet that chases the scale
 * week to week is how people end up at 1,400 kcal in month eight.
 */
export const ADAPT_WINDOW_DAYS = 14;
/** Readings needed inside the window before it will act at all. */
export const ADAPT_MIN_READINGS = 4;
/** Per kilogram outside the corridor band. */
export const ADAPT_KCAL_PER_KG = 100;
export const ADAPT_MAX_KCAL = 300;

export interface DayWeight {
  /** Days since the start date. */
  day: number;
  kg: number;
}

/**
 * How far the intake should move from the ladder's figure, in kcal.
 *
 * Positive means eat more — you are below the corridor, i.e. ahead of schedule
 * and losing faster than the plan wants. Negative means the reverse.
 *
 * Pure, and a function only of readings on or before `day`, so a past day
 * recomputes to what it was worth at the time rather than to what today knows.
 */
export function kcalAdjustmentIn(config: CourseConfig, day: number, weights: DayWeight[]): number {
  const c = normaliseCourse(config);
  const phase = phaseForDayIn(c, day);
  // Not during the baseline fortnight, a refuel week or the closing taper —
  // all three are deliberately not tracking the corridor.
  if (phase.id === 0) return 0;
  const t = kcalTargetForDayIn(c, day);
  if (t.taper || t.refuel) return 0;

  const window = weights.filter((w) => w.day <= day && w.day > day - ADAPT_WINDOW_DAYS);
  if (window.length < ADAPT_MIN_READINGS) return 0;

  const avg = window.reduce((s, w) => s + w.kg, 0) / window.length;
  const midpoint = day - ADAPT_WINDOW_DAYS / 2;
  const drift = avg - corridorTargetIn(c, midpoint);

  // Inside the band the plan is working. Only what is past it counts, so the
  // correction eases in from zero rather than stepping.
  const excess =
    drift > CORRIDOR_TOLERANCE_KG
      ? drift - CORRIDOR_TOLERANCE_KG
      : drift < -CORRIDOR_TOLERANCE_KG
        ? drift + CORRIDOR_TOLERANCE_KG
        : 0;
  if (excess === 0) return 0;

  const raw = -excess * ADAPT_KCAL_PER_KG;
  return clamp(Math.round(raw / 50) * 50, -ADAPT_MAX_KCAL, ADAPT_MAX_KCAL);
}

export interface DailyIntake {
  kcal: number;
  /** The ladder's own figure, before the scale had a say. */
  planned: number;
  adjustment: number;
  taper: boolean;
  refuel: boolean;
  /** True when the floor, not the arithmetic, decided the number. */
  atFloor: boolean;
}

/** The number to actually eat to: the ladder, corrected, never below the floor. */
export function intakeForDayIn(config: CourseConfig, day: number, weights: DayWeight[]): DailyIntake {
  const c = normaliseCourse(config);
  const base = kcalTargetForDayIn(c, day);
  const adjustment = kcalAdjustmentIn(c, day, weights);
  const floor = kcalFloorFor(c);
  const wanted = base.kcal + adjustment;
  const kcal = Math.max(floor, wanted);
  return {
    kcal,
    planned: base.kcal,
    adjustment,
    taper: base.taper,
    refuel: base.refuel,
    atFloor: wanted < floor,
  };
}

/**
 * The day's protein target in grams.
 *
 * The phases state this outright — 160 g through Phase 1 and 2, 165, then 170 —
 * and for a long time nothing read those numbers. Every screen and every
 * challenge instead multiplied "40 g per meal" by three, which is the document's
 * rule for a *meal* and its figure for three of them. The phase target is four
 * meals' worth, and the gap between the two was 40 g a day of the one macro
 * that decides how much of 20 kg comes off as muscle.
 *
 * Phase 0 states no target on purpose — the fortnight is for measuring what you
 * already eat — so it falls back to the per-meal rule rather than inventing one.
 */
export function proteinTargetForDayIn(config: CourseConfig, day: number): number {
  return phaseForDayIn(config, day).proteinG ?? PROTEIN_PER_MEAL_G * 3;
}

// ─────────────────────────────────────────────────────────────
// Weight corridor
// ─────────────────────────────────────────────────────────────

/**
 * Piecewise-linear through the document's own checkpoints rather than a straight
 * 100 → 80 line. The plan is front-loaded — 7 kg in the first quarter, then 5, 4,
 * 4 — and says outright that "the last 5 kg take twice as long as the first 5."
 *
 * The day-14 anchor holds the corridor flat across Phase 0, where the document
 * prescribes no deficit at all.
 */
export const CORRIDOR_ANCHORS: ReadonlyArray<{ day: number; kg: number }> = [
  { day: 0, kg: 100 },
  { day: 14, kg: 100 },
  { day: 91, kg: 93 },
  { day: 182, kg: 88 },
  { day: 273, kg: 84 },
  { day: 365, kg: 80 },
];

export const CORRIDOR_TOLERANCE_KG = 1.5;

/**
 * The anchors above are the document's own; these are the same anchors for a
 * course you configured. Both are the phase boundaries — day 0, the end of the
 * flat baseline fortnight, then the closing weight of each phase — so the two
 * agree exactly when the course is the document's.
 */
export function corridorAnchorsFor(config: CourseConfig): { day: number; kg: number }[] {
  const c = normaliseCourse(config);
  const phases = phasesFor(c);
  // Flat through the first day of the deficit, not the last day of Phase 0 —
  // the document's own anchor is day 14, and the difference is the 90 g the
  // corridor would otherwise have already asked for before the cut begins.
  const out = [
    { day: 0, kg: c.startWeightKg },
    { day: phases[1].startDay, kg: c.startWeightKg },
  ];
  for (const p of phases.slice(1)) out.push({ day: p.endDay, kg: p.weightToKg ?? c.targetWeightKg });
  return out;
}

/** Target weight on a given day, interpolated between anchors. */
export function corridorTargetIn(config: CourseConfig, day: number): number {
  const anchors = corridorAnchorsFor(config);
  const d = Math.max(0, Math.min(day, anchors[anchors.length - 1].day));
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (d >= a.day && d <= b.day) {
      const span = b.day - a.day;
      if (span === 0) return a.kg;
      return a.kg + ((b.kg - a.kg) * (d - a.day)) / span;
    }
  }
  return anchors[anchors.length - 1].kg;
}

// ─────────────────────────────────────────────────────────────
// Week structure
// ─────────────────────────────────────────────────────────────

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const TRAINING_DAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];
export const OFF_DUTY_DAYS: DayKey[] = ["sat", "sun"];

export const SESSION_SHAPE = { warmupMin: 4, workMin: 22, cooldownMin: 4 } as const;

/**
 * Phase 0 trains, but it is not training — it is measurement. The document is
 * blunt about why: "start at 70%… if you're flat on your back with muscle
 * soreness in week 1, you don't train in week 2."
 *
 * So the first five patrols sweep the movement pool looking for numbers, two
 * sets each, stopping short of failure. The second week runs the identical five
 * again: one reading is a guess, two readings a week apart is a baseline, and
 * the difference between them says whether the first week was honest.
 */
export const BASELINE_MODE = {
  rounds: 2,
  rule: "No targets this fortnight. Take each set to a clean technical limit with two or three left in you, and write down what you got — the plan is built from these numbers, so an inflated one only misprograms your own year.",
  fuelRule: "Eat exactly as you normally would and log all of it. A baseline you've already 'improved' tells you nothing.",
  repeatRule: "Same five patrols as last week, same order. Match the numbers if you can — a big jump usually means week 1 was cautious rather than that you got stronger in seven days, and either way the plan wants the truer figure.",
} as const;

export function isBaselinePhase(phase: PhaseId): boolean {
  return phase === 0;
}

// ─────────────────────────────────────────────────────────────
// The baseline sweep
// ─────────────────────────────────────────────────────────────

export interface BaselineProbe {
  /** Movement name, taken from the plan's own pool. */
  name: string;
  family: MovementFamily;
  metric: "reps" | "time";
  sets: number;
  /** How to run the test, in one line. */
  how: string;
  perSide?: boolean;
  loaded?: boolean;
  /**
   * Resolve the movement from the family's ladder instead of using `name`.
   *
   * A sweep is a measurement, and a measurement starts from underneath: with
   * nothing logged this opens at the bottom rung and climbs as the fortnight
   * earns it. `name` stays as documentation of which slot the probe fills.
   */
  ladder?: true;
}

export interface BaselinePatrol {
  /** 1-based, and the order they are issued in. */
  index: number;
  title: string;
  blurb: string;
  /** Which weekday session lends its warm-up and cooldown. */
  mirrors: DayKey;
  probes: BaselineProbe[];
  /** Conditioning is a pick-one, exactly as Thursday is. */
  pickOne?: boolean;
  rule?: string;
}

/**
 * Five patrols that between them touch every movement family the plan uses
 * later. The ordering mirrors the plan's own week — press, range, pull,
 * engine, skills — so consecutive patrols never hit the same tissue twice,
 * which matters more than usual when every set is near a limit.
 *
 * These are assigned by patrol number rather than by weekday. Starting on a
 * Thursday should not mean your baseline begins with conditioning and skips
 * pressing entirely.
 */
export const BASELINE_PATROLS: BaselinePatrol[] = [
  {
    index: 1,
    title: "Baseline · Press",
    blurb: "Everything that pushes. Two sets each, and the number you write down is the one the year gets built on.",
    mirrors: "mon",
    probes: [
      {
        name: "Push-ups",
        family: "push",
        metric: "reps",
        sets: 2,
        how: "Clean reps only — stop when the hips start to sag. Next patrol moves you up a level if you clear 12.",
        ladder: true,
      },
      {
        name: "Pike push-ups",
        family: "vertical_push",
        metric: "reps",
        sets: 2,
        how: "The overhead press, done with your own weight. Starts easy on purpose — the harder versions are where shoulders get hurt.",
        ladder: true,
      },
      {
        name: "Dumbbell shoulder press",
        family: "vertical_push",
        metric: "reps",
        sets: 2,
        how: "Whatever dumbbells you have. Log the weight — that's half the measurement.",
        loaded: true,
      },
      {
        name: "Triceps dips on chair edge",
        family: "dip",
        metric: "reps",
        sets: 2,
        how: "Heels on the floor, shoulders down. Stop before the shoulder starts complaining.",
        ladder: true,
      },
      {
        name: "Plank",
        family: "core",
        ladder: true,
        metric: "time",
        sets: 2,
        how: "It ends when the hips drop, not when it starts hurting.",
      },
    ],
    rule: "Nothing today is meant to be hard for its own sake. You are taking a photograph of where you are, and a flattering photograph is useless.",
  },
  {
    index: 2,
    title: "Baseline · Range",
    blurb: "What you can actually reach. Stiffness is a bigger problem than missing strength right now, and this is the patrol that finds out how big.",
    mirrors: "tue",
    probes: [
      {
        name: "Deep squat hold",
        family: "hold",
        ladder: true,
        metric: "time",
        sets: 2,
        how: "Heels flat on the floor. The clock stops the moment a heel lifts.",
      },
      {
        name: "Cossack squat",
        family: "lunge",
        ladder: true,
        metric: "reps",
        sets: 2,
        how: "As deep as you go without rolling onto the edge of the foot.",
        perSide: true,
      },
      {
        name: "Spiderman lunge with rotation",
        family: "mobility",
        metric: "reps",
        sets: 2,
        how: "Reach for the ceiling and follow the hand with your eyes.",
        perSide: true,
      },
      {
        name: "Couch stretch",
        family: "mobility",
        metric: "time",
        sets: 2,
        how: "How long you can hold it while still breathing normally.",
        perSide: true,
      },
    ],
    rule: "Never stretch into pain. Pulling yes, stabbing no. Breathe — mobility happens on the exhale.",
  },
  {
    index: 3,
    title: "Baseline · Pull",
    blurb: "The half of your back that fills the suit, and the legs underneath it.",
    mirrors: "wed",
    probes: [
      {
        name: "Dead hang",
        family: "pull",
        metric: "time",
        sets: 2,
        how: "The pull ladder starts here. Hang until the grip is going, not until it goes — 30 s clean and the next patrol offers negatives instead.",
        ladder: true,
      },
      {
        name: "Inverted rows",
        family: "row",
        metric: "reps",
        sets: 2,
        how: "Under a table or on the bar. Chest to the edge each rep.",
        ladder: true,
      },
      {
        name: "Goblet squat",
        family: "squat",
        ladder: true,
        metric: "reps",
        sets: 2,
        how: "Both dumbbells at the chest. Log the weight alongside the reps.",
        loaded: true,
      },
      {
        name: "Romanian deadlift",
        family: "hinge",
        ladder: true,
        metric: "reps",
        sets: 2,
        how: "Stop the moment the lower back rounds. That's the number, whatever it is.",
        loaded: true,
      },
      {
        name: "Wall sit",
        family: "hold",
        ladder: true,
        metric: "time",
        sets: 2,
        how: "Thighs parallel. Ends when they aren't.",
      },
    ],
  },
  {
    index: 4,
    title: "Baseline · Engine",
    blurb: "How long you last. One measured test, then twenty-five honest minutes of whatever you'll actually keep doing.",
    mirrors: "thu",
    pickOne: true,
    probes: [
      {
        name: "Burpees",
        family: "conditioning",
        ladder: true,
        metric: "reps",
        sets: 1,
        how: "As many as you can in three minutes. Pace it — this is the one everyone blows up on.",
      },
      {
        name: "Squat jumps",
        family: "jump",
        ladder: true,
        metric: "reps",
        sets: 2,
        how: "Land soft and quiet. When the landings get loud, the set is over.",
      },
    ],
    rule: "The goal is being out of breath, not the high score. Log the 12-minute walk test on the BASELINE screen too if you haven't yet — it's the document's own day-2 measurement.",
  },
  {
    index: 5,
    title: "Baseline · Control",
    blurb: "Balance, bracing and the floor skills everything later is built on.",
    mirrors: "fri",
    probes: [
      {
        name: "Wall handstand",
        family: "handstand",
        ladder: true,
        metric: "time",
        sets: 2,
        how: "Belly to the wall, walk the feet up as far as is comfortable. Time the hold.",
      },
      {
        name: "Bear crawl",
        family: "crawl",
        ladder: true,
        metric: "time",
        sets: 2,
        how: "Knees a hand's width off the floor the whole time. That's what makes it hard.",
      },
      {
        name: "Hollow hold",
        family: "core",
        ladder: true,
        metric: "time",
        sets: 2,
        how: "Lower back stays flat on the floor. It ends when the gap opens.",
      },
      {
        name: "Spider crawl",
        family: "crawl",
        ladder: true,
        metric: "time",
        sets: 2,
        how: "Low — belly close to the floor.",
      },
      {
        name: "Shoulder roll",
        family: "roll",
        ladder: true,
        metric: "reps",
        sets: 2,
        how: "Slow, from a crouch, both sides. Count the ones that didn't land on the spine.",
        perSide: true,
      },
    ],
    rule: "The shoulder roll is the foundational parkour skill and your insurance against injury in everything that follows. Learn it slowly, on something soft.",
  },
];

/**
 * Your stated target. The document asks for 3 litres; 2 is the goal you set, so
 * that's the default and the settings hint names the difference.
 */
export const WATER_TARGET_ML_DEFAULT = 2000;
export const WATER_TARGET_ML_DOCUMENT = 3000;

/**
 * Glass, mug, bottle. Named after the things you actually drink out of rather
 * than a tidy arithmetic ladder — a 350 ml mug is a real object and 500 ml is
 * not, for most of what ends up in front of you.
 */
export const WATER_INCREMENTS_ML = [250, 350, 750] as const;
export const WATER_CUSTOM_MAX_ML = 3000;

/**
 * Every 4th week of *training*. Document: "2 rounds instead of 3, no training
 * to failure."
 *
 * Counted from the first week of Phase 1 rather than from day 0. The two
 * baseline weeks are already a deload in everything but name — the sweep is
 * explicitly run at the bottom of every range, stopping two or three reps
 * short, because it is measuring rather than training. Counting them made the
 * first low-profile week land in week 2 of Phase 1: one real week of work,
 * then a week off it. That is a deload spent recovering from the fortnight
 * that was designed not to need one.
 *
 * Off the Phase 1 anchor the first one falls after four real weeks, which is
 * what "every 4th week" was always meant to mean.
 */
const FIRST_TRAINING_WEEK = (PHASES[0].endDay + 1) / 7;

export function isLowProfileWeek(weekIndex: number): boolean {
  const trainingWeek = weekIndex - FIRST_TRAINING_WEEK;
  if (trainingWeek < 0) return false; // Phase 0 is its own kind of easy.
  return (trainingWeek + 1) % 4 === 0;
}

export function roundsForWeek(weekIndex: number): number {
  return isLowProfileWeek(weekIndex) ? 2 : 3;
}

// ─────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────

export interface Exercise {
  name: string;
  dose: string;
  note?: string;
  /** Phase in which this movement first appears — drives the "NEW" badge. */
  since?: PhaseId;
}

export interface Session {
  dayKey: DayKey;
  title: string;
  blurb?: string;
  warmup?: Exercise[];
  main: Exercise[];
  cooldown?: Exercise[];
  /** Work done on this day regardless of the round structure. */
  extras?: Exercise[];
  /** Pick-one lists (Thursday's VR options). */
  options?: string[];
  /** The document's own rule for this session, quoted in the UI. */
  rule?: string;
}

// ── Monday ───────────────────────────────────────────────────

const MON_WARMUP: Exercise[] = [
  { name: "Arm circles", dose: "20" },
  { name: "Scapula push-ups", dose: "10" },
  { name: "Cat-cow", dose: "10" },
  { name: "Shoulder circles with towel", dose: "10" },
];

const MON_COOLDOWN: Exercise[] = [
  { name: "Doorway chest stretch", dose: "45 s per side" },
  { name: "Child's pose", dose: "60 s" },
];

const MON_RULE =
  "The flatter your hands, the harder it gets. Wall → waist height → bench height → floor. Only move on at a clean 3×12.";

// ── Wednesday ────────────────────────────────────────────────

const WED_WARMUP: Exercise[] = [
  { name: "Hip circles", dose: "—" },
  { name: "Leg swings", dose: "10 per side" },
  { name: "Bodyweight squats", dose: "15" },
  { name: "Glute bridges", dose: "15" },
];

const WED_EXTRA: Exercise[] = [
  {
    name: "Dead hang",
    dose: "3× to just short of letting go",
    note: "Every Wednesday. Builds grip and shoulder stability — the groundwork for everything later.",
  },
];

// ── Thursday ─────────────────────────────────────────────────

const VR_OPTIONS = [
  "Supernatural — Flow or Boxing, intensity “Intense”",
  "Beat Saber — 7–8 songs on Expert without a break, full-body (not just wrists)",
  "Thrill of the Fight — 3× 3-min rounds. Harder than it looks.",
  "Les Mills Bodycombat or FitXR for variety",
];

const VR_RULE =
  "The goal is being out of breath, not the high score. If you're not sweating after 25 minutes, it was too easy.";

// ── Friday ───────────────────────────────────────────────────
// Built skills first, engine last, in every phase.
//
// The document's own injury rule is "Kein Skill wird bei Müdigkeit am Ende der
// Einheit noch schnell probiert" — no skill gets tried quickly at the end of a
// session when you are tired. The week it was written into was doing the
// opposite: burpees and squat jumps sat in the middle of Friday's list and
// every skill the later phases added was appended after them, so the cartwheel,
// the kip-up and the wall run all arrived at the point of the week with the
// least left in the tank. The engine work is now a block of its own at the end,
// and everything that needs a clear head comes before it.

const FRI_ENGINE: Exercise[] = [
  { name: "Squat jumps", dose: "3× 8" },
  { name: "Hollow hold", dose: "3× 20 s" },
  { name: "Burpees", dose: "3× 8" },
];

const FRI_SKILLS_P1: Exercise[] = [
  { name: "Wall handstand", dose: "3× 20–30 s", note: "Belly to wall, walk up" },
  { name: "Shoulder roll", dose: "10 per side", note: "On the mat" },
  { name: "Bear crawl", dose: "3× 30 s", note: "Forwards and backwards" },
  { name: "Spider crawl", dose: "3× 20 s", note: "Low — belly close to the floor" },
];

const FRI_SKILLS_P2: Exercise[] = [
  { name: "Freestanding handstand attempts", dose: "5 min", since: 2 },
  { name: "Cartwheel", dose: "5 per side", since: 2 },
  { name: "Kip-up progression", dose: "5", note: "To sitting, then to a crouch, then to standing", since: 2 },
  { name: "L-sit tuck", dose: "3× 10 s", since: 2 },
];

const FRI_SKILLS_P3: Exercise[] = [
  { name: "Roundoff", dose: "5", since: 3 },
  { name: "Muscle-up progression", dose: "5", note: "Explosive pull-ups + dips", since: 3 },
  { name: "Precision jumps", dose: "8", since: 3 },
  { name: "Wall run", dose: "5", since: 3 },
  { name: "L-sit", dose: "3× 10 s" },
];

const FRI_RULE =
  "Skills first, while you are fresh — that is why they are at the top of this list and the burpees are at the bottom. No skill gets tried quickly at the end of a session when you are tired; a shape learned badly is a shape you will use badly. The shoulder roll is the foundational parkour skill and your insurance against injury in everything that follows: slow from a crouch first, then from standing, then from a walk.";

const FRI_RULE_LATE =
  "Skills first, while you are fresh. Everything new is learned on a soft surface and in slow motion, and no skill gets tried quickly at the end of a session when you are tired — which is why the engine work is last on this list and nothing else may move below it. Pain that isn't muscle soreness → stop, and see a physio if it persists. A torn ligament in month 8 costs you the whole year.";

// ── Session table ────────────────────────────────────────────
// Phases 2–4 are stated in the document as deltas against Phase 1. Each session
// below is the resolved result. See docs/PLAN-EXTRACT.md §3 for the derivation
// and which changes were read as REPLACE versus ADD.

const P1: Record<DayKey, Session | null> = {
  mon: {
    dayKey: "mon",
    title: "Push & Core",
    warmup: MON_WARMUP,
    main: [
      { name: "Elevated push-ups", dose: "8–12", note: "Hands on a counter, chair or sofa edge" },
      { name: "Dumbbell shoulder press", dose: "10–12" },
      { name: "Triceps dips on chair edge", dose: "8–12" },
      {
        name: "Inverted rows",
        dose: "8–12",
        note: "Second pull of the week. Once a week is enough to learn a pattern and not enough to build one — and a pressing day with no pulling in it is how shoulders get sore.",
      },
      { name: "Lateral raises", dose: "12–15", note: "Light — 4–5 kg is plenty" },
      {
        name: "Glute bridge",
        dose: "12–15",
        note: "The week's second hip hinge. Wednesday is the only leg day, and a pattern trained once a week is trained at half the rate the evidence says it should be — two exposures beat one at the same total volume.",
      },
      { name: "Dead bug", dose: "10 per side" },
      { name: "Plank", dose: "30–45 s" },
    ],
    cooldown: MON_COOLDOWN,
    rule: MON_RULE,
  },
  tue: {
    dayKey: "tue",
    title: "Mobility & Flow",
    blurb:
      "The session you'll want to skip, and the one that makes the biggest difference. Stiffness is a harder problem for you right now than missing strength.",
    main: [
      { name: "Deep squat hold", dose: "3× 45 s", note: "Heels down — put a book under them if needed" },
      { name: "Spiderman lunge with rotation", dose: "8 per side" },
      { name: "90/90 hip switches", dose: "10 per side" },
      { name: "Cossack squat", dose: "8 per side" },
      { name: "Open book", dose: "10 per side", note: "Thoracic rotation" },
      { name: "Couch stretch", dose: "60 s per side" },
      { name: "Thread the needle", dose: "8 per side" },
    ],
    rule: "Never stretch into pain. Pulling yes, stabbing no. Breathe — mobility happens on the exhale.",
  },
  wed: {
    dayKey: "wed",
    title: "Pull & Legs",
    warmup: WED_WARMUP,
    main: [
      { name: "Goblet squat", dose: "12–15", note: "Both dumbbells at the chest" },
      { name: "Single-arm dumbbell row", dose: "10–12 per side" },
      { name: "Romanian deadlift", dose: "12" },
      { name: "Inverted rows", dose: "8–12", note: "Under the table or on the bar" },
      {
        name: "Elevated push-ups",
        dose: "8–12",
        note: "Second press of the week. Months 1–3 are where the pressing pattern is actually learned, and a pattern trained once a week is a pattern you re-learn every Monday.",
      },
      { name: "Reverse lunges", dose: "10 per side" },
      {
        name: "Lateral raises",
        dose: "12–15",
        note: "Second exposure. Three sets a week was the only side-delt work in the plan, and the side delt is what makes the V — which Phase 4 names as the whole point of the last quarter.",
      },
      {
        name: "Calf raises",
        dose: "15–20",
        note: "The one muscle the year had nothing for. Off a step if you have one, so the heel drops below the toes.",
      },
      { name: "Wall sit", dose: "30–45 s" },
    ],
    extras: WED_EXTRA,
  },
  thu: {
    dayKey: "thu",
    title: "Conditioning",
    blurb: "25 minutes unbroken, heart rate high. Pick one.",
    main: [],
    options: VR_OPTIONS,
    rule: VR_RULE,
  },
  fri: {
    dayKey: "fri",
    title: "Skills & Explosive",
    main: [...FRI_SKILLS_P1, ...FRI_ENGINE],
    rule: FRI_RULE,
  },
  sat: null,
  sun: null,
};

const P2: Record<DayKey, Session | null> = {
  mon: {
    ...P1.mon!,
    main: [
      { name: "Push-ups", dose: "8–12", note: "Floor → diamond → archer", since: 2 },
      { name: "Pike push-ups", dose: "8–12", note: "Handstand preparation", since: 2 },
      { name: "Dumbbell shoulder press", dose: "10–12" },
      { name: "Dips between two chairs", dose: "8–12", since: 2 },
      { name: "Lateral raises", dose: "12–15" },
      { name: "Dead bug", dose: "10 per side" },
      { name: "Plank", dose: "30–45 s" },
    ],
  },
  tue: {
    ...P1.tue!,
    main: [
      ...P1.tue!.main,
      { name: "Jefferson curl", dose: "8", note: "Light — 4 kg", since: 2 },
      { name: "Pancake progression", dose: "60 s", since: 2 },
      { name: "Bridge", dose: "3× 20 s", since: 2 },
    ],
  },
  wed: {
    ...P1.wed!,
    main: [
      { name: "Negative pull-ups", dose: "5× 5 s", note: "The key progression of this phase", since: 2 },
      { name: "Goblet squat", dose: "12–15" },
      { name: "Single-arm dumbbell row", dose: "10–12 per side" },
      { name: "Romanian deadlift", dose: "12" },
      { name: "Inverted rows", dose: "8–12" },
      { name: "Bulgarian split squats", dose: "10 per side", since: 2 },
      { name: "Nordic curl negatives", dose: "3× 5", note: "Feet under the sofa", since: 2 },
      { name: "Lateral raises", dose: "12–15", note: "Light. The side delt is what builds the V." },
      { name: "Calf raises", dose: "15–20", note: "Off a step, heel below the toes." },
      { name: "Wall sit", dose: "30–45 s" },
    ],
    rule:
      "Pull-up protocol: Wednesday and Friday, 5 sets of negatives. Jump up, lower as slowly as you can — 5 seconds is the target. At 5×5 s, try a real one. From your first rep: grease the groove — 1–2 pull-ups in passing through the day, never to failure.",
  },
  thu: {
    ...P1.thu!,
    blurb: "Intervals: 2 min all-out / 1 min easy × 8.",
  },
  fri: {
    ...P1.fri!,
    main: [...FRI_SKILLS_P2, ...FRI_SKILLS_P1, ...FRI_ENGINE],
  },
  sat: null,
  sun: null,
};

const P3: Record<DayKey, Session | null> = {
  mon: {
    ...P1.mon!,
    main: [
      { name: "Clap push-ups", dose: "3× 5–8", since: 3 },
      { name: "Archer push-ups", dose: "8–10 per side", since: 3 },
      { name: "Pike push-ups elevated", dose: "8–12", note: "Toward the handstand push-up", since: 3 },
      { name: "Dumbbell shoulder press", dose: "10–12" },
      { name: "Dips between two chairs", dose: "8–12" },
      { name: "Lateral raises", dose: "12–15" },
      { name: "Dead bug", dose: "10 per side" },
      { name: "Plank", dose: "30–45 s" },
    ],
  },
  tue: {
    ...P1.tue!,
    blurb: "Active range now, not passive. Hold the end position under tension.",
    main: [
      ...P1.tue!.main,
      { name: "Jefferson curl", dose: "8", note: "Light — 4 kg" },
      { name: "Pancake", dose: "60 s", note: "Active", since: 3 },
      { name: "Bridge push-up", dose: "5", since: 3 },
      { name: "Active hip rotations", dose: "10 per side", since: 3 },
    ],
  },
  wed: {
    ...P1.wed!,
    main: [
      { name: "Explosive pull-ups", dose: "5× 3", since: 3 },
      { name: "Goblet squat", dose: "12–15" },
      { name: "Archer rows", dose: "8–10 per side", since: 3 },
      { name: "Romanian deadlift", dose: "12" },
      { name: "Pistol squat progression", dose: "5 per side", note: "To a chair", since: 3 },
      { name: "Bulgarian split squats", dose: "10 per side" },
      { name: "Broad jumps", dose: "3× 5", since: 3 },
      { name: "Nordic curl negatives", dose: "3× 5" },
    ],
  },
  thu: {
    ...P1.thu!,
    blurb:
      "Intervals as in Phase 2 — but every second week, replace the session with outdoor sprints: 8× 30 s sprint / 90 s walk.",
  },
  fri: {
    ...P1.fri!,
    main: [...FRI_SKILLS_P3, ...FRI_SKILLS_P2, ...FRI_SKILLS_P1, ...FRI_ENGINE],
    rule: FRI_RULE_LATE,
  },
  sat: null,
  sun: null,
};

const P4: Record<DayKey, Session | null> = {
  mon: {
    ...P3.mon!,
    blurb: "Shoulders and lats are the priority now — they build the V-silhouette that fills the suit.",
    main: [
      ...P3.mon!.main.filter((e) => e.name !== "Lateral raises" && e.name !== "Dead bug" && e.name !== "Plank"),
      { name: "Lateral raises", dose: "12–15", note: "4 sets — extra volume set this phase", since: 4 },
    ],
    cooldown: [
      { name: "Hollow hold", dose: "3× 20 s", note: "Daily 5-min core block", since: 4 },
      { name: "Dragon flag negatives", dose: "3× 5", since: 4 },
      { name: "Hanging knee raises", dose: "3× 10", since: 4 },
      ...MON_COOLDOWN,
    ],
  },
  tue: P3.tue,
  wed: {
    ...P3.wed!,
    main: [
      { name: "Explosive pull-ups", dose: "5× 3 + 1 extra volume set", since: 4 },
      ...P3.wed!.main.filter((e) => e.name !== "Explosive pull-ups"),
    ],
  },
  thu: P3.thu,
  fri: {
    ...P3.fri!,
    blurb:
      "Skills combine into flows now: roll → kip-up → jump → landing in the Spidey crouch. This is the point where it feels like Spider-Man instead of like training.",
  },
  sat: null,
  sun: null,
};

const SESSIONS: Record<PhaseId, Record<DayKey, Session | null>> = {
  // Phase 0 trains the Phase 1 week — only the calorie target differs.
  0: P1,
  1: P1,
  2: P2,
  3: P3,
  4: P4,
};

export function sessionFor(phase: PhaseId, dayKey: DayKey): Session | null {
  return SESSIONS[phase][dayKey];
}

/** Daily from Phase 2 on, rest days included. */
export const HANDSTAND_PROTOCOL = {
  fromPhase: 2 as PhaseId,
  minutesPerDay: 5,
  note: "Wall handstand → kick-up with your back to the wall → brief releases. A daily habit, not a training block.",
};

// ─────────────────────────────────────────────────────────────
// Checkpoints
// ─────────────────────────────────────────────────────────────

export interface Checkpoint {
  month: 3 | 6 | 9 | 12;
  day: number;
  weightKg: number;
  waistCm: number;
  waistLabel: string;
  targets: Record<string, { value: number; label: string }>;
  abilities: { key: string; label: string }[];
}

export const CHECKPOINTS: Checkpoint[] = [
  {
    month: 3,
    day: 91,
    weightKg: 93,
    waistCm: 103,
    waistLabel: "~103 cm",
    targets: {
      pushups: { value: 13, label: "12–15" },
      pullups: { value: 1.5, label: "1–2 negatives" },
      plank: { value: 90, label: "90 s" },
      deadhang: { value: 45, label: "45 s" },
      squatHold: { value: 60, label: "60 s, heels down" },
    },
    abilities: [
      { key: "shoulder_roll", label: "Clean shoulder roll, both sides" },
      { key: "wall_handstand_30", label: "Wall handstand 30 s" },
      { key: "deep_squat_no_heel_lift", label: "Deep squat without lifting the heels" },
    ],
  },
  {
    month: 6,
    day: 182,
    weightKg: 88,
    waistCm: 97,
    waistLabel: "~97 cm",
    targets: {
      pushups: { value: 25, label: "25" },
      pullups: { value: 4, label: "3–5" },
      plank: { value: 120, label: "2 min" },
      deadhang: { value: 60, label: "60 s" },
      squatHold: { value: 120, label: "2 min" },
    },
    abilities: [
      { key: "cartwheel", label: "Cartwheel, both sides" },
      { key: "wall_handstand_60", label: "Wall handstand 60 s" },
      { key: "lsit_tuck_15", label: "L-sit tuck 15 s" },
      { key: "free_handstand_first", label: "First free handstand seconds" },
    ],
  },
  {
    month: 9,
    day: 273,
    weightKg: 84,
    waistCm: 92,
    waistLabel: "~92 cm",
    targets: {
      pushups: { value: 35, label: "35" },
      pullups: { value: 8, label: "8" },
      freeHandstand: { value: 10, label: "10 s" },
    },
    abilities: [
      { key: "roundoff", label: "Roundoff" },
      { key: "lsit_free_10", label: "Free L-sit 10 s" },
      { key: "kipup_crouch", label: "Kip-up to a crouch" },
      { key: "wall_run", label: "Wall run" },
      { key: "pistol_chair", label: "Pistol squat to a chair, both sides" },
    ],
  },
  {
    month: 12,
    day: 365,
    weightKg: 80,
    waistCm: 86.5,
    waistLabel: "~85–88 cm",
    targets: {
      pushups: { value: 45, label: "45" },
      pullups: { value: 12, label: "12" },
      plank: { value: 180, label: "3 min" },
      sitReach: { value: 15, label: "+15 cm" },
      freeHandstand: { value: 15, label: "15 s" },
    },
    abilities: [
      { key: "free_handstand_15", label: "Freestanding handstand 15 s" },
      { key: "kipup_stand", label: "Kip-up to standing" },
      { key: "roundoff_clean", label: "Clean roundoff" },
      { key: "pistol_both", label: "Pistol squat, both sides" },
      { key: "lsit_15", label: "L-sit 15 s" },
      { key: "muscle_up", label: "Muscle-up (stretch) or 12 clean pull-ups" },
      { key: "wall_run_spidey", label: "Wall run + landing in the Spidey crouch" },
    ],
  },
];

export function checkpointForMonth(month: number): Checkpoint | undefined {
  return CHECKPOINTS.find((c) => c.month === month);
}

/**
 * The four checkpoints, moved onto your course. They sit at the quarter points
 * of the document's year and at the end of Phases 1–4, which is the same thing
 * — so they ride the scaled phase boundaries rather than being re-derived.
 *
 * Only the day and the weight move. The performance targets are the document's
 * and stay exactly as printed: how long you take to reach 80 kg has no bearing
 * on how many push-ups 80 kg should be able to do.
 */
export function checkpointsFor(config: CourseConfig): Checkpoint[] {
  const c = normaliseCourse(config);
  const phases = phasesFor(c);

  return CHECKPOINTS.map((cp, i) => {
    const phase = phases[i + 1];
    const weightKg = round1(phase.weightToKg ?? c.targetWeightKg);
    // The document quotes each waist against a specific weight and offers no
    // formula, so the waist rides the weight it was quoted against.
    const waistCm = round1((cp.waistCm * weightKg) / cp.weightKg);
    return {
      ...cp,
      day: phase.endDay,
      weightKg,
      waistCm,
      waistLabel: `~${waistCm} cm`,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// THE TRIAL
// ─────────────────────────────────────────────────────────────

export type StationKey =
  | "pushups"
  | "pullups"
  | "plank"
  | "squatHold"
  | "burpees3min"
  | "sitReach";

export interface Station {
  key: StationKey;
  index: number;
  name: string;
  instruction: string;
  unit: "reps" | "seconds" | "cm";
  /**
   * Month-12 value worth 100 points. `sourced` values come from the plan
   * document's checkpoint tables; `EXTRAPOLATED` ones do not appear in the
   * document at all and are yours to change.
   */
  target: number;
  targetSource: "document" | "EXTRAPOLATED";
  targetNote?: string;
  /** Sit-and-reach is stated as an improvement, not an absolute. */
  relativeToBaseline?: boolean;
  /** Lower is better (none of the six, but the circuit uses it). */
  inverse?: boolean;
  /** Fixed-duration station — the timer counts down instead of up. */
  countdownSec?: number;
  fallback?: { key: string; name: string; unit: "seconds"; target: number; targetSource: "EXTRAPOLATED" | "document"; targetNote?: string };
}

export const STATIONS: Station[] = [
  {
    key: "pushups",
    index: 1,
    name: "Push-ups",
    instruction: "Max reps. Clean form — chest to a fist's width off the floor.",
    unit: "reps",
    target: 45,
    targetSource: "document",
  },
  {
    key: "pullups",
    index: 2,
    name: "Pull-ups",
    instruction: "Max reps. If you can't do one yet, the station becomes a dead hang.",
    unit: "reps",
    target: 12,
    targetSource: "document",
    fallback: {
      key: "deadhang",
      name: "Dead hang",
      unit: "seconds",
      target: 90,
      targetSource: "EXTRAPOLATED",
      targetNote:
        "Document gives 45 s at M3 and 60 s at M6, then stops. 90 s continues that decelerating curve and is a recognised benchmark.",
    },
  },
  {
    key: "plank",
    index: 3,
    name: "Plank",
    instruction: "Max hold. It ends when the hips drop.",
    unit: "seconds",
    target: 180,
    targetSource: "document",
  },
  {
    key: "squatHold",
    index: 4,
    name: "Deep squat hold",
    instruction: "Max hold in a deep squat. Heels stay on the floor.",
    unit: "seconds",
    target: 180,
    targetSource: "EXTRAPOLATED",
    targetNote:
      "Document gives 60 s at M3 and 120 s at M6, then stops. 180 s follows the same decelerating shape and matches the commonly cited resting-squat benchmark.",
  },
  {
    key: "burpees3min",
    index: 5,
    name: "Burpees",
    instruction: "As many as possible in 3 minutes.",
    unit: "reps",
    target: 55,
    targetSource: "EXTRAPOLATED",
    targetNote:
      "This test appears nowhere in the document — burpees only show up as 3×8 in the Friday session. 55 in 3 min is a strong target for a lean, trained 30-year-old.",
    countdownSec: 180,
  },
  {
    key: "sitReach",
    index: 6,
    name: "Sit-and-reach",
    instruction: "Seated, legs straight. How far past your toes do you reach?",
    unit: "cm",
    target: 15,
    targetSource: "document",
    relativeToBaseline: true,
    targetNote:
      "The document states +15 cm as an improvement on a baseline it never records, so this scores against your first trial's reading.",
  },
];

/** Document has no circuit at all — the whole station is from the brief. */
export const CIRCUIT = {
  name: "Timed circuit",
  rounds: 5,
  work: [
    { name: "Burpees", reps: 10 },
    { name: "Air squats", reps: 15 },
    { name: "Mountain climbers", reps: 20 },
  ],
  targetSec: 720,
  targetSource: "EXTRAPOLATED" as const,
  targetNote:
    "Neither the circuit nor a time for it appears in the document. 12 minutes for 50 burpees, 75 squats and 100 mountain climbers is a solid month-12 target.",
  inverse: true,
};

/** Six stations at target = 600. The circuit is scored separately. */
export const POINTS_PER_STATION = 100;
export const MAX_STATION_SCORE = STATIONS.length * POINTS_PER_STATION;

// ─────────────────────────────────────────────────────────────
// Ranks
// ─────────────────────────────────────────────────────────────

export interface Rank {
  key: string;
  name: string;
  minScore: number;
  blurb: string;
}

/**
 * Thresholds are paced against the document's own checkpoint targets: scoring
 * every station at its M3 values lands around 275, M6 around 425, M9 around
 * 565, and M12 by definition at 600. That puts a promotion roughly every
 * quarter rather than three of them bunched at the end.
 */
export const RANKS: Rank[] = [
  { key: "untested", name: "UNTESTED", minScore: -1, blurb: "No trial on record." },
  { key: "rookie", name: "ROOKIE", minScore: 0, blurb: "On the board." },
  { key: "neighborhood", name: "NEIGHBORHOOD", minScore: 250, blurb: "Holding your own block." },
  { key: "citywide", name: "CITYWIDE", minScore: 400, blurb: "Range beyond the neighbourhood." },
  { key: "noceiling", name: "NO CEILING", minScore: 550, blurb: "At or past the month-12 targets." },
];

export function rankForScore(score: number | null): Rank {
  if (score === null) return RANKS[0];
  let out = RANKS[1];
  for (const r of RANKS) if (r.minScore >= 0 && score >= r.minScore) out = r;
  return out;
}

export function nextRank(score: number | null): Rank | null {
  if (score === null) return RANKS[1];
  return RANKS.find((r) => r.minScore > score) ?? null;
}

// ─────────────────────────────────────────────────────────────
// FUEL
// ─────────────────────────────────────────────────────────────

/**
 * Default 0% per the brief. Worth knowing: the plan document recommends +20%,
 * citing an NIDDK analysis of 102 controlled meals in which photo apps
 * underestimated by 250–345 kcal each. Settings surfaces that as a hint.
 */
export const PHOTO_CORRECTION_DEFAULT_PCT = 0;
export const PHOTO_CORRECTION_DOCUMENT_PCT = 20;

/** Meal vs snack is auto-suggested from the clock and rarely changed. */
export function suggestMealType(date: Date): "meal" | "snack" {
  const h = date.getHours();
  const mealWindow = (h >= 6 && h < 10) || (h >= 11 && h < 15) || (h >= 17 && h < 21);
  return mealWindow ? "meal" : "snack";
}

/** Document: "40 g protein per meal. Non-negotiable." */
export const PROTEIN_PER_MEAL_G = 40;

/** Times a description must repeat before it's offered as a one-tap entry. */
export const QUICK_LOG_THRESHOLD = 3;

/**
 * The description an entry carries between the shutter firing and the model
 * answering. It is a status wearing a name's clothes, which is exactly why it
 * has to be written down once: two copies of it drift, and the copy that drifts
 * is the one deciding whether a row is still in progress.
 */
export const ANALYSING_PLACEHOLDER = "Analysing…";

// ─────────────────────────────────────────────────────────────
// Measurements
// ─────────────────────────────────────────────────────────────

export const MEASUREMENT_FIELDS = [
  { key: "weightKg", label: "Weight", unit: "kg", step: 0.1 },
  { key: "waistCm", label: "Waist", unit: "cm", step: 0.5, note: "At navel height, relaxed, breathed out" },
  { key: "neckCm", label: "Neck", unit: "cm", step: 0.5, note: "Needed for the body-fat estimate" },
  { key: "chestCm", label: "Chest", unit: "cm", step: 0.5 },
  { key: "thighCm", label: "Thigh", unit: "cm", step: 0.5 },
  { key: "upperArmCm", label: "Upper arm", unit: "cm", step: 0.5, note: "Flexed" },
] as const;

export const PHOTO_ANGLES = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
  { key: "side_flexed", label: "Side, flexed" },
] as const;

/** US Navy body-fat estimate, male, metric. */
export function navyBodyFat(waistCm: number, neckCm: number, heightCm: number): number | null {
  if (waistCm <= neckCm || heightCm <= 0) return null;
  const bf =
    495 /
      (1.0324 -
        0.19077 * Math.log10(waistCm - neckCm) +
        0.15456 * Math.log10(heightCm)) -
    450;
  return Number.isFinite(bf) ? Math.round(bf * 10) / 10 : null;
}
