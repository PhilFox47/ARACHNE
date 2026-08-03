"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  abilities,
  exerciseLogs,
  foodEntries,
  measurements,
  photos,
  senseDismissals,
  sessionPlans,
  sessions,
  settings,
  trials,
  weights,
} from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";
import { setEquipment, setSetting, setVrGames } from "@/lib/settings";
import { mergeEquipment, mergeVrGames, type EquipmentItem, type VrGame } from "@/lib/equipment";
import { UPLOAD_DIR } from "@/lib/photos";
import { todayISO } from "@/lib/dates";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

export async function saveEquipment(items: EquipmentItem[]) {
  await guard();
  // Re-merge server-side so a malformed payload can't corrupt the catalogue.
  setEquipment(mergeEquipment(items));

  // Gating changes which movements are prescribed, so cached prescriptions for
  // days not yet done are stale. Drop them; they regenerate on next open.
  db.delete(sessionPlans).run();

  revalidatePath("/settings");
  revalidatePath("/patrol");
  return { ok: true as const };
}

export async function saveVrGames(games: VrGame[]) {
  await guard();
  setVrGames(mergeVrGames(games));
  // Thursday's options come from this list, so any cached prescription for a
  // conditioning day is now stale.
  db.delete(sessionPlans).run();
  revalidatePath("/settings");
  revalidatePath("/patrol");
  return { ok: true as const };
}

export async function progressSummary() {
  await guard();
  return {
    weights: db.select().from(weights).all().length,
    sessions: db.select().from(sessions).all().length,
    sets: db.select().from(exerciseLogs).all().length,
    food: db.select().from(foodEntries).all().length,
    trials: db.select().from(trials).all().length,
    photos: db.select().from(photos).all().length,
    measurements: db.select().from(measurements).all().length,
  };
}

/**
 * Wipes logged progress and re-pins day 0.
 *
 * Configuration survives — model, equipment, height, start and target weight.
 * You reset a run, not the app; retyping your height after every reset would be
 * pointless friction.
 *
 * Requires the literal string "RESET". The UI asks twice on top of that, and
 * there is no undo.
 */
export async function resetProgress(
  confirmation: string,
  opts: { startDate?: string; deleteImages?: boolean } = {},
) {
  await guard();

  if (confirmation !== "RESET") {
    return { ok: false as const, error: "Confirmation text did not match." };
  }

  const before = await progressSummary();

  for (const t of [
    weights,
    measurements,
    sessions,
    exerciseLogs,
    sessionPlans,
    foodEntries,
    trials,
    abilities,
    photos,
    senseDismissals,
  ]) {
    db.delete(t).run();
  }

  // Keep configuration, drop run state.
  db.delete(settings)
    .where(inArray(settings.key, ["start_date"]))
    .run();

  const start =
    opts.startDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.startDate) ? opts.startDate : todayISO();
  setSetting("start_date", start);

  let imagesRemoved = 0;
  if (opts.deleteImages) {
    for (const kind of ["meals", "suit"]) {
      const dir = path.join(UPLOAD_DIR, kind);
      if (!fs.existsSync(dir)) continue;
      // Count files before removing, so the confirmation message is honest.
      const stack = [dir];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
          const full = path.join(cur, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else imagesRemoved++;
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  for (const p of ["/", "/patrol", "/fuel", "/vitals", "/journey", "/progress", "/settings"]) {
    revalidatePath(p);
  }

  return { ok: true as const, deleted: before, imagesRemoved, startDate: start };
}
