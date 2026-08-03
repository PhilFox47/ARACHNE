/**
 * Development seed: ~10 weeks of plausible weight readings so the chart,
 * corridor and SENSE have something to render against.
 *
 *   npm run db:seed
 *
 * Refuses to touch a database that already holds real data unless --force.
 */
import { db } from "../lib/db";
import { weights } from "../lib/db/schema";
import { addDays, toISODate } from "../lib/dates";
import { corridorTarget } from "../lib/plan";
import { setSetting } from "../lib/settings";

const DAYS = 70;
const force = process.argv.includes("--force");

const existing = db.select().from(weights).all();
if (existing.length > 0 && !force) {
  console.error(`${existing.length} readings already present. Re-run with --force to overwrite.`);
  process.exit(1);
}

const start = toISODate(new Date(Date.now() - DAYS * 86_400_000));
setSetting("start_date", start);

// Deterministic so repeated seeds produce the same chart.
let seed = 20260803;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

let drift = 0.4;
const rows: { date: string; weightKg: number }[] = [];

for (let d = 0; d <= DAYS; d++) {
  // Skip the odd day — a real log has gaps, and the rolling average needs to
  // cope with them.
  if (d > 3 && rnd() < 0.12) continue;

  // Track the corridor loosely, with water-weight noise on top.
  const target = corridorTarget(d);
  drift += (rnd() - 0.5) * 0.22;
  drift = Math.max(-1.6, Math.min(1.9, drift));
  const noise = (rnd() - 0.5) * 0.85;
  const kg = Math.round((target + drift + noise) * 10) / 10;

  rows.push({ date: addDays(start, d), weightKg: kg });
}

if (force) db.delete(weights).run();
for (const r of rows) {
  db.insert(weights)
    .values(r)
    .onConflictDoUpdate({ target: weights.date, set: { weightKg: r.weightKg } })
    .run();
}

console.log(`Seeded ${rows.length} readings from ${start} (day 0) to today.`);
console.log(`Start date set to ${start}.`);
