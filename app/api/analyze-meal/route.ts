import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodEntries } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { analyseMeal } from "@/lib/vision";
import { getSettings } from "@/lib/settings";
import { readStored } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The only path to the Nano-GPT key.
 *
 * Analyses an already-saved entry and patches it in place. It never returns a
 * status that would make the client discard the entry: a failed analysis is a
 * 200 with `analysed: false`, and the row keeps its description with null
 * macros. An entry without numbers beats no entry.
 */
export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  let entryId: number;
  let hint: string | undefined;
  try {
    const body = await req.json();
    entryId = Number(body?.entryId);
    hint = typeof body?.hint === "string" ? body.hint : undefined;
    if (!Number.isInteger(entryId)) throw new Error("bad id");
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const entry = db.select().from(foodEntries).where(eq(foodEntries.id, entryId)).get();
  if (!entry) return NextResponse.json({ ok: false, error: "No such entry." }, { status: 404 });
  if (!entry.photoPath) {
    return NextResponse.json({ ok: true, analysed: false, error: "Entry has no photo." });
  }

  const stored = readStored(entry.photoPath);
  if (!stored) {
    return NextResponse.json({ ok: true, analysed: false, error: "Photo missing from the volume." });
  }

  const dataUrl = `data:${stored.type};base64,${stored.buf.toString("base64")}`;

  // Only ever pass something the user actually wrote. Falling back to
  // `description` fed the placeholder straight into the prompt — the model was
  // being told the meal was called "Analysing…".
  const note = (hint ?? entry.userNote ?? "").trim();

  // Persist the note before calling out. The entry was created the instant the
  // photo was taken, which is before this text existed — and if the model then
  // fails, the context the user typed must still survive for the retry.
  if (note.length > 0 && note !== entry.userNote) {
    db.update(foodEntries).set({ userNote: note }).where(eq(foodEntries.id, entryId)).run();
  }

  const result = await analyseMeal(dataUrl, note.length > 0 ? note : undefined);

  if (result.error) {
    // Surface the note as the description so a failed entry reads as what you
    // ate rather than "Analysing…" forever.
    if (note.length > 0 && entry.description === "Analysing…") {
      db.update(foodEntries).set({ description: note }).where(eq(foodEntries.id, entryId)).run();
    }
    return NextResponse.json({ ok: true, analysed: false, error: result.error, model: result.model });
  }

  // The correction factor scales energy and the macros that carry it. Fibre and
  // salt are not under-reported by the same mechanism — the factor exists to
  // compensate for unseen oil, butter and sugar — so they pass through.
  const factor = 1 + getSettings().photoCorrectionPct / 100;
  const scale = (v: number | null) => (v === null ? null : Math.round(v * factor * 10) / 10);

  db.update(foodEntries)
    .set({
      description: result.description?.trim() || entry.userNote || entry.description,
      portion: result.portion,
      kcal: scale(result.kcal),
      proteinG: scale(result.proteinG),
      carbsG: scale(result.carbsG),
      fatG: scale(result.fatG),
      saturatedFatG: scale(result.saturatedFatG),
      sugarG: scale(result.sugarG),
      fiberG: result.fiberG,
      saltG: result.saltG,
      mealType: result.mealType ?? entry.mealType,
      aiConfidence: result.confidence,
    })
    .where(eq(foodEntries.id, entryId))
    .run();

  return NextResponse.json({
    ok: true,
    analysed: true,
    model: result.model,
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
      mealType: result.mealType ?? entry.mealType,
      confidence: result.confidence,
    },
  });
}
