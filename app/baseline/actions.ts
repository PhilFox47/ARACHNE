"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { measurements, trials, weights } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { navyBodyFat } from "@/lib/plan";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

function refresh() {
  for (const p of ["/", "/baseline", "/vitals", "/journey", "/progress"]) revalidatePath(p);
}

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) && x > 0 ? x : null;
};

/** Day 1 of the document: weight, waist, neck, chest, thigh, flexed upper arm. */
export async function saveBaselineMeasurements(input: {
  weightKg?: number | null;
  waistCm?: number | null;
  neckCm?: number | null;
  chestCm?: number | null;
  thighCm?: number | null;
  upperArmCm?: number | null;
}) {
  await guard();
  const date = todayISO();
  const s = getSettings();

  const waist = n(input.waistCm);
  const neck = n(input.neckCm);
  const weight = n(input.weightKg);

  // Stored, not derived — a later height change must not rewrite this reading.
  const bodyfat = waist !== null && neck !== null ? navyBodyFat(waist, neck, s.heightCm) : null;

  const existing = db.select().from(measurements).where(eq(measurements.date, date)).get();
  const values = {
    date,
    weightKg: weight,
    waistCm: waist,
    neckCm: neck,
    chestCm: n(input.chestCm),
    thighCm: n(input.thighCm),
    upperArmCm: n(input.upperArmCm),
    bodyfatPct: bodyfat,
  };

  if (existing) db.update(measurements).set(values).where(eq(measurements.id, existing.id)).run();
  else db.insert(measurements).values(values).run();

  // A baseline weight is also a weight reading; not writing it here would leave
  // the corridor with a hole on day 1.
  if (weight !== null) {
    db.insert(weights)
      .values({ date, weightKg: Math.round(weight * 10) / 10 })
      .onConflictDoUpdate({ target: weights.date, set: { weightKg: Math.round(weight * 10) / 10 } })
      .run();
  }

  refresh();
  return { ok: true as const, bodyfatPct: bodyfat };
}

/**
 * Day 2 of the document: push-ups, plank, dead hang, deep squat hold,
 * sit-and-reach, 12-minute walk.
 *
 * Stored as month index 0 so it sits before trial 1 in the history and is never
 * mistaken for a checkpoint. No ARACHNE Score — this test is not the six-station
 * TRIAL and scoring it against month-12 targets would be meaningless.
 */
export async function saveBaselineTest(input: {
  pushupsReps?: number | null;
  plankSec?: number | null;
  deadhangSec?: number | null;
  squatHoldSec?: number | null;
  sitReachCm?: number | null;
  walkTest12MinM?: number | null;
  notes?: string | null;
}) {
  await guard();
  const date = todayISO();

  const values = {
    date,
    monthIndex: 0,
    isCheckpoint: false,
    pushupsReps: n(input.pushupsReps),
    plankSec: n(input.plankSec),
    deadhangSec: n(input.deadhangSec),
    squatHoldSec: n(input.squatHoldSec),
    sitReachCm: typeof input.sitReachCm === "number" ? input.sitReachCm : n(input.sitReachCm),
    walkTest12MinM: n(input.walkTest12MinM),
    notes: input.notes?.trim() || null,
    score: null,
    stationScores: null,
  };

  const existing = db
    .select()
    .from(trials)
    .where(and(eq(trials.monthIndex, 0)))
    .get();

  if (existing) db.update(trials).set(values).where(eq(trials.id, existing.id)).run();
  else db.insert(trials).values(values).run();

  refresh();
  return { ok: true as const };
}

export async function loadBaseline() {
  await guard();
  const test = db.select().from(trials).where(eq(trials.monthIndex, 0)).get() ?? null;
  const meas =
    db.select().from(measurements).orderBy(measurements.date).all().at(0) ?? null;
  return { test, meas };
}
