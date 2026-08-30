import { addDays, mondayOf } from "./dates";

/**
 * MAINTENANCE — the chores half of a healthy week, and the XP malus for
 * neglecting it.
 *
 * Everything in this file is pure. The rows come in, the standings and the
 * malus come out, and nothing here touches the database — which is what lets
 * `computeGameState` stay a pure function of its input while still knowing that
 * you did not brush your teeth on Tuesday.
 *
 * The rule, as asked for: a daily chore missed yesterday costs 10% of today's
 * earnings; a weekly chore missed last week costs 20% of every day of this one.
 * They add, and the total is capped.
 */

export type Cadence = "daily" | "weekly";

export interface ChoreRow {
  id: number;
  name: string;
  cadence: Cadence;
  sort: number;
  /** The day it started counting. Nothing before this is ever a miss. */
  createdOn: string;
  /** The day it stopped counting, or null while it is still live. */
  archivedOn: string | null;
}

export interface ChoreLogRow {
  choreId: number;
  date: string;
}

// ─────────────────────────────────────────────────────────────
// The rule
// ─────────────────────────────────────────────────────────────

/** Cost of one daily chore missed yesterday. */
export const DAILY_MALUS = 0.1;
/** Cost of one weekly chore missed last week. Fewer of them, so they cost more. */
export const WEEKLY_MALUS = 0.2;

/**
 * The most today's earnings can be cut, however bad yesterday was.
 *
 * Two reasons, and both matter more than the arithmetic. Without a cap every
 * chore you add raises the maximum punishment, so tracking more of your life
 * makes the app harsher — exactly backwards. And an uncapped malus is a death
 * spiral: the day you are least likely to engage is the day engaging is worth
 * least. Half is enough to be felt and not enough to make the day pointless.
 */
export const MALUS_CAP = 0.5;

// ─────────────────────────────────────────────────────────────
// Existence
// ─────────────────────────────────────────────────────────────

/** Whether a chore was live on a given day. */
export function liveOn(c: ChoreRow, date: string): boolean {
  if (date < c.createdOn) return false;
  return c.archivedOn === null || date < c.archivedOn;
}

/**
 * Whether a weekly chore counts for the week beginning on `monday`.
 *
 * It has to have existed at the *start* of the week, not merely during it —
 * otherwise adding a weekly chore on a Sunday makes that week an instant miss
 * for something you had no chance to do.
 */
export function liveForWeek(c: ChoreRow, monday: string): boolean {
  if (monday < c.createdOn) return false;
  return c.archivedOn === null || c.archivedOn > monday;
}

// ─────────────────────────────────────────────────────────────
// Standings
// ─────────────────────────────────────────────────────────────

export interface ChoreStanding {
  chore: ChoreRow;
  done: boolean;
  /** For a weekly chore, the day it was ticked. */
  doneOn: string | null;
}

/** Everything due on a date, daily and weekly, with what is already done. */
export function standingsFor(
  date: string,
  chores: ChoreRow[],
  log: ChoreLogRow[],
): { daily: ChoreStanding[]; weekly: ChoreStanding[] } {
  const monday = mondayOf(date);
  const sunday = addDays(monday, 6);

  const doneOnDate = new Set(log.filter((l) => l.date === date).map((l) => l.choreId));
  const weekLog = new Map<number, string>();
  for (const l of log) {
    if (l.date < monday || l.date > sunday) continue;
    const prev = weekLog.get(l.choreId);
    if (prev === undefined || l.date < prev) weekLog.set(l.choreId, l.date);
  }

  const bySort = (a: ChoreStanding, b: ChoreStanding) =>
    a.chore.sort - b.chore.sort || a.chore.id - b.chore.id;

  return {
    daily: chores
      .filter((c) => c.cadence === "daily" && liveOn(c, date))
      .map((c) => ({ chore: c, done: doneOnDate.has(c.id), doneOn: doneOnDate.has(c.id) ? date : null }))
      .sort(bySort),
    // Shown if it exists *today*, not if it existed on Monday — a deliberately
    // looser test than the malus uses. Add a weekly chore on Wednesday and you
    // can still do the laundry this week; you simply cannot be penalised for
    // the week you added it in. Requiring it to have existed at the week's
    // start for both would leave the weekly list empty for up to six days after
    // you first open the screen, which reads as the feature being broken.
    weekly: chores
      .filter((c) => c.cadence === "weekly" && liveOn(c, date))
      .map((c) => ({ chore: c, done: weekLog.has(c.id), doneOn: weekLog.get(c.id) ?? null }))
      .sort(bySort),
  };
}

