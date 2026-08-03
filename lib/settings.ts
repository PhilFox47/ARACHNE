import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";
import { MAX_TOTAL_DAYS, MIN_TOTAL_DAYS, PHOTO_CORRECTION_DEFAULT_PCT, PROFILE, WATER_TARGET_ML_DEFAULT } from "./plan";
import { todayISO } from "./dates";
import { mergeEquipment, mergeVrGames, type EquipmentItem, type VrGame } from "./equipment";

export interface AppSettings {
  startDate: string;
  heightCm: number;
  startWeightKg: number;
  targetWeightKg: number;
  /** Length of the run, in days. The document's own is 365. */
  totalDays: number;
  photoCorrectionPct: number;
  waterTargetMl: number;
  /** Set once onboarding has been completed, and cleared by a reset. */
  onboardedAt: number | null;
  /** Overrides NANOGPT_VISION_MODEL when set, so the model is swappable in-app. */
  visionModel: string | null;
  equipment: EquipmentItem[];
  vrGames: VrGame[];
}

const DEFAULTS = {
  heightCm: PROFILE.heightCm,
  startWeightKg: PROFILE.startWeightKg,
  targetWeightKg: PROFILE.targetWeightKg,
  totalDays: PROFILE.totalDays,
  photoCorrectionPct: PHOTO_CORRECTION_DEFAULT_PCT,
  waterTargetMl: WATER_TARGET_ML_DEFAULT,
};

function readAll(): Record<string, string> {
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getSettings(): AppSettings {
  const raw = readAll();
  const num = (k: string, fallback: number) => {
    const v = Number(raw[k]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    // Falling back to today means a fresh install is on day 0, not day -19000.
    startDate: raw.start_date ?? todayISO(),
    heightCm: num("height_cm", DEFAULTS.heightCm),
    startWeightKg: num("start_weight_kg", DEFAULTS.startWeightKg),
    targetWeightKg: num("target_weight_kg", DEFAULTS.targetWeightKg),
    totalDays: Math.round(
      Math.max(MIN_TOTAL_DAYS, Math.min(MAX_TOTAL_DAYS, num("total_days", DEFAULTS.totalDays))),
    ),
    photoCorrectionPct: num("photo_correction_pct", DEFAULTS.photoCorrectionPct),
    waterTargetMl: num("water_target_ml", DEFAULTS.waterTargetMl),
    onboardedAt: raw.onboarded_at ? num("onboarded_at", 0) || null : null,
    visionModel: raw.vision_model?.trim() || null,
    equipment: mergeEquipment(safeJson(raw.equipment)),
    vrGames: mergeVrGames(safeJson(raw.vr_games)),
  };
}

function safeJson(v: string | undefined): unknown {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export function setEquipment(items: EquipmentItem[]): void {
  setSetting("equipment", JSON.stringify(items));
}

export function setVrGames(games: VrGame[]): void {
  setSetting("vr_games", JSON.stringify(games));
}

/** Database setting wins over the environment variable. */
export function activeVisionModel(): string | null {
  return getSettings().visionModel ?? (process.env.NANOGPT_VISION_MODEL || null);
}

export function setSetting(key: string, value: string | number): void {
  db.insert(settings)
    .values({ key, value: String(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } })
    .run();
}

/** Called once on first run so day 0 is pinned rather than drifting daily. */
export function ensureStartDate(): string {
  const existing = db.select().from(settings).where(eq(settings.key, "start_date")).get();
  if (existing) return existing.value;
  const today = todayISO();
  setSetting("start_date", today);
  return today;
}
