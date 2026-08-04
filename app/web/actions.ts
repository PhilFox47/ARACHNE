"use server";

import { revalidatePath } from "next/cache";
import { desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { skillResets } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { LADDER_FAMILIES, type MovementFamily } from "@/lib/movements";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

function refresh() {
  revalidatePath("/web");
  revalidatePath("/patrol");
  revalidatePath("/");
}

/**
 * Draw a line: sets logged before now stop counting toward THE WEB.
 *
 * Nothing is deleted. The logs are the record of what you did on a given day,
 * and that should survive a change of mind about how to read it — an undo is
 * therefore possible, and is `undoReset` below.
 *
 * The cutoff is the current second rather than today's date, so a reset taken
 * mid-session keeps the sets you are about to log. Resetting the whole tree in
 * the morning and then training in the afternoon has to leave the afternoon
 * standing, or the reset would quietly eat the session that was meant to
 * replace it.
 */
export async function resetSkills(family: MovementFamily | null): Promise<void> {
  await guard();
  if (family !== null && !LADDER_FAMILIES.includes(family)) {
    throw new Error(`Unknown strand: ${family}`);
  }

  db.insert(skillResets)
    .values({ family, resetAt: Math.floor(Date.now() / 1000) })
    .run();

  refresh();
}

/**
 * Take the most recent line back off a strand — or off the whole tree.
 *
 * A reset is a judgement about your own placement and judgements get revised,
 * usually within about a minute of making one. Since nothing was destroyed,
 * undoing is just dropping the row.
 */
export async function undoReset(family: MovementFamily | null): Promise<void> {
  await guard();

  const latest = db
    .select()
    .from(skillResets)
    .where(family === null ? isNull(skillResets.family) : eq(skillResets.family, family))
    .orderBy(desc(skillResets.resetAt), desc(skillResets.id))
    .get();

  if (!latest) return;

  db.delete(skillResets).where(eq(skillResets.id, latest.id)).run();
  refresh();
}
