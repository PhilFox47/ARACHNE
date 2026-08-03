/**
 * What you actually own, and what that changes.
 *
 * Two mechanisms, deliberately separate:
 *   1. Deterministic gating. A movement that needs a bar you don't have is
 *      swapped for a named substitute, in code, every time. No model involved —
 *      you should never open a session and find work you cannot physically do.
 *   2. Model context. The full list, including anything custom you added, is
 *      passed to the prescription call so it can pick loads and variations that
 *      match your kit.
 */

export interface EquipmentDef {
  key: string;
  label: string;
  note?: string;
  /** Ticked on a fresh install. */
  defaultOwned: boolean;
}

/**
 * The catalogue is seeded from the plan document's own shopping list — it calls
 * the pull-up bar "the single most important purchase", because lats are what
 * fill the suit.
 */
export const EQUIPMENT_CATALOGUE: EquipmentDef[] = [
  {
    key: "pullup_bar",
    label: "Pull-up bar",
    note: "Doorframe. The document calls this the most important purchase — without it half your back development is missing.",
    defaultOwned: false,
  },
  {
    key: "dumbbells",
    label: "Dumbbells",
    note: "The plan assumes a pair around 8 kg to start.",
    defaultOwned: true,
  },
  {
    key: "heavy_dumbbells",
    label: "Heavier dumbbells",
    note: "8 kg gets light from about month 3.",
    defaultOwned: false,
  },
  {
    key: "bands",
    label: "Resistance bands",
    note: "With handles. Bridges the gap when the dumbbells stop being enough.",
    defaultOwned: false,
  },
  { key: "mat", label: "Exercise mat", note: "Required for rolls and mobility work.", defaultOwned: false },
  { key: "rings", label: "Gymnastic rings", note: "Optional, from month 6.", defaultOwned: false },
  { key: "vr", label: "VR headset", note: "Thursday conditioning is built around it.", defaultOwned: true },
  { key: "gym", label: "Gym membership", defaultOwned: false },
  { key: "bench", label: "Bench or step", defaultOwned: false },
  { key: "kettlebell", label: "Kettlebell", defaultOwned: false },
];

export interface EquipmentItem {
  key: string;
  label: string;
  owned: boolean;
  /** Added by you rather than from the catalogue. */
  custom: boolean;
  note?: string;
}

export function defaultEquipment(): EquipmentItem[] {
  return EQUIPMENT_CATALOGUE.map((e) => ({
    key: e.key,
    label: e.label,
    owned: e.defaultOwned,
    custom: false,
    note: e.note,
  }));
}

/** Merges stored state over the catalogue, so new catalogue entries appear. */
export function mergeEquipment(stored: unknown): EquipmentItem[] {
  const saved = Array.isArray(stored) ? (stored as Partial<EquipmentItem>[]) : [];
  const byKey = new Map(saved.filter((s) => typeof s?.key === "string").map((s) => [s.key as string, s]));

  const catalogue = EQUIPMENT_CATALOGUE.map((e) => {
    const s = byKey.get(e.key);
    return {
      key: e.key,
      label: e.label,
      owned: typeof s?.owned === "boolean" ? s.owned : e.defaultOwned,
      custom: false,
      note: e.note,
    };
  });

  const custom = saved
    .filter((s) => s.custom === true && typeof s.key === "string" && typeof s.label === "string")
    .map((s) => ({
      key: s.key as string,
      label: s.label as string,
      owned: s.owned !== false,
      custom: true,
    }));

  return [...catalogue, ...custom];
}

export function ownedKeys(items: EquipmentItem[]): Set<string> {
  return new Set(items.filter((i) => i.owned).map((i) => i.key));
}

// ─────────────────────────────────────────────────────────────
// Gating
// ─────────────────────────────────────────────────────────────

interface Gate {
  /** Matched against the movement name. */
  match: RegExp;
  /** Any one of these satisfies it. */
  needsAny: string[];
  /** What to do instead. Null means drop the movement entirely. */
  substitute: { name: string; dose: string; note: string } | null;
}