// ─────────────────────────────────────────────────────────────
// The malus
// ─────────────────────────────────────────────────────────────

export interface Malus {
  /** 0 to MALUS_CAP. Multiply the day's gross earnings by (1 - this). */
  fraction: number;
  /** What it would have been without the cap, for saying so honestly. */
  uncapped: number;
  missedDaily: string[];
  missedWeekly: string[];
  capped: boolean;
  /**
   * How many chores were actually due in the window judged.
   *
   * Zero and a clean sheet are both "no malus" and they are not the same thing
   * to read. On the first morning nothing was due yesterday, and a panel that
   * says "every daily chore was done yesterday" is congratulating you for a day
   * that had no chores in it.
   */
  dailyDue: number;
  weeklyDue: number;
}

export const NO_MALUS: Malus = {
  fraction: 0,
  uncapped: 0,
  missedDaily: [],
  missedWeekly: [],
  capped: false,
  dailyDue: 0,
  weeklyDue: 0,
};

/**
 * What today's earnings are cut by, and why.
 *
 * Reads yesterday for the daily chores and last week for the weekly ones — so
 * clearing the board today lifts the penalty tomorrow, which is the whole point
 * of it being a nudge rather than a debt.
 */
export function malusFor(date: string, chores: ChoreRow[], log: ChoreLogRow[]): Malus {
  const yesterday = addDays(date, -1);
  const lastMonday = addDays(mondayOf(date), -7);
  const lastSunday = addDays(lastMonday, 6);

  const doneYesterday = new Set(log.filter((l) => l.date === yesterday).map((l) => l.choreId));
  const doneLastWeek = new Set(
    log.filter((l) => l.date >= lastMonday && l.date <= lastSunday).map((l) => l.choreId),
  );

  const dueDaily = chores.filter((c) => c.cadence === "daily" && liveOn(c, yesterday));
  const dueWeekly = chores.filter((c) => c.cadence === "weekly" && liveForWeek(c, lastMonday));

  const missedDaily = dueDaily.filter((c) => !doneYesterday.has(c.id)).map((c) => c.name);
  const missedWeekly = dueWeekly.filter((c) => !doneLastWeek.has(c.id)).map((c) => c.name);

  const uncapped = missedDaily.length * DAILY_MALUS + missedWeekly.length * WEEKLY_MALUS;
  const fraction = Math.min(MALUS_CAP, uncapped);

  return {
    fraction,
    uncapped,
    missedDaily,
    missedWeekly,
    capped: uncapped > MALUS_CAP,
    dailyDue: dueDaily.length,
    weeklyDue: dueWeekly.length,
  };
}

/** A short phrase for the malus, or null when there is none. */
export function malusLabel(m: Malus): string | null {
  if (m.fraction <= 0) return null;
  const bits: string[] = [];
  if (m.missedDaily.length > 0) {
    bits.push(`${m.missedDaily.length} daily`);
  }
  if (m.missedWeekly.length > 0) {
    bits.push(`${m.missedWeekly.length} weekly`);
  }
  return `−${Math.round(m.fraction * 100)}% XP · ${bits.join(", ")} missed`;
}

// ─────────────────────────────────────────────────────────────
// The starting list
// ─────────────────────────────────────────────────────────────

/**
 * What MAINTENANCE is seeded with on first use.
 *
 * A starting point, not a fixture — every one of these can be renamed, reordered
 * or retired in the app, and new ones added. It exists so the screen is not
 * empty the first time it is opened, which is the difference between a feature
 * that gets used and one that gets ignored.
 */
export const SEED_CHORES: { name: string; cadence: Cadence }[] = [
  { name: "Brush teeth — morning", cadence: "daily" },
  { name: "Brush teeth — evening", cadence: "daily" },
  { name: "Change clothes", cadence: "daily" },
  { name: "Clean up desk", cadence: "daily" },
  { name: "Laundry", cadence: "weekly" },
  { name: "Vacuum", cadence: "weekly" },
];
