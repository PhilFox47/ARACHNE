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
      "Track food honestly at maintenance and change nothing. Two new habits at once is the classic February dropout.",
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
      "Push-ups start elevated and walk down: table → chair → sofa edge → floor. Only advance at a clean 3×12.",
      "Three dead hangs every Wednesday — grip and shoulder stability underpin everything later.",
      "40 g of protein per meal, non-negotiable. Weigh daily, judge weekly.",
      "The deficit starts in week 3, at 2,300 kcal.",
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

export function phaseForDay(day: number): Phase {
  const clamped = Math.max(0, Math.min(day, PROFILE.totalDays));
  return PHASES.find((p) => clamped >= p.startDay && clamped <= p.endDay) ?? PHASES[PHASES.length - 1];
}

/** Calorie target for a day, accounting for the closing taper. */
export function kcalTargetForDay(day: number): { kcal: number; taper: boolean } {
  if (day > PROFILE.totalDays - TAPER.days && day <= PROFILE.totalDays) {
    return { kcal: TAPER.kcal, taper: true };
  }
  return { kcal: phaseForDay(day).kcal, taper: false };
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

/** Target weight on a given day, interpolated between anchors. */
export function corridorTarget(day: number): number {
  const d = Math.max(0, Math.min(day, PROFILE.totalDays));
  for (let i = 0; i < CORRIDOR_ANCHORS.length - 1; i++) {
    const a = CORRIDOR_ANCHORS[i];
    const b = CORRIDOR_ANCHORS[i + 1];
    if (d >= a.day && d <= b.day) {
      const span = b.day - a.day;
      if (span === 0) return a.kg;
      return a.kg + ((b.kg - a.kg) * (d - a.day)) / span;
    }
  }
  return CORRIDOR_ANCHORS[CORRIDOR_ANCHORS.length - 1].kg;
}

// ─────────────────────────────────────────────────────────────
// Week structure
// ─────────────────────────────────────────────────────────────

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const TRAINING_DAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];
export const OFF_DUTY_DAYS: DayKey[] = ["sat", "sun"];

export const SESSION_SHAPE = { warmupMin: 4, workMin: 22, cooldownMin: 4 } as const;

/** Every 4th week. Document: "2 rounds instead of 3, no training to failure." */
export function isLowProfileWeek(weekIndex: number): boolean {
  return (weekIndex + 1) % 4 === 0;
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
  "The flatter your hands, the harder it gets. Table → chair → sofa edge → floor. Only move on at a clean 3×12.";

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
      { name: "Elevated push-ups", dose: "8–12", note: "Hands on table or sofa edge" },
      { name: "Dumbbell shoulder press", dose: "10–12" },
      { name: "Triceps dips on chair edge", dose: "8–12" },
      { name: "Lateral raises", dose: "12–15", note: "Light — 4–5 kg is plenty" },
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
      { name: "Wall slides", dose: "15" },
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
      { name: "Reverse lunges", dose: "10 per side" },
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
    main: [
      { name: "Bear crawl", dose: "3× 30 s", note: "Forwards and backwards" },
      { name: "Spider crawl", dose: "3× 20 s", note: "Low — belly close to the floor" },
      { name: "Wall handstand", dose: "3× 20–30 s", note: "Belly to wall, walk up" },
      { name: "Shoulder roll", dose: "10 per side", note: "On the mat" },
      { name: "Squat jumps", dose: "3× 8" },
      { name: "Hollow hold", dose: "3× 20 s" },
      { name: "Burpees", dose: "3× 8" },
    ],
    rule:
      "The shoulder roll is the foundational parkour skill and your insurance against injury in everything that follows. Slow from a crouch first, then from standing, then from a walk.",
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
    main: [
      ...P1.fri!.main,
      { name: "Cartwheel", dose: "5 per side", since: 2 },
      { name: "Kip-up progression", dose: "5", note: "To sitting, then to a crouch, then to standing", since: 2 },
      { name: "L-sit tuck", dose: "3× 10 s", since: 2 },
      { name: "Freestanding handstand attempts", dose: "5 min", since: 2 },
    ],
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
    main: [
      ...P1.fri!.main,
      { name: "Cartwheel", dose: "5 per side" },
      { name: "Kip-up progression", dose: "5" },
      { name: "Roundoff", dose: "5", since: 3 },
      { name: "Muscle-up progression", dose: "5", note: "Explosive pull-ups + dips", since: 3 },
      { name: "Precision jumps", dose: "8", since: 3 },
      { name: "Wall run", dose: "5", since: 3 },
      { name: "L-sit", dose: "3× 10 s" },
    ],
    rule:
      "Injury rule for this phase: everything new is learned on a soft surface and in slow motion. No skill gets tried “quickly” at the end of a session when you're tired. Pain that isn't muscle soreness → stop, and see a physio if it persists. A torn ligament in month 8 costs you the whole year.",
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
