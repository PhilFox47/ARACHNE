/**
 * Wipes every table and pins day 0 to today. Run this once before starting for
 * real, after you've finished poking at seed data.
 *
 *   npm run db:reset -- --yes
 *
 * Requires --yes. There is no undo, and the whole point of this app is a record
 * you can't accidentally destroy.
 */
import { db } from "../lib/db";
import {
  abilities,
  foodEntries,
  measurements,
  photos,
  senseDismissals,
  sessions,
  settings,
  trials,
  weights,
} from "../lib/db/schema";
import { todayISO } from "../lib/dates";

if (!process.argv.includes("--yes")) {
  console.error("This deletes all ARACHNE data. Re-run with --yes if you mean it.");
  process.exit(1);
}

const counts = {
  weights: db.select().from(weights).all().length,
  measurements: db.select().from(measurements).all().length,
  sessions: db.select().from(sessions).all().length,
  food: db.select().from(foodEntries).all().length,
  trials: db.select().from(trials).all().length,
  photos: db.select().from(photos).all().length,
};

for (const t of [weights, measurements, sessions, foodEntries, trials, abilities, photos, senseDismissals, settings]) {
  db.delete(t).run();
}

const today = todayISO();
db.insert(settings).values({ key: "start_date", value: today }).run();

console.log("Cleared:", counts);
console.log(`Day 0 is now ${today}.`);
console.log("Image files on the upload volume are left alone — remove those by hand if you want them gone.");
