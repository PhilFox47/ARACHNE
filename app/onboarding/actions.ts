"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { measurements, weights } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { setSetting } from "@/lib/settings";
import { MAX_TOTAL_DAYS, MIN_TOTAL_DAYS, navyBodyFat } from "@/lib/plan";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number.parseFloat(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) && x > 0 ? x : null;
};

interface OnboardingInput {
  startDate: string;
  heightCm: number;
  weightKg: number;
  bodyfatPct?: number | null;
  targetWeightKg: number;
  totalDays: number;
  waistCm?: number | null;
  neckCm?: number | null;
  chestCm?: number | null;
  thighCm?: number | null;
  upperArmCm?: number | null;
  waterTargetMl?: number | null;
}

/**
 * Writes the whole starting position in one transaction-shaped call: settings,
 * the first weight reading, and the day-1 tape measurements.
 *
 * The weight is written as a normal reading rather than only as a setting —
 * without it the corridor opens with a hole on day 0 and the seven-day average
 * has nothing to average.
 */
export async function completeOnboarding(input: OnboardingInput) {
  await guard();

  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : todayISO();
  const heightCm = num(input.heightCm);
  const weightKg = num(input.weightKg);
  const targetWeightKg = num(input.targetWeightKg);

  if (heightCm === null || heightCm < 120 || heightCm > 230) {
    return { ok: false as const, error: "Height should be between 120 and 230 cm." };
  }
  if (weightKg === null || weightKg < 35 || weightKg > 300) {
    return { ok: false as const, error: "That weight is outside the plausible range." };
  }
  if (targetWeightKg === null || targetWeightKg < 35 || targetWeightKg > 300) {
    return { ok: false as const, error: "That goal weight is outside the plausible range." };
  }
  if (targetWeightKg > weightKg) {
    return { ok: false as const, error: "This plan is a deficit — the goal has to be below where you start." };
  }
  const totalDays = Math.round(input.totalDays);
  if (!Number.isFinite(totalDays) || totalDays < MIN_TOTAL_DAYS || totalDays > MAX_TOTAL_DAYS) {
    return {
      ok: false as const,
      error: `Pick a timeframe between ${MIN_TOTAL_DAYS} and ${MAX_TOTAL_DAYS} days.`,
    };
  }

  let bodyfatPct: number | null = null;
  if (input.bodyfatPct !== undefined && input.bodyfatPct !== null) {
    const bf = num(input.bodyfatPct);
    if (bf === null || bf < 3 || bf > 65) {
      return { ok: false as const, error: "That body-fat reading is outside the plausible range." };
    }
    bodyfatPct = Math.round(bf * 10) / 10;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;

  setSetting("start_date", startDate);
  setSetting("height_cm", round1(heightCm));
  setSetting("start_weight_kg", round1(weightKg));
  setSetting("target_weight_kg", round1(targetWeightKg));
  setSetting("total_days", totalDays);
  if (input.waterTargetMl) setSetting("water_target_ml", Math.round(input.waterTargetMl));

  // The first reading goes on the start date, not on today — starting tomorrow
  // and weighing yourself now should still put day 0 at your actual weight.
  db.insert(weights)
    .values({ date: startDate, weightKg: round1(weightKg), bodyfatPct })
    .onConflictDoUpdate({
      target: weights.date,
      set: { weightKg: round1(weightKg), bodyfatPct },
    })
    .run();

  const waist = num(input.waistCm);
  const neck = num(input.neckCm);
  const anyTape =
    waist !== null ||
    neck !== null ||
    num(input.chestCm) !== null ||
    num(input.thighCm) !== null ||
    num(input.upperArmCm) !== null;

  if (anyTape) {
    // Stored, not derived — a later height change must not rewrite this reading.
    const navy = waist !== null && neck !== null ? navyBodyFat(waist, neck, heightCm) : null;
    const values = {
      date: startDate,
      weightKg: round1(weightKg),
      waistCm: waist,
      neckCm: neck,
      chestCm: num(input.chestCm),
      thighCm: num(input.thighCm),
      upperArmCm: num(input.upperArmCm),
      bodyfatPct: navy,
    };
    const existing = db.select().from(measurements).where(eq(measurements.date, startDate)).get();
    if (existing) db.update(measurements).set(values).where(eq(measurements.id, existing.id)).run();
    else db.insert(measurements).values(values).run();
  }

  setSetting("onboarded_at", Math.floor(Date.now() / 1000));

  for (const p of ["/", "/patrol", "/fuel", "/vitals", "/journey", "/progress", "/settings", "/baseline"]) {
    revalidatePath(p);
  }

  return { ok: true as const, startDate };
}
