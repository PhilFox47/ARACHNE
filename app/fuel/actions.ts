"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { favourites, foodEntries } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { suggestMealType, QUICK_LOG_THRESHOLD } from "@/lib/plan";
import { saveDataUrl, deleteStored } from "@/lib/photos";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

/** Lowercased, punctuation-stripped. Groups repeats for quick-log. */
export async function normalise(s: string): Promise<string> {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normSync(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Saves immediately and returns the id. Analysis happens afterwards against
 * this row — the entry exists before the model is ever called, which is what
 * keeps logging inside the three-interaction budget on a slow connection.
 */
export async function createEntry(input: {
  description: string;
  photoDataUrl?: string | null;
  mealType?: "meal" | "snack";
  date?: string;
  /** Context the photo can't carry — size, portion eaten, hidden ingredients. */
  userNote?: string | null;
}) {
  await guard();

  const description = input.description.trim() || "Unnamed";
  const date = input.date ?? todayISO();
  const now = new Date();

  let photoPath: string | null = null;
  if (input.photoDataUrl) {
    const saved = saveDataUrl(input.photoDataUrl, "meals", date);
    if ("error" in saved) return { ok: false as const, error: saved.error };
    photoPath = saved.path;
  }

  const row = db
    .insert(foodEntries)
    .values({
      loggedAt: Math.floor(now.getTime() / 1000),
      date,
      description,
      normKey: normSync(description),
      mealType: input.mealType ?? suggestMealType(now),
      photoPath,
      userNote: input.userNote?.trim() || null,
      source: input.photoDataUrl ? "ai" : "manual",
    })
    .returning({ id: foodEntries.id })
    .get();

  revalidatePath("/fuel");
  revalidatePath("/");
  return { ok: true as const, id: row.id, photoPath };
}

export async function updateEntry(
  id: number,
  patch: {
    description?: string;
    portion?: string | null;
    kcal?: number | null;
    proteinG?: number | null;
    carbsG?: number | null;
    fatG?: number | null;
    saturatedFatG?: number | null;
    sugarG?: number | null;
    fiberG?: number | null;
    saltG?: number | null;
    mealType?: "meal" | "snack";
  },
) {
  await guard();

  const set: Record<string, unknown> = { edited: true };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) set[k] = v;
  }
  if (patch.description !== undefined) set.normKey = normSync(patch.description);

  db.update(foodEntries).set(set).where(eq(foodEntries.id, id)).run();
  revalidatePath("/fuel");
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteEntry(id: number) {
  await guard();
  const row = db.select().from(foodEntries).where(eq(foodEntries.id, id)).get();
  if (row?.photoPath) deleteStored(row.photoPath);
  db.delete(foodEntries).where(eq(foodEntries.id, id)).run();
  revalidatePath("/fuel");
  revalidatePath("/");
  return { ok: true as const };
}

/**
 * Anything eaten three or more times becomes a one-tap entry. Derived with a
 * GROUP BY rather than kept in its own table — a second table would need
 * dual-writes and would drift the moment an entry was edited.
 *
 * Favourites are excluded: they already have a chip of their own, and the same
 * coffee appearing twice on one screen is two answers to one question.
 */
export async function quickLogCandidates(limit = 8) {
  await guard();
  const starred = db.select({ normKey: favourites.normKey }).from(favourites).all();
  const exclude = starred.map((f) => f.normKey);

  return db
    .select({
      normKey: foodEntries.normKey,
      description: sql<string>`MAX(${foodEntries.description})`,
      uses: sql<number>`COUNT(*)`,
      kcal: sql<number | null>`ROUND(AVG(${foodEntries.kcal}), 0)`,
      proteinG: sql<number | null>`ROUND(AVG(${foodEntries.proteinG}), 1)`,
      carbsG: sql<number | null>`ROUND(AVG(${foodEntries.carbsG}), 1)`,
      fatG: sql<number | null>`ROUND(AVG(${foodEntries.fatG}), 1)`,
      mealType: sql<"meal" | "snack">`MAX(${foodEntries.mealType})`,
      lastUsed: sql<number>`MAX(${foodEntries.loggedAt})`,
    })
    .from(foodEntries)
    .where(exclude.length > 0 ? notInArray(foodEntries.normKey, exclude) : undefined)
    .groupBy(foodEntries.normKey)
    .having(sql`COUNT(*) >= ${QUICK_LOG_THRESHOLD}`)
    .orderBy(desc(sql`MAX(${foodEntries.loggedAt})`))
    .limit(limit)
    .all();
}

// ─────────────────────────────────────────────────────────────
// Favourites
// ─────────────────────────────────────────────────────────────

/**
 * Most-used first, so the coffee you have every morning settles at the front on
 * its own and stays there. No manual ordering to maintain, and a favourite you
 * stop using drifts out of the way without needing to be deleted.
 */
export async function listFavourites() {
  await guard();
  return db
    .select()
    .from(favourites)
    .orderBy(desc(favourites.uses), desc(favourites.createdAt))
    .all();
}

/**
 * Stars an entry, copying its numbers across.
 *
 * Re-starring something already saved refreshes the stored values rather than
 * erroring — that is how you correct a favourite whose estimate was wrong: fix
 * the entry, star it again.
 */
export async function addFavourite(entryId: number, label?: string) {
  await guard();

  const src = db.select().from(foodEntries).where(eq(foodEntries.id, entryId)).get();
  if (!src) return { ok: false as const, error: "That entry is gone." };

  const name = (label ?? src.description).trim().slice(0, 60) || src.description;

  db.insert(favourites)
    .values({
      normKey: src.normKey,
      label: name,
      portion: src.portion,
      kcal: src.kcal,
      proteinG: src.proteinG,
      carbsG: src.carbsG,
      fatG: src.fatG,
      saturatedFatG: src.saturatedFatG,
      sugarG: src.sugarG,
      fiberG: src.fiberG,
      saltG: src.saltG,
      mealType: src.mealType,
    })
    .onConflictDoUpdate({
      target: favourites.normKey,
      // The label is left alone: you named it, and re-starring is about the
      // numbers being wrong, not the name.
      set: {
        portion: src.portion,
        kcal: src.kcal,
        proteinG: src.proteinG,
        carbsG: src.carbsG,
        fatG: src.fatG,
        saturatedFatG: src.saturatedFatG,
        sugarG: src.sugarG,
        fiberG: src.fiberG,
        saltG: src.saltG,
        mealType: src.mealType,
      },
    })
    .run();

  revalidatePath("/fuel");
  return { ok: true as const };
}

export async function removeFavourite(normKey: string) {
  await guard();
  db.delete(favourites).where(eq(favourites.normKey, normKey)).run();
  revalidatePath("/fuel");
  return { ok: true as const };
}

export async function renameFavourite(id: number, label: string) {
  await guard();
  const name = label.trim().slice(0, 60);
  if (name === "") return { ok: false as const, error: "A favourite needs a name." };
  db.update(favourites).set({ label: name }).where(eq(favourites.id, id)).run();
  revalidatePath("/fuel");
  return { ok: true as const };
}

/** One tap: the stored snapshot becomes today's entry. No photo, no model call. */
export async function logFavourite(id: number, date?: string) {
  await guard();

  const fav = db.select().from(favourites).where(eq(favourites.id, id)).get();
  if (!fav) return { ok: false as const, error: "That favourite is gone." };

  const now = Math.floor(Date.now() / 1000);
  db.insert(foodEntries)
    .values({
      loggedAt: now,
      date: date ?? todayISO(),
      description: fav.label,
      normKey: fav.normKey,
      kcal: fav.kcal,
      proteinG: fav.proteinG,
      carbsG: fav.carbsG,
      fatG: fav.fatG,
      saturatedFatG: fav.saturatedFatG,
      sugarG: fav.sugarG,
      fiberG: fav.fiberG,
      saltG: fav.saltG,
      portion: fav.portion,
      // Stored, not inferred — that is the whole reason a coffee gets starred.
      mealType: fav.mealType,
      source: "quick",
    })
    .run();

  db.update(favourites)
    .set({ uses: fav.uses + 1, lastUsedAt: now })
    .where(eq(favourites.id, id))
    .run();

  revalidatePath("/fuel");
  revalidatePath("/");
  return { ok: true as const };
}

/** One-tap repeat: copies the averaged values, no photo, no model call. */
export async function quickLog(normKey: string) {
  await guard();

  const src = db
    .select()
    .from(foodEntries)
    .where(and(eq(foodEntries.normKey, normKey), sql`${foodEntries.kcal} IS NOT NULL`))
    .orderBy(desc(foodEntries.loggedAt))
    .get();

  if (!src) return { ok: false as const, error: "Nothing to repeat." };

  const now = new Date();
  db.insert(foodEntries)
    .values({
      loggedAt: Math.floor(now.getTime() / 1000),
      date: todayISO(),
      description: src.description,
      normKey: src.normKey,
      kcal: src.kcal,
      proteinG: src.proteinG,
      carbsG: src.carbsG,
      fatG: src.fatG,
      saturatedFatG: src.saturatedFatG,
      sugarG: src.sugarG,
      fiberG: src.fiberG,
      saltG: src.saltG,
      portion: src.portion,
      mealType: suggestMealType(now),
      source: "quick",
    })
    .run();

  revalidatePath("/fuel");
  revalidatePath("/");
  return { ok: true as const };
}
