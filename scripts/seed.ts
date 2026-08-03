/**
 * Development seed: ~10 weeks of plausible weight readings so the chart,
 * corridor and SENSE have something to render against.
 *
 *   npm run db:seed
 *
 * Refuses to touch a database that already holds real data unless --force.
 */
import { db } from "../lib/db";
import { foodEntries, sessions, weights } from "../lib/db/schema";
import { addDays, dayKeyOf, toISODate } from "../lib/dates";
import { TRAINING_DAYS, corridorTarget, phaseForDay, type DayKey } from "../lib/plan";
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

if (force) {
  db.delete(weights).run();
  db.delete(sessions).run();
  db.delete(foodEntries).run();
}
for (const r of rows) {
  db.insert(weights)
    .values(r)
    .onConflictDoUpdate({ target: weights.date, set: { weightKg: r.weightKg } })
    .run();
}

// ── PATROL sessions ──────────────────────────────────────────
// ~80% attendance, so streaks break occasionally and the discipline radar
// comes out lopsided rather than a perfect pentagon.
let sessionCount = 0;
for (let d = 0; d <= DAYS; d++) {
  const date = addDays(start, d);
  const dk = dayKeyOf(date) as DayKey;
  if (!TRAINING_DAYS.includes(dk)) continue;
  // Tuesday mobility gets skipped more — it's the one the plan warns about.
  const skipChance = dk === "tue" ? 0.34 : 0.16;
  if (rnd() < skipChance) continue;

  db.insert(sessions)
    .values({
      date,
      dayKey: dk,
      phase: phaseForDay(d).id,
      completed: true,
      rpe: rnd() < 0.7 ? 2 + Math.floor(rnd() * 4) : null,
      note: rnd() < 0.25 ? "Felt strong on the last round." : null,
    })
    .onConflictDoNothing()
    .run();
  sessionCount++;
}

// ── FUEL entries ─────────────────────────────────────────────
const MEALS = [
  { d: "Magerquark with berries and cinnamon", k: 340, p: 65, c: 22, f: 1, sat: 0.5, sug: 18, fib: 4, salt: 0.3 },
  { d: "Chicken breast, rice and broccoli", k: 620, p: 52, c: 68, f: 12, sat: 3, sug: 4, fib: 6, salt: 1.8 },
  { d: "Vollkornbrot with Aufschnitt", k: 410, p: 24, c: 44, f: 14, sat: 5, sug: 5, fib: 7, salt: 2.4 },
  { d: "Skyr with whey and banana", k: 380, p: 48, c: 38, f: 3, sat: 1, sug: 26, fib: 3, salt: 0.4 },
  { d: "Spätzle with cheese and onions", k: 780, p: 26, c: 82, f: 34, sat: 18, sug: 6, fib: 5, salt: 3.1 },
  { d: "Lentil soup with bread", k: 520, p: 26, c: 66, f: 14, sat: 4, sug: 8, fib: 14, salt: 2.7 },
];
const SNACKS = [
  { d: "Handful of mixed nuts", k: 290, p: 8, c: 9, f: 25, sat: 3, sug: 3, fib: 4, salt: 0.1 },
  { d: "Two squares of dark chocolate", k: 120, p: 2, c: 11, f: 8, sat: 5, sug: 9, fib: 2, salt: 0 },
  { d: "500 ml cola", k: 210, p: 0, c: 53, f: 0, sat: 0, sug: 53, fib: 0, salt: 0.1 },
  { d: "Protein bar", k: 200, p: 20, c: 18, f: 6, sat: 3, sug: 2, fib: 5, salt: 0.5 },
];

let foodCount = 0;
// Only the last three weeks — FUEL came online after the weight log did.
for (let d = Math.max(0, DAYS - 20); d <= DAYS; d++) {
  const date = addDays(start, d);
  if (rnd() < 0.12) continue; // the odd untracked day

  const mealsToday = 2 + Math.floor(rnd() * 2);
  for (let m = 0; m < mealsToday; m++) {
    const pick = MEALS[Math.floor(rnd() * MEALS.length)];
    const hour = [8, 12, 19][m] ?? 15;
    db.insert(foodEntries)
      .values({
        loggedAt: Math.floor(new Date(`${date}T${String(hour).padStart(2, "0")}:20:00`).getTime() / 1000),
        date,
        description: pick.d,
        normKey: pick.d.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim(),
        kcal: pick.k, proteinG: pick.p, carbsG: pick.c, fatG: pick.f,
        saturatedFatG: pick.sat, sugarG: pick.sug, fiberG: pick.fib, saltG: pick.salt,
        mealType: "meal",
        source: "ai",
        aiConfidence: rnd() < 0.3 ? "low" : "medium",
      })
      .run();
    foodCount++;
  }

  // Thursday snacking runs heavier, so SENSE has a real weekday pattern to find.
  const snackCount = dayKeyOf(date) === "thu" ? 1 + Math.floor(rnd() * 3) : Math.floor(rnd() * 2);
  for (let s = 0; s < snackCount; s++) {
    const pick = SNACKS[Math.floor(rnd() * SNACKS.length)];
    db.insert(foodEntries)
      .values({
        loggedAt: Math.floor(new Date(`${date}T${15 + s}:40:00`).getTime() / 1000),
        date,
        description: pick.d,
        normKey: pick.d.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim(),
        kcal: pick.k, proteinG: pick.p, carbsG: pick.c, fatG: pick.f,
        saturatedFatG: pick.sat, sugarG: pick.sug, fiberG: pick.fib, saltG: pick.salt,
        mealType: "snack",
        source: "ai",
        aiConfidence: "medium",
      })
      .run();
    foodCount++;
  }
}

console.log(`Seeded ${rows.length} readings from ${start} (day 0) to today.`);
console.log(`Seeded ${sessionCount} sessions and ${foodCount} fuel entries.`);
console.log(`Start date set to ${start}.`);
