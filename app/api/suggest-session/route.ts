import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { daysBetween, dayKeyOf, weekIndex } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { isLowProfileWeek, type DayKey } from "@/lib/plan";
import { phaseForDay } from "@/lib/course";
import {
  baselinePrescription,
  generatePrescription,
  isPreview,
  storePrescription,
  storedPrescription,
} from "@/lib/training";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Issues the prescription for a date. Cached after the first call so the
 * numbers don't move under you mid-session; `regenerate` forces a fresh one.
 *
 * Always returns a usable prescription. If the model is unreachable, slow or
 * nonsense, this falls back to the plan's own numbers with your last logged
 * performance applied — never an error, never an empty session.
 */
export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  let date: string;
  let regenerate = false;
  try {
    const body = await req.json();
    date = String(body?.date ?? "");
    regenerate = body?.regenerate === true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("bad date");
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  if (!regenerate) {
    const cached = storedPrescription(date);
    if (cached) return NextResponse.json({ ok: true, cached: true, prescription: cached });
  }

  const settings = getSettings();
  const day = daysBetween(settings.startDate, date);
  const dk = dayKeyOf(date) as DayKey;
  const phase = phaseForDay(day);
  const wk = weekIndex(settings.startDate, date);

  const base = baselinePrescription(phase.id, dk, wk, date);
  if (base.exercises.length === 0) {
    return NextResponse.json({ ok: true, cached: false, prescription: base });
  }

  // A day that has not arrived is a preview: the plan's own numbers against
  // where you stand today, worked out again every time you look. No model call
  // — there is nothing to adapt to yet that will still be true on the day — and
  // nothing written down. `storePrescription` refuses future dates anyway; the
  // early return is here so browsing next month does not spend an API call per
  // session either.
  if (isPreview(date)) {
    return NextResponse.json({ ok: true, cached: false, preview: true, prescription: base });
  }

  const prescription = await generatePrescription(base, isLowProfileWeek(wk));
  storePrescription(prescription);

  return NextResponse.json({ ok: true, cached: false, prescription });
}
