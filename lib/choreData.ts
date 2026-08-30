import { and, asc, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { choreLog, chores } from "./db/schema";
import { SEED_CHORES, type ChoreLogRow, type ChoreRow } from "./chores";
import { todayISO } from "./dates";

/**
 * The database side of MAINTENANCE. Kept out of the actions file because a
 * "use server" module may only export async functions, and these are plain
 * reads that pages want to call directly.
 */

/**
 * The starting six, written once.
 *
 * Keyed off the table being empty rather than a settings flag, so clearing the
 * list does bring them back. That is the behaviour you want the one time you
 * empty it by accident, and harmless otherwise — an empty MAINTENANCE screen is
 * not a state anybody chooses on purpose.
 */
export function seedChores(): void {
  const n = db.select({ n: sql<number>`COUNT(*)` }).from(chores).get()?.n ?? 0;
  if (n > 0) return;
  const today = todayISO();
  SEED_CHORES.forEach((c, i) => {
    db.insert(chores)
      .values({ name: c.name, cadence: c.cadence, sort: i, createdOn: today, archivedOn: null })
      .run();
  });
}

const COLUMNS = {
  id: chores.id,
  name: chores.name,
  cadence: chores.cadence,
  sort: chores.sort,
  createdOn: chores.createdOn,
  archivedOn: chores.archivedOn,
};

/** Live chores, in display order. */
export function liveChores(): ChoreRow[] {
  return allChores().filter((c) => c.archivedOn === null);
}

/** Every chore including retired ones — the malus has to see those too. */
export function allChores(): ChoreRow[] {
  return db.select(COLUMNS).from(chores).orderBy(asc(chores.sort), asc(chores.id)).all();
}

/** Completions in a window, which is all the standings and the malus need. */
export function choreLogBetween(from: string, to: string): ChoreLogRow[] {
  return db
    .select({ choreId: choreLog.choreId, date: choreLog.date })
    .from(choreLog)
    .where(and(gte(choreLog.date, from), lte(choreLog.date, to)))
    .all();
}
