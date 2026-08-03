"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { todayISO, weekIndex } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { deleteStored, saveDataUrl } from "@/lib/photos";
import { PHOTO_ANGLES } from "@/lib/plan";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

function refresh() {
  for (const p of ["/suit-check", "/suit-check/compare", "/", "/vitals", "/progress", "/journey"]) {
    revalidatePath(p);
  }
}

const ANGLE_KEYS = PHOTO_ANGLES.map((a) => a.key) as string[];

/**
 * One shot per angle per week. Re-shooting an angle replaces the old file and
 * deletes it from disk — the comparison view only makes sense with one frame
 * per angle per week, and orphaned images would accumulate for a year.
 */
export async function saveSuitPhoto(angle: string, dataUrl: string, forWeek?: number) {
  await guard();
  if (!ANGLE_KEYS.includes(angle)) return { ok: false as const, error: "Unknown angle." };

  const s = getSettings();
  const date = todayISO();
  const wk = forWeek ?? weekIndex(s.startDate, date);

  const saved = saveDataUrl(dataUrl, "suit", date);
  if ("error" in saved) return { ok: false as const, error: saved.error };

  const existing = db
    .select()
    .from(photos)
    .where(and(eq(photos.weekIndex, wk), eq(photos.angle, angle as "front")))
    .get();

  if (existing) {
    deleteStored(existing.path);
    db.update(photos).set({ path: saved.path, date }).where(eq(photos.id, existing.id)).run();
  } else {
    db.insert(photos)
      .values({ date, weekIndex: wk, angle: angle as "front", path: saved.path })
      .run();
  }

  refresh();
  return { ok: true as const, path: saved.path };
}

export async function deleteSuitPhoto(id: number) {
  await guard();
  const row = db.select().from(photos).where(eq(photos.id, id)).get();
  if (!row) return { ok: true as const };
  deleteStored(row.path);
  db.delete(photos).where(eq(photos.id, id)).run();
  refresh();
  return { ok: true as const };
}
