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
import { exerciseLogs, sessionPlans } from "./db/schema";
import { apiKey, baseUrl } from "./nanogpt";
import { activeVisionModel, getSettings } from "./settings";
import { equipmentSummary, gateExercise, ownedKeys, upgradeExercise } from "./equipment";
import {
  BASELINE_MODE,
  isBaselinePhase,
  roundsForWeek,
  sessionFor,
  type DayKey,
  type Exercise,
  type PhaseId,
} from "./plan";
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
export function parseDose(dose: string, defaultSets: number, baseline = false): {
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

  const isTime = /\bs\b|\bsec|\bmin/i.test(rest);
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
  const session = sessionFor(phase, dayKey);
  const baseline = isBaselinePhase(phase);
  const rounds = baseline ? BASELINE_MODE.rounds : roundsForWeek(weekIdx);
  const source: Exercise[] = session ? [...session.main, ...(session.extras ?? [])] : [];
  const owned = ownedKeys(getSettings().equipment);

  const exercises: PrescribedExercise[] = [];
  const seen = new Set<string>();

  for (const e of source) {
    // Gate before prescribing. Opening a session and finding work you
    // physically cannot do is worse than a substitution.
    const gate = gateExercise(e.name, owned);
    if (!gate.allowed && gate.substitute === null) continue;

    let use = gate.allowed
      ? { name: e.name, dose: e.dose, note: e.note ?? null }
      : { name: gate.substitute!.name, dose: gate.substitute!.dose, note: gate.substitute!.note };

    // Gating only goes down. If better kit is owned, use it — a ring dip is
    // still a dip, so this stays inside the movement the plan prescribed.
    const up = upgradeExercise(use.name, use.dose, owned);
    if (up) use = { name: up.name, dose: up.dose ?? use.dose, note: up.note };

    const key = exerciseKey(use.name);
    // Sets are keyed by movement, so the same movement twice in one session
    // would have its logs overwrite each other. A substitution that lands on
    // something already prescribed is simply dropped.
    if (seen.has(key)) continue;
    seen.add(key);

    const p = parseDose(use.dose, rounds, baseline);
    exercises.push({
      key,
      name: use.name,
      sets: p.sets,
      metric: p.metric,
      repRange: p.repRange,
      targetReps: p.reps,
      targetSeconds: p.seconds,
      targetWeightKg: null,
      note: baseline ? (use.note ? `${use.note} · Stop well short.` : "Stop well short.") : use.note,
      perSide: p.perSide,
      loaded: looksLoaded(use.name),
      substitutedFrom: use.name === e.name ? null : e.name,
    });
  }

  return { date, dayKey, phase, source: "plan", model: null, exercises };
}

export interface ExerciseHistoryRow {
  date: string;
  bestReps: number | null;
  bestWeightKg: number | null;
  bestSeconds: number | null;
  totalSets: number;
}

/** Best set per session for one movement, most recent first. */
export function exerciseHistory(key: string, limit = 4): ExerciseHistoryRow[] {
  return db
    .select({
      date: exerciseLogs.date,
      bestReps: sql<number | null>`MAX(${exerciseLogs.reps})`,
      bestWeightKg: sql<number | null>`MAX(${exerciseLogs.weightKg})`,
      bestSeconds: sql<number | null>`MAX(${exerciseLogs.seconds})`,
      totalSets: sql<number>`COUNT(*)`,
    })
    .from(exerciseLogs)
    .where(eq(exerciseLogs.exerciseKey, key))
    .groupBy(exerciseLogs.date)
    .orderBy(desc(exerciseLogs.date))
    .limit(limit)
    .all();
}

/** Applies the last session's numbers so a repeat session isn't a blank form. */
function withHistory(p: Prescription): Prescription {
  return {
    ...p,
    exercises: p.exercises.map((e) => {
      const hist = exerciseHistory(e.key, 1);
      if (hist.length === 0) return e;
      const last = hist[0];
      return {
        ...e,
        targetReps: e.metric === "reps" ? (last.bestReps ?? e.targetReps) : e.targetReps,
        targetSeconds: e.metric === "time" ? (last.bestSeconds ?? e.targetSeconds) : e.targetSeconds,
        targetWeightKg: last.bestWeightKg ?? e.targetWeightKg,
        // Once you've loaded a movement, keep showing the field.
        loaded: e.loaded || last.bestWeightKg !== null,
      };
    }),
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

  const context = base.exercises.map((e) => ({
    name: e.name,
    metric: e.metric,
    plan_sets: e.sets,
    plan_reps: e.repRange,
    per_side: e.perSide,
    history: exerciseHistory(e.key, 4).map((h) => ({
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
