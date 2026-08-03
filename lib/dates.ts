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

/** 0-based week index since the start date — drives LOW PROFILE WEEK detection. */
export function weekIndex(startISO: string, iso: string): number {
  return Math.floor(daysBetween(startISO, iso) / 7);
}

export function formatShort(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
