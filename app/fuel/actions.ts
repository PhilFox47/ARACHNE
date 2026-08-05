"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { favourites, foodEntries, mealPhotos } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { suggestMealType, QUICK_LOG_THRESHOLD } from "@/lib/plan";
import { saveDataUrl, deleteStored } from "@/lib/photos";
import {
  MAX_INGREDIENTS,
  serialiseIngredients,
  type Ingredient,
  type PhotoKind,
} from "@/lib/meal";

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
  /** Several shots of one meal. Supersedes `photoDataUrl`, which stays for text logs. */
  photos?: { dataUrl: string; kind?: PhotoKind }[];
  mealType?: "meal" | "snack";
  date?: string;
  /** Context the photo can't carry — size, portion eaten, hidden ingredients. */
  userNote?: string | null;
}) {
  await guard();

  const description = input.description.trim() || "Unnamed";
  const date = input.date ?? todayISO();
  const now = new Date();

  // Several shots of one meal: the plate, the packet, the label on its back.
  // The first is the cover; all of them are stored and all of them are read.
  const shots = input.photos ?? (input.photoDataUrl ? [{ dataUrl: input.photoDataUrl }] : []);

  const saved: { path: string; kind: PhotoKind }[] = [];
  for (const shot of shots) {
    const out = saveDataUrl(shot.dataUrl, "meals", date);
    if ("error" in out) {
      // Roll back whatever landed before the bad one, so a rejected third photo
      // does not leave two orphans on the volume with no row pointing at them.
      for (const s of saved) deleteStored(s.path);
      return { ok: false as const, error: out.error };
    }
    saved.push({ path: out.path, kind: shot.kind ?? "dish" });
  }

  const row = db
    .insert(foodEntries)
    .values({
      loggedAt: Math.floor(now.getTime() / 1000),
      date,
      description,
      normKey: normSync(description),
      mealType: input.mealType ?? suggestMealType(now),
      photoPath: saved[0]?.path ?? null,
      userNote: input.userNote?.trim() || null,
      source: saved.length > 0 ? "ai" : "manual",
    })
    .returning({ id: foodEntries.id })
    .get();

  saved.forEach((s, i) =>
    db.insert(mealPhotos).values({ entryId: row.id, path: s.path, kind: s.kind, sort: i }).run(),
  );

  revalidatePath("/fuel");
  revalidatePath("/");
  return { ok: true as const, id: row.id, photoPath: saved[0]?.path ?? null };
}

/** Every photo of an entry, cover first. */
export async function listPhotos(entryId: number) {
  await guard();
  return db
    .select()
    .from(mealPhotos)
    .where(eq(mealPhotos.entryId, entryId))
    .orderBy(asc(mealPhotos.sort), asc(mealPhotos.id))
    .all();
}

/**
 * Adds a photo to an entry that already exists — the label you forgot, the
 * recipe you were cooking from, the second angle.
 */
export async function addPhoto(entryId: number, dataUrl: string, kind: PhotoKind = "dish") {
  await guard();
  const entry = db.select().from(foodEntries).where(eq(foodEntries.id, entryId)).get();
  if (!entry) return { ok: false as const, error: "No such entry." };

  const out = saveDataUrl(dataUrl, "meals", entry.date);
  if ("error" in out) return { ok: false as const, error: out.error };

  const next =
    (db
      .select({ n: sql<number>`COALESCE(MAX(${mealPhotos.sort}), -1)` })
      .from(mealPhotos)
      .where(eq(mealPhotos.entryId, entryId))
      .get()?.n ?? -1) + 1;

  db.insert(mealPhotos).values({ entryId, path: out.path, kind, sort: next }).run();

  // An entry logged as text has no cover. The first photo added becomes one.
  if (!entry.photoPath) {
    db.update(foodEntries).set({ photoPath: out.path }).where(eq(foodEntries.id, entryId)).run();
  }

  revalidatePath("/fuel");
  return { ok: true as const, path: out.path };
}

