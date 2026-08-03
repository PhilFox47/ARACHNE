import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";
import { PHOTO_CORRECTION_DEFAULT_PCT, PROFILE } from "./plan";
import { todayISO } from "./dates";

export interface AppSettings {
  startDate: string;
  heightCm: number;
  startWeightKg: number;
  targetWeightKg: number;
  photoCorrectionPct: number;
  /** Overrides NANOGPT_VISION_MODEL when set, so the model is swappable in-app. */
  visionModel: string | null;
}

const DEFAULTS: Omit<AppSettings, "startDate" | "visionModel"> = {
  heightCm: PROFILE.heightCm,
  startWeightKg: PROFILE.startWeightKg,
  targetWeightKg: PROFILE.targetWeightKg,
  photoCorrectionPct: PHOTO_CORRECTION_DEFAULT_PCT,
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
    photoCorrectionPct: num("photo_correction_pct", DEFAULTS.photoCorrectionPct),
    visionModel: raw.vision_model?.trim() || null,
  };
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
