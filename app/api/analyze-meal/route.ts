import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { normKeyOf } from "@/lib/meal";
import { foodEntries, mealPhotos } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import {
  analyseMeal,
  readIngredients,
  serialiseIngredients,
  type PhotoInput,
  type PhotoKind,
} from "@/lib/vision";
import { getSettings } from "@/lib/settings";
import { readStored } from "@/lib/photos";
import { ANALYSING_PLACEHOLDER } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** Every screen that renders a food entry. */
function refresh() {
  revalidatePath("/fuel");
  revalidatePath("/fuel/stats");
  revalidatePath("/");
}

/**
 * Reading several images costs tokens and latency, and past about this many the
 * extra angle stops adding information. The cap is on the prompt, not on what
 * you can attach — a meal may keep as many photos as you like.
 */
const MAX_IMAGES = 5;

/** Every photo of an entry, cover first, as data URLs the model can read. */
function photosFor(entryId: number, coverPath: string | null): PhotoInput[] {
  const rows = db
    .select()
    .from(mealPhotos)
    .where(eq(mealPhotos.entryId, entryId))
    .orderBy(asc(mealPhotos.sort), asc(mealPhotos.id))
    .all();

  // An entry written before v13 has a cover and no rows. Falling back to it
  // keeps every old entry re-analysable.
  const list =
    rows.length > 0
      ? rows.map((r) => ({ path: r.path, kind: r.kind as PhotoKind }))
      : coverPath
        ? [{ path: coverPath, kind: "dish" as PhotoKind }]
        : [];

  const out: PhotoInput[] = [];
  for (const p of list.slice(0, MAX_IMAGES)) {
    const stored = readStored(p.path);
    if (!stored) continue;
    out.push({ dataUrl: `data:${stored.type};base64,${stored.buf.toString("base64")}`, kind: p.kind });
  }
  return out;
}

/**
 * The only path to the Nano-GPT key.
 *
 * Analyses an already-saved entry and patches it in place. It never returns a
 * status that would make the client discard the entry: a failed analysis is a
 * 200 with `analysed: false`, and the row keeps its description with null
 * macros. An entry without numbers beats no entry.
 *
 * `reanalyse: true` re-runs from the entry's corrected name, portion and
 * ingredients — and pointedly not from its numbers. See `AnalyseOptions`.
 */
