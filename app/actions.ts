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

export async function logWeight(weightKg: number, date?: string) {
  await guard();

  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
    return { ok: false as const, error: "That reading is outside the plausible range." };
  }

  const d = date ?? todayISO();
  const value = Math.round(weightKg * 10) / 10;

  db.insert(weights)
    .values({ date: d, weightKg: value })
    .onConflictDoUpdate({ target: weights.date, set: { weightKg: value } })
    .run();

  revalidatePath("/");
  revalidatePath("/vitals");
  return { ok: true as const, weightKg: value, date: d };
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
  ];
  if (!allowed.includes(key)) return { ok: false as const, error: "Unknown setting." };
  setSetting(key, value);
  revalidatePath("/");
  revalidatePath("/vitals");
  revalidatePath("/settings");
  return { ok: true as const };
}
