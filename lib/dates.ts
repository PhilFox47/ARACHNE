import type { DayKey } from "./plan";

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Local-time ISO date. `toISOString()` would silently shift late-evening entries. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
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
