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
  {
    key: "parallettes",
    label: "Parallettes or push-up bars",
    note: "Deeper push-ups, and the L-sit gets far easier to learn.",
    defaultOwned: false,
  },
  { key: "ab_wheel", label: "Ab wheel", defaultOwned: false },
  { key: "jump_rope", label: "Jump rope", note: "A conditioning option that needs no headset.", defaultOwned: false },
  { key: "weight_vest", label: "Weighted vest", note: "Loads bodyweight movements once they get easy.", defaultOwned: false },
  {
    key: "outdoor_bars",
    label: "Outdoor bars or playground",
    note: "Park bars cover everything a doorframe bar does, and more.",
    defaultOwned: false,
  },
  { key: "space", label: "Room to move", note: "Cartwheels, broad jumps and rolls need floor.", defaultOwned: true },
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
const BAR = ["pullup_bar", "rings", "gym", "outdoor_bars"];
const LOAD = ["dumbbells", "heavy_dumbbells", "kettlebell", "bands", "gym", "weight_vest"];

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
  {
    match: /pistol squat/i,
    needsAny: ["bench", "gym", "space"],
    substitute: {
      name: "Split squat",
      dose: "10 per side",
      note: "Substituted — nothing to sit back to.",
    },
  },
  {
    match: /inverted row/i,
    // A sturdy table is enough, so this only fails with nothing at all.
    needsAny: ["pullup_bar", "rings", "gym", "outdoor_bars", "bench", "space"],
    substitute: {
      name: "Prone back extension",
      dose: "12–15",
      note: "Substituted — nothing to row under. Keeps the posterior chain working.",
    },
  },
  {
    match: /broad jump|precision jump|squat jump|wall run/i,
    needsAny: ["space", "gym", "outdoor_bars"],
    substitute: {
      name: "Calf raises",
      dose: "15–20",
      note: "Substituted — no room to jump.",
    },
  },
  {
    match: /l-?sit/i,
    needsAny: ["parallettes", "rings", "gym", "space"],
    substitute: {
      name: "Seated leg lifts",
      dose: "10",
      note: "Substituted — nothing to press down on.",
    },
  },
  // Tumbling needs something soft. Crawls deliberately aren't on this list —
  // a bear crawl is hands and feet on the floor with nothing to land on, and
  // gating it away costs the baseline sweep a movement for no reason.
  {
    match: /shoulder roll|rock-?backs?|kip-?up|cartwheel|roundoff|bridge|kong vault/i,
    needsAny: ["mat", "gym"],
    substitute: null,
  },
];

// ─────────────────────────────────────────────────────────────
// Upgrades
// ─────────────────────────────────────────────────────────────

interface Upgrade {
  match: RegExp;
  /** All of these must be owned. */
  needs: string[];
  to: { name: string; dose?: string; note: string };
}

/**
 * Gating only ever goes downward. Upgrades are the other half: if you own
 * something better, the session should use it rather than leave the kit in a
 * cupboard.
 *
 * Every upgrade stays inside the same movement pattern the plan prescribed —
 * a ring dip is still a dip. Equipment changes how a movement is loaded, never
 * which movement the day is for.
 */
const UPGRADES: Upgrade[] = [
  {
    match: /triceps dips on chair edge|dips between two chairs/i,
    needs: ["rings"],
    to: { name: "Ring dips", note: "Rings — harder through the shoulder, and kinder to the wrist." },
  },
  {
    match: /inverted row/i,
    needs: ["rings"],
    to: { name: "Ring rows", note: "Rings — free rotation, so the shoulder tracks naturally." },
  },
  {
    match: /^push-?ups?$|elevated push-?ups/i,
    needs: ["parallettes"],
    to: { name: "Deficit push-ups on parallettes", note: "Parallettes — deeper range, neutral wrists." },
  },
  {
    match: /l-?sit tuck|^l-?sit$/i,
    needs: ["parallettes"],
    to: { name: "L-sit on parallettes", note: "Parallettes — clearance, so the progression actually moves." },
  },
  {
    match: /hollow hold/i,
    needs: ["ab_wheel"],
    to: { name: "Ab wheel rollouts", dose: "8–10", note: "Ab wheel — the loaded version of the same brace." },
  },
  {
    match: /dead hang/i,
    needs: ["rings"],
    to: { name: "Ring hang", note: "Rings — the shoulder is free to rotate under load." },
  },
];

export interface UpgradeResult {
  name: string;
  dose: string | null;
  note: string;
}

/** Returns a better variant when the kit for it is owned. */
export function upgradeExercise(name: string, dose: string, owned: Set<string>): UpgradeResult | null {
  for (const u of UPGRADES) {
    if (!u.match.test(name)) continue;
    if (!u.needs.every((k) => owned.has(k))) continue;
    return { name: u.to.name, dose: u.to.dose ?? dose, note: u.to.note };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// VR games
// ─────────────────────────────────────────────────────────────

export interface VrGame {
  key: string;
  label: string;
  /** How the plan says to use it. */
  howTo: string;
  owned: boolean;
  custom: boolean;
}

/** Seeded from the document's own Thursday list. */
export const VR_CATALOGUE: Omit<VrGame, "owned" | "custom">[] = [
  { key: "supernatural", label: "Supernatural", howTo: "Flow or Boxing, intensity “Intense”" },
  { key: "beat_saber", label: "Beat Saber", howTo: "7–8 songs on Expert without a break, full-body — not just wrists" },
  { key: "thrill", label: "Thrill of the Fight", howTo: "3× 3-min rounds. Harder than it looks." },
  { key: "bodycombat", label: "Les Mills Bodycombat", howTo: "One full session" },
  { key: "fitxr", label: "FitXR", howTo: "One full class" },
];

export function defaultVrGames(): VrGame[] {
  return VR_CATALOGUE.map((g) => ({ ...g, owned: true, custom: false }));
}

export function mergeVrGames(stored: unknown): VrGame[] {
  const saved = Array.isArray(stored) ? (stored as Partial<VrGame>[]) : null;
  if (saved === null) return defaultVrGames();

  const byKey = new Map(saved.filter((g) => typeof g?.key === "string").map((g) => [g.key as string, g]));

  const catalogue = VR_CATALOGUE.map((g) => {
    const s = byKey.get(g.key);
    return { ...g, owned: typeof s?.owned === "boolean" ? s.owned : true, custom: false };
  });

  const custom = saved
    .filter((g) => g.custom === true && typeof g.key === "string" && typeof g.label === "string")
    .map((g) => ({
      key: g.key as string,
      label: g.label as string,
      howTo: typeof g.howTo === "string" ? g.howTo : "25 minutes, heart rate high",
      owned: g.owned !== false,
      custom: true,
    }));

  return [...catalogue, ...custom];
}

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
