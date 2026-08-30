"use server";

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { choreLog, chores } from "@/lib/db/schema";
import { addDays, mondayOf, todayISO } from "@/lib/dates";
import { liveChores } from "@/lib/choreData";
import { type Cadence } from "@/lib/chores";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}




/**
 * Tick or untick a chore.
 *
 * A weekly chore is stored against the day it was actually ticked, and unticking
 * clears whichever day this week holds it — so "done on Tuesday, undone on
 * Friday" works without the caller having to know which row to remove.
 */
export async function toggleChore(
  id: number,
  date: string,
  done: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await guard();

  const chore = db.select().from(chores).where(eq(chores.id, id)).get();
  if (!chore) return { ok: false, error: "That chore no longer exists." };
  // Never in the future: there is no such thing as having already done tomorrow.
  if (date > todayISO()) return { ok: false, error: "That day has not happened yet." };

  if (chore.cadence === "weekly") {
    const monday = mondayOf(date);
    const sunday = addDays(monday, 6);
    db.delete(choreLog)
      .where(and(eq(choreLog.choreId, id), gte(choreLog.date, monday), lte(choreLog.date, sunday)))
      .run();
  } else {
    db.delete(choreLog).where(and(eq(choreLog.choreId, id), eq(choreLog.date, date))).run();
  }

  if (done) {
    db.insert(choreLog)
      .values({ choreId: id, date, doneAt: Math.floor(Date.now() / 1000) })
      .onConflictDoNothing()
      .run();
  }

  revalidatePath("/maintenance");
  revalidatePath("/");
  return { ok: true };
}

export async function addChore(
  name: string,
  cadence: Cadence,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await guard();
  const clean = name.trim().slice(0, 80);
  if (clean.length === 0) return { ok: false, error: "Give it a name." };

  const max = db.select({ m: sql<number>`COALESCE(MAX(sort), -1)` }).from(chores).get()?.m ?? -1;
  db.insert(chores)
    .values({ name: clean, cadence, sort: max + 1, createdOn: todayISO(), archivedOn: null })
    .run();

  revalidatePath("/maintenance");
  revalidatePath("/");
  return { ok: true };
}

export async function renameChore(
  id: number,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await guard();
  const clean = name.trim().slice(0, 80);
  if (clean.length === 0) return { ok: false, error: "Give it a name." };
  db.update(chores).set({ name: clean }).where(eq(chores.id, id)).run();
  revalidatePath("/maintenance");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Retire a chore.
 *
 * Archived, never deleted. The rows it earned stay readable, and — the part
 * that actually matters — it stops counting towards the malus from today
 * rather than being erased from a history it was genuinely part of.
 *
 * Archived from today, so it leaves today's list the moment you retire it —
 * tapping × and watching the chore stay put would read as a broken button.
 *
 * It does not erase a penalty already earned. A chore missed yesterday still
 * costs today even if you retire it this morning, which matters: otherwise
 * retiring a chore would be a way to wipe a malus, and the one thing a penalty
 * must not have is an undo button.
 */
export async function archiveChore(id: number): Promise<{ ok: true }> {
  await guard();
  db.update(chores).set({ archivedOn: todayISO() }).where(eq(chores.id, id)).run();
  revalidatePath("/maintenance");
  revalidatePath("/");
  return { ok: true };
}

export async function reorderChore(id: number, direction: -1 | 1): Promise<{ ok: true }> {
  await guard();
  const all = liveChores();
  const i = all.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= all.length) return { ok: true };
  // Only swap within a cadence — the two lists are shown separately, so moving
  // a daily chore "down" past the weekly ones would look like it vanished.
  if (all[i].cadence !== all[j].cadence) return { ok: true };

  db.update(chores).set({ sort: all[j].sort }).where(eq(chores.id, all[i].id)).run();
  db.update(chores).set({ sort: all[i].sort }).where(eq(chores.id, all[j].id)).run();
  revalidatePath("/maintenance");
  return { ok: true };
}
