"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { exerciseLogs, sessions } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { dayKeyOf } from "@/lib/dates";
import { phaseForDay } from "@/lib/plan";
import { daysBetween } from "@/lib/dates";
import { getSettings } from "@/lib/settings";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

function refresh(date: string) {
  revalidatePath("/patrol");
  revalidatePath(`/patrol/${date}`);
  revalidatePath("/");
  revalidatePath("/progress");
  revalidatePath("/journey");
}

/**
 * A session row exists as soon as you log a single set, but `completed` stays
 * false until you check it off. Logging work and declaring the session done are
 * different statements, and only the second one should pay out.
 */
export async function ensureSession(date: string): Promise<number> {
  await guard();
  const existing = db.select().from(sessions).where(eq(sessions.date, date)).get();
  if (existing) return existing.id;

  const day = daysBetween(getSettings().startDate, date);
  const row = db
    .insert(sessions)
    .values({
      date,
      dayKey: dayKeyOf(date),
      phase: phaseForDay(day).id,
      completed: false,
    })
    .returning({ id: sessions.id })
    .get();

  return row.id;
}

export async function setCompleted(date: string, completed: boolean, rpe?: number | null, note?: string | null) {
  await guard();
  const id = await ensureSession(date);

  const patch: Record<string, unknown> = { completed };
  if (rpe !== undefined) patch.rpe = rpe;
  if (note !== undefined) patch.note = note;

  db.update(sessions).set(patch).where(eq(sessions.id, id)).run();
  refresh(date);
  return { ok: true as const, completed };
}

export async function saveSet(input: {
  date: string;
  exerciseKey: string;
  exerciseName: string;
  setIndex: number;
  reps?: number | null;
  weightKg?: number | null;
  seconds?: number | null;
}) {
  await guard();
  const sessionId = await ensureSession(input.date);

  const existing = db
    .select()
    .from(exerciseLogs)
    .where(
      and(
        eq(exerciseLogs.sessionId, sessionId),
        eq(exerciseLogs.exerciseKey, input.exerciseKey),
        eq(exerciseLogs.setIndex, input.setIndex),
      ),
    )
    .get();

  const values = {
    reps: input.reps ?? null,
    weightKg: input.weightKg ?? null,
    seconds: input.seconds ?? null,
  };

  // A set with nothing in it is an un-log, not a zero.
  if (values.reps === null && values.weightKg === null && values.seconds === null) {
    if (existing) db.delete(exerciseLogs).where(eq(exerciseLogs.id, existing.id)).run();
    refresh(input.date);
    return { ok: true as const, cleared: true };
  }

  if (existing) {
    db.update(exerciseLogs).set(values).where(eq(exerciseLogs.id, existing.id)).run();
  } else {
    db.insert(exerciseLogs)
      .values({
        sessionId,
        date: input.date,
        exerciseKey: input.exerciseKey,
        exerciseName: input.exerciseName,
        setIndex: input.setIndex,
        ...values,
      })
      .run();
  }

  refresh(input.date);
  return { ok: true as const, cleared: false };
}

export async function clearSession(date: string) {
  await guard();
  const row = db.select().from(sessions).where(eq(sessions.date, date)).get();
  if (!row) return { ok: true as const };
  db.delete(exerciseLogs).where(eq(exerciseLogs.sessionId, row.id)).run();
  db.delete(sessions).where(eq(sessions.id, row.id)).run();
  refresh(date);
  return { ok: true as const };
}
