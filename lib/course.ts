/**
 * The plan document, fitted to your own start weight, goal and timeframe.
 *
 * `lib/plan.ts` stays pure: it holds the document's numbers and the pure
 * functions that stretch them onto a `CourseConfig`. This module is the one
 * place that reads settings and binds them, so no screen has to remember to
 * pass a config — and, more usefully, no screen can silently forget to.
 *
 * Everything here reduces to the document's own values when the course is the
 * document's: 100 kg to 80 kg over 365 days.
 */

import {
  DOCUMENT_COURSE,
  checkpointsFor,
  corridorAnchorsFor,
  corridorTargetIn,
  courseRate,
  kcalFloorFor,
  kcalTargetForDayIn,
  normaliseCourse,
  intakeForDayIn,
  isRefuelWeek,
  maintenanceForDayIn,
  phaseForDayIn,
  phasesFor,
  proteinTargetForDayIn,
  taperFor,
  type DailyIntake,
  type DayWeight,
  type Checkpoint,
  type CourseConfig,
  type Phase,
} from "./plan";
import { getSettings } from "./settings";
import { asc } from "drizzle-orm";
import { db } from "./db";
import { weights } from "./db/schema";
import { daysBetween } from "./dates";

export function activeCourse(): CourseConfig {
  const s = getSettings();
  return normaliseCourse({
    startWeightKg: s.startWeightKg,
    targetWeightKg: s.targetWeightKg,
    totalDays: s.totalDays,
  });
}

/** True when nothing has been changed away from the document's own course. */
export function isDocumentCourse(c: CourseConfig = activeCourse()): boolean {
  return (
    c.startWeightKg === DOCUMENT_COURSE.startWeightKg &&
    c.targetWeightKg === DOCUMENT_COURSE.targetWeightKg &&
    c.totalDays === DOCUMENT_COURSE.totalDays
  );
}

export function coursePhases(): Phase[] {
  return phasesFor(activeCourse());
}

export function phaseForDay(day: number): Phase {
  return phaseForDayIn(activeCourse(), day);
}

export function corridorTarget(day: number): number {
  return corridorTargetIn(activeCourse(), day);
}

export function corridorAnchors(): { day: number; kg: number }[] {
  return corridorAnchorsFor(activeCourse());
}

export function kcalTargetForDay(day: number): { kcal: number; taper: boolean } {
  return kcalTargetForDayIn(activeCourse(), day);
}

export function proteinTargetForDay(day: number): number {
  return proteinTargetForDayIn(activeCourse(), day);
}

export function courseCheckpoints(): Checkpoint[] {
  return checkpointsFor(activeCourse());
}

export function courseTotalDays(): number {
  return activeCourse().totalDays;
}

export function courseTaper(): { days: number; kcal: number } {
  return taperFor(activeCourse());
}

export function courseKcalFloor(): number {
  return kcalFloorFor(activeCourse());
}

export function activeRate(): { kgPerWeek: number; tooFast: boolean } {
  return courseRate(activeCourse());
}

/**
 * Every weight reading, expressed as days since the start.
 *
 * Read whole rather than windowed: the table holds one row a day for a year at
 * most, and the adjustment has to be computable for a past day as well as
 * today — which means the caller cannot be handed only the recent tail.
 */
export function weightsByDay(): DayWeight[] {
  const s = getSettings();
  return db
    .select({ date: weights.date, weightKg: weights.weightKg })
    .from(weights)
    .orderBy(asc(weights.date))
    .all()
    .map((w) => ({ day: daysBetween(s.startDate, w.date), kg: w.weightKg }));
}

/**
 * What to eat on a day: the ladder, corrected by what the scale has actually
 * been doing, never below the floor.
 */
export function intakeForDay(day: number, rows?: DayWeight[]): DailyIntake {
  return intakeForDayIn(activeCourse(), day, rows ?? weightsByDay());
}

export function maintenanceForDay(day: number): number {
  return maintenanceForDayIn(activeCourse(), day);
}

export { isRefuelWeek };