/**
 * Substitutes are chosen to keep the training effect, not just to fill a slot —
 * a missing bar costs you vertical pulling, so the replacement is the closest
 * horizontal pull available rather than something unrelated.
 */
const BAR = ["pullup_bar", "rings", "gym"];
const LOAD = ["dumbbells", "heavy_dumbbells", "kettlebell", "bands", "gym"];

/**
 * One rule per movement rather than one per equipment type. A generic
 * "bodyweight equivalent" would land three times in the same session under the
 * same name — and since sets are keyed by movement name, those three would
 * write over each other.
 */
const GATES: Gate[] = [
  {
    match: /pull-?up|muscle-?up/i,
    needsAny: BAR,
    substitute: {
      name: "Inverted rows under a table",
      dose: "8–12",
      note: "Substituted — no bar. Closest horizontal pull available.",
    },
  },
  // A dead hang has no bar-free equivalent worth prescribing.
  { match: /dead hang|hanging knee raise/i, needsAny: BAR, substitute: null },
  {
    match: /goblet squat/i,
    needsAny: LOAD,
    substitute: {
      name: "Bodyweight squat, slow tempo",
      dose: "15–20",
      note: "Substituted — nothing to load with. Three seconds down.",
    },
  },
  {
    match: /dumbbell row|archer row/i,
    needsAny: LOAD,
    substitute: {
      name: "Towel row in a doorway",
      dose: "10–12 per side",
      note: "Substituted — nothing to load with.",
    },
  },
  {
    match: /romanian deadlift/i,
    needsAny: LOAD,
    substitute: {
      name: "Single-leg Romanian deadlift",
      dose: "10 per side",
      note: "Substituted — bodyweight, balance does the work.",
    },
  },
  {
    match: /shoulder press/i,
    needsAny: LOAD,
    substitute: {
      name: "Pike push-ups",
      dose: "8–12",
      note: "Substituted — the bodyweight vertical press.",
    },
  },
  {
    match: /lateral raise/i,
    needsAny: LOAD,
    substitute: {
      name: "Wall slides",
      dose: "15",
      note: "Substituted — nothing to raise. Keeps the shoulder work.",
    },
  },
  {
    match: /jefferson curl/i,
    needsAny: LOAD,
    substitute: {
      name: "Seated forward fold",
      dose: "60 s",
      note: "Substituted — unloaded, same position.",
    },
  },
  {
    match: /nordic curl/i,
    needsAny: ["bench", "mat", "gym"],
    substitute: {
      name: "Glute bridge march",
      dose: "10 per side",
      note: "Substituted — nowhere to anchor your feet.",
    },
  },
  {
    match: /bulgarian split/i,
    needsAny: ["bench", "gym"],
    substitute: {
      name: "Reverse lunges",
      dose: "10 per side",
      note: "Substituted — nothing to elevate the rear foot on.",
    },
  },
  // Floor skills need something soft. No mat, no tumbling.
  {
    match: /shoulder roll|bear crawl|spider crawl|kip-?up|cartwheel|roundoff|bridge/i,
    needsAny: ["mat", "gym"],
    substitute: null,
  },
];

export interface GateResult {
  allowed: boolean;
  substitute: { name: string; dose: string; note: string } | null;
  missing: string[];
}

/** Whether a movement is doable with what you own, and what to do if not. */
export function gateExercise(name: string, owned: Set<string>): GateResult {
  for (const g of GATES) {
    if (!g.match.test(name)) continue;
    if (g.needsAny.some((k) => owned.has(k))) continue;
    return { allowed: false, substitute: g.substitute, missing: g.needsAny };
  }
  return { allowed: true, substitute: null, missing: [] };
}

/** Human-readable list for the model prompt and the settings summary. */
export function equipmentSummary(items: EquipmentItem[]): string {
  const have = items.filter((i) => i.owned).map((i) => i.label);
  return have.length > 0 ? have.join(", ") : "bodyweight only, no equipment";
}
