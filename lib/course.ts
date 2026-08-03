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
  phaseForDayIn,
  phasesFor,
  taperFor,
  type Checkpoint,
  type CourseConfig,
  type Phase,
} from "./plan";
import { getSettings } from "./settings";

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
