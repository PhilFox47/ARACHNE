"use server";

import { revalidatePath } from "next/cache";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { waterLogs } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { todayISO } from "@/lib/dates";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

function refresh() {
  revalidatePath("/fuel");
  revalidatePath("/");
}

export async function addWater(ml: number, date?: string) {
  await guard();
  if (!Number.isFinite(ml) || ml <= 0 || ml > 3000) {
    return { ok: false as const, error: "That's not a plausible amount." };
  }
  db.insert(waterLogs)
    .values({ date: date ?? todayISO(), ml: Math.round(ml), loggedAt: Math.floor(Date.now() / 1000) })
    .run();
  refresh();
  return { ok: true as const };
}

/** Undo removes the most recent entry rather than subtracting a fixed amount. */
export async function undoWater(date?: string) {
  await guard();
  const d = date ?? todayISO();
  const last = db
    .select()
    .from(waterLogs)
    .where(eq(waterLogs.date, d))
    .orderBy(desc(waterLogs.loggedAt), desc(waterLogs.id))
    .get();
  if (!last) return { ok: true as const, removed: 0 };
  db.delete(waterLogs).where(eq(waterLogs.id, last.id)).run();
  refresh();
  return { ok: true as const, removed: last.ml };
}

export async function waterForDate(date: string): Promise<{ ml: number; entries: number }> {
  const row = db
    .select({
      ml: sql<number>`COALESCE(SUM(${waterLogs.ml}), 0)`,
      entries: sql<number>`COUNT(*)`,
    })
    .from(waterLogs)
    .where(eq(waterLogs.date, date))
    .get();
  return { ml: row?.ml ?? 0, entries: row?.entries ?? 0 };
}