export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  let entryId: number;
  let hint: string | undefined;
  let reanalyse = false;
  try {
    const body = await req.json();
    entryId = Number(body?.entryId);
    hint = typeof body?.hint === "string" ? body.hint : undefined;
    reanalyse = body?.reanalyse === true;
    if (!Number.isInteger(entryId)) throw new Error("bad id");
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const entry = db.select().from(foodEntries).where(eq(foodEntries.id, entryId)).get();
  if (!entry) return NextResponse.json({ ok: false, error: "No such entry." }, { status: 404 });

  const photos = photosFor(entryId, entry.photoPath);

  // Only ever pass something the user actually wrote. Falling back to
  // `description` fed the placeholder straight into the prompt — the model was
  // being told the meal was called "Analysing…".
  const note = (hint ?? entry.userNote ?? "").trim();

  /**
   * A meal you forgot to photograph is estimated from what you typed.
   *
   * The typed description is the evidence in that case, so it becomes the hint
   * — the same slot a photo entry uses for "what the photo misses", because it
   * plays the same role: the words the model is to treat as given. The
   * placeholder is never passed; "Analysing…" is a status, not a food.
   */
  const typed = entry.description === ANALYSING_PLACEHOLDER ? "" : entry.description.trim();
  const evidence = photos.length === 0 ? [note, typed].filter(Boolean).join(" — ") : note;

  if (photos.length === 0 && evidence.length === 0) {
    return NextResponse.json({
      ok: true,
      analysed: false,
      error: "Nothing to go on — no photo and no description.",
    });
  }

  // Persist the note before calling out. The entry was created the instant the
  // photo was taken, which is before this text existed — and if the model then
  // fails, the context the user typed must still survive for the retry.
  if (note.length > 0 && note !== entry.userNote) {
    db.update(foodEntries).set({ userNote: note }).where(eq(foodEntries.id, entryId)).run();
  }

  const result = await analyseMeal(photos, {
    hint: evidence.length > 0 ? evidence : undefined,
    correction: reanalyse
      ? {
          description:
            entry.description === ANALYSING_PLACEHOLDER ? null : entry.description,
          portion: entry.portion,
          ingredients: readIngredients(entry.ingredients),
          ingredientsConfirmed: entry.ingredientsSource === "user",
          hadNumbers: entry.kcal !== null,
        }
      : undefined,
  });

  if (result.error) {
    // "Analysing…" is a status, and leaving it in the description turns a failed
    // call into a row that reads as permanently in progress. The note is the
    // best name available; without one, anything honest beats the placeholder —
    // the row still carries its photo and its retry button.
    if (entry.description === ANALYSING_PLACEHOLDER) {
      const fallback = note.length > 0 ? note : "Unnamed meal";
      db.update(foodEntries)
        .set({ description: fallback, normKey: normKeyOf(fallback) })
        .where(eq(foodEntries.id, entryId))
        .run();
      refresh();
    }
    return NextResponse.json({ ok: true, analysed: false, error: result.error, model: result.model });
  }

  // The correction factor scales energy and the macros that carry it. Fibre and
  // salt are not under-reported by the same mechanism — the factor exists to
  // compensate for unseen oil, butter and sugar — so they pass through.
  const factor = 1 + getSettings().photoCorrectionPct / 100;
  const scale = (v: number | null) => (v === null ? null : Math.round(v * factor * 10) / 10);

  const mealType = result.mealType ?? entry.mealType;

  /**
   * A confirmed list survives the re-analysis that was run because of it.
   *
   * The whole point of correcting the ingredients is that the model had them
   * wrong; letting its fresh guess overwrite your correction would make the
   * button undo itself. Amounts still come back from the model, because those
   * it can genuinely improve once the names are right.
   */
  const keepUserList = entry.ingredientsSource === "user" && readIngredients(entry.ingredients).length > 0;
  const ingredients =
    mealType === "snack"
      ? null
      : keepUserList
        ? entry.ingredients
        : serialiseIngredients(result.ingredients);

  const named = result.description?.trim() || entry.userNote || entry.description;

  db.update(foodEntries)
    .set({
      description: named,
      // Never one without the other.
      normKey: normKeyOf(named),
      portion: result.portion,
      kcal: scale(result.kcal),
      proteinG: scale(result.proteinG),
      carbsG: scale(result.carbsG),
      fatG: scale(result.fatG),
      saturatedFatG: scale(result.saturatedFatG),
      sugarG: scale(result.sugarG),
      fiberG: result.fiberG,
      saltG: result.saltG,
      ingredients,
      ingredientsSource: ingredients === null ? null : keepUserList ? "user" : "ai",
      mealType,
      aiConfidence: result.confidence,
    })
    .where(eq(foodEntries.id, entryId))
    .run();

  // A route handler mutating data the pages render has to say so, or the
  // client's refresh can be answered from a cached render of the old row.
  refresh();

  return NextResponse.json({
    ok: true,
    analysed: true,
    model: result.model,
    images: photos.length,
    correctionPct: getSettings().photoCorrectionPct,
    entry: {
      description: result.description?.trim() || entry.description,
      portion: result.portion,
      kcal: scale(result.kcal),
      proteinG: scale(result.proteinG),
      carbsG: scale(result.carbsG),
      fatG: scale(result.fatG),
      saturatedFatG: scale(result.saturatedFatG),
      sugarG: scale(result.sugarG),
      fiberG: result.fiberG,
      saltG: result.saltG,
      mealType,
      confidence: result.confidence,
    },
  });
}
