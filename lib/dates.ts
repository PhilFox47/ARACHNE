import type { DayKey } from "./plan";

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Local-time ISO date. `toISOString()` would silently shift late-evening entries. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * When one day becomes the next. Not midnight.
 *
 * A day that rolls over while you are still awake takes the evening with it.
 * The glass of water at 00:30 lands on a day that has not begun; the chores you
 * are about to tick are already missed and have earned tomorrow a malus; the
 * meal you log after a late night starts a new day's calorie budget from
 * scratch and leaves last night's looking abstemious. None of that is what
 * happened — you simply had not gone to bed yet.
 *
 * Four in the morning is late enough to cover any ordinary late night and early
 * enough that nobody is confused by it: on the very rare morning you are up
 * before four, the app is still on yesterday, which is where you are too.
 *
 * Only the *logical* day moves. Timestamps stay real, and anything that reads a
 * wall clock for its own reasons — the meal-versus-snack guess, the 08:00
 * briefing, the hour-of-day chart in FUEL — keeps reading the wall clock, since
 * 01:00 is one in the morning whichever day it belongs to.
 */
export const DAY_START_HOUR = 4;

/**
 * The day a moment belongs to.
 *
 * The one place a clock becomes a date. Everything that asks "what day is it"
 * goes through here, so the boundary is a single constant rather than a rule
 * every caller has to remember.
 */
export function dayOf(at: Date): string {
  const shifted = new Date(at);
  shifted.setHours(shifted.getHours() - DAY_START_HOUR);
  return toISODate(shifted);
}

export function todayISO(): string {
  return dayOf(new Date());
}

/**
 * Past midnight, before the day has turned over.
 *
 * The one window where the app's date and the calendar's disagree, and so the
 * one window where it has to say so — otherwise a FUEL screen still totalling
 * yesterday at 01:00 reads as a bug rather than as the point.
 */
export function inSmallHours(at = new Date()): boolean {
  return at.getHours() < DAY_START_HOUR;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  const a = parseISODate(fromISO).getTime();
  const b = parseISODate(toISOStr).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function dayKeyOf(iso: string): DayKey {
  return DAY_KEYS[parseISODate(iso).getDay()];
}

/** The Monday on or before a date. */
export function mondayOf(iso: string): string {
  const dow = parseISODate(iso).getDay();
  return addDays(iso, -(dow === 0 ? 6 : dow - 1));
}

/**
 * 0-based week index, counted in calendar weeks from the Monday of the week you
 * started in.
 *
 * Rolling seven-day blocks from the start date would be tidier arithmetic and
 * are wrong for a human: start on a Tuesday and every screen shows you a week
 * that runs Tuesday to Monday, which no one reads as a week. Week 0 is instead
 * the calendar week your day 0 falls in, so a Tuesday start simply has a short
 * first week with the Monday before it marked as not-yet-started.
 */
export function weekIndex(startISO: string, iso: string): number {
  return Math.floor(daysBetween(mondayOf(startISO), iso) / 7);
}

/** The Monday that opens a given week of the run. */
export function weekStartDate(startISO: string, week: number): string {
  return addDays(mondayOf(startISO), week * 7);
}

export function formatShort(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
