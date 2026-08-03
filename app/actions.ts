"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { weights } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { setSetting } from "@/lib/settings";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

export async function logWeight(weightKg: number, date?: string, bodyfatPct?: number | null) {
  await guard();

  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
    return { ok: false as const, error: "That reading is outside the plausible range." };
  }

  // A scale that reports 3% or 70% has misread you, not measured you.
  let bf: number | null = null;
  if (bodyfatPct !== undefined && bodyfatPct !== null) {
    if (!Number.isFinite(bodyfatPct) || bodyfatPct < 3 || bodyfatPct > 65) {
      return { ok: false as const, error: "That body-fat reading is outside the plausible range." };
    }
    bf = Math.round(bodyfatPct * 10) / 10;
  }

  const d = date ?? todayISO();
  const value = Math.round(weightKg * 10) / 10;

  db.insert(weights)
    .values({ date: d, weightKg: value, bodyfatPct: bf })
    .onConflictDoUpdate({
      target: weights.date,
      // Only overwrite the body fat when one was supplied, so logging weight
      // from a scale without the feature doesn't wipe yesterday's reading.
      set: bf === null ? { weightKg: value } : { weightKg: value, bodyfatPct: bf },
    })
    .run();

  revalidatePath("/");
  revalidatePath("/vitals");
  return { ok: true as const, weightKg: value, date: d, bodyfatPct: bf };
}

export async function deleteWeight(date: string) {
  await guard();
  db.delete(weights).where(eq(weights.date, date)).run();
  revalidatePath("/");
  revalidatePath("/vitals");
  return { ok: true as const };
}

export async function updateSetting(key: string, value: string | number) {
  await guard();
  const allowed = [
    "start_date",
    "height_cm",
    "start_weight_kg",
    "target_weight_kg",
    "photo_correction_pct",
    "vision_model",
    "water_target_ml",
  ];
  if (!allowed.includes(key)) return { ok: false as const, error: "Unknown setting." };
  setSetting(key, value);
  revalidatePath("/");
  revalidatePath("/vitals");
  revalidatePath("/settings");
  return { ok: true as const };
}
