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
  const result = await analyseMeal(dataUrl, hint ?? entry.description);

  if (result.error) {
    return NextResponse.json({ ok: true, analysed: false, error: result.error, model: result.model });
  }

  // The correction factor scales energy and the macros that carry it. Fibre and
  // salt are not under-reported by the same mechanism — the factor exists to
  // compensate for unseen oil, butter and sugar — so they pass through.
  const factor = 1 + getSettings().photoCorrectionPct / 100;
  const scale = (v: number | null) => (v === null ? null : Math.round(v * factor * 10) / 10);

  db.update(foodEntries)
    .set({
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