export async function removePhoto(photoId: number) {
  await guard();
  const photo = db.select().from(mealPhotos).where(eq(mealPhotos.id, photoId)).get();
  if (!photo) return { ok: true as const };

  db.delete(mealPhotos).where(eq(mealPhotos.id, photoId)).run();
  deleteStored(photo.path);

  // Deleting the cover promotes whatever is now first, so the row in the list
  // never ends up pointing at a file that is gone.
  const entry = db.select().from(foodEntries).where(eq(foodEntries.id, photo.entryId)).get();
  if (entry?.photoPath === photo.path) {
    const next = db
      .select()
      .from(mealPhotos)
      .where(eq(mealPhotos.entryId, photo.entryId))
      .orderBy(asc(mealPhotos.sort), asc(mealPhotos.id))
      .get();
    db.update(foodEntries)
      .set({ photoPath: next?.path ?? null })
      .where(eq(foodEntries.id, photo.entryId))
      .run();
  }

  revalidatePath("/fuel");
  return { ok: true as const };
}

/**
 * Replaces the suspected ingredients with your own list.
 *
 * Marked as yours, which changes what a re-analysis does with it: the model is
 * told to estimate for exactly this list rather than to have another guess at
 * what is on the plate.
 */
export async function setIngredients(entryId: number, list: Ingredient[]) {
  await guard();
  const clean = list
    .map((i) => ({ name: i.name.trim().slice(0, 80), amount: i.amount?.trim().slice(0, 40) || null }))
    .filter((i) => i.name.length > 0)
    .slice(0, MAX_INGREDIENTS);

  db.update(foodEntries)
    .set({
      ingredients: serialiseIngredients(clean),
      ingredientsSource: clean.length > 0 ? "user" : null,
      edited: true,
    })
    .where(eq(foodEntries.id, entryId))
    .run();

  revalidatePath("/fuel");
  return { ok: true as const };
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

  // Every photo, not just the cover — otherwise the extra angles stay on the
  // volume forever with nothing pointing at them.
  const shots = db.select().from(mealPhotos).where(eq(mealPhotos.entryId, id)).all();
  for (const s of shots) deleteStored(s.path);
  if (row?.photoPath && !shots.some((s) => s.path === row.photoPath)) deleteStored(row.photoPath);
  db.delete(mealPhotos).where(eq(mealPhotos.entryId, id)).run();

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
 * its own and stays there.
 *
 * "Most used" is counted from the entries themselves rather than read off the
 * stored `uses` column. That column only ever goes up: it is incremented on
 * every quick-log and nothing decrements it, so a favourite tapped nine times
 * during an evening of testing and then deleted nine times still sorted to the
 * front of the row afterwards, permanently. It is also blind in the other
 * direction — starring something you have eaten fifty times begins at zero.
 *
 * Counting the rows is the same answer without either failure, and it costs one
 * grouped query on a table this app will never have a large number of rows in.
 */
export async function listFavourites() {
  await guard();

  const counts = new Map(
    db
      .select({ normKey: foodEntries.normKey, n: sql<number>`COUNT(*)` })
      .from(foodEntries)
      .groupBy(foodEntries.normKey)
      .all()
      .map((r) => [r.normKey, r.n] as const),
  );

  return db
    .select()
    .from(favourites)
    .all()
    .map((f) => ({ ...f, uses: counts.get(f.normKey) ?? 0 }))
    .sort((a, b) => b.uses - a.uses || b.createdAt - a.createdAt);
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

  // `uses` is no longer what orders the row — `listFavourites` counts the
  // entries — but `lastUsedAt` is still worth having, and keeping the column
  // moving costs nothing.
  db.update(favourites)
    .set({ uses: fav.uses + 1, lastUsedAt: now })
    .where(eq(favourites.id, id))
    .run();

  revalidatePath("/fuel");
  revalidatePath("/");
  return { ok: true as const };
}

/** One-tap repeat: copies the averaged values, no photo, no model call. */
export async function quickLog(normKey: string, date?: string) {
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
      date: date ?? todayISO(),
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
