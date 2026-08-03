/**
 * Simulates whole years through the real progression engine so LEVEL_K is set
 * from measured totals rather than a back-of-envelope guess.
 *
 *   npx tsx scripts/tune-curve.ts
 *
 * Run this after changing anything in the XP table. The curve is only correct
 * relative to how much XP a year actually pays out.
 */
import {
  computeGameState,
  levelForXp,
  xpForLevel,
  MAX_LEVEL,
  type GameInput,
  type GameSession,
  type GameFood,
} from "../lib/game";
import { addDays, dayKeyOf, toISODate } from "../lib/dates";
import { TRAINING_DAYS, type DayKey } from "../lib/plan";

function buildYear(days: number, attendance: number, trackingRate: number): GameInput {
  const start = toISODate(new Date(Date.now() - days * 86_400_000));
  const today = toISODate(new Date());

  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const weights: { date: string; weightKg: number }[] = [];
  const sessions: GameSession[] = [];
  const food: GameFood[] = [];
  const photos: { date: string; weekIndex: number; angle: string }[] = [];
  const measurements: { date: string }[] = [];
  const trials: GameInput["trials"] = [];

  for (let d = 0; d <= days; d++) {
    const date = addDays(start, d);
    const dk = dayKeyOf(date) as DayKey;

    if (rnd() < trackingRate) weights.push({ date, weightKg: 100 - (20 * d) / 365 });

    if (TRAINING_DAYS.includes(dk) && rnd() < attendance) {
      sessions.push({
        date,
        dayKey: dk,
        completed: true,
        rpe: rnd() < 0.7 ? 3 : null,
        note: rnd() < 0.3 ? "Solid session today." : null,
      });
    }

    if (rnd() < trackingRate) {
      const n = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        food.push({
          date,
          loggedAt: 0,
          kcal: 550,
          proteinG: 45,
          mealType: i === n - 1 ? "snack" : "meal",
        });
      }
    }

    // Weekly SUIT CHECK, all four angles.
    if (d % 7 === 0 && rnd() < trackingRate) {
      for (const angle of ["front", "side", "back", "side_flexed"]) {
        photos.push({ date, weekIndex: Math.floor(d / 7), angle });
      }
    }

    // Monthly trial + measurements.
    if (d > 0 && d % 30 === 0) {
      trials.push({ date, monthIndex: d / 30, score: 200 + d, pullupsReps: Math.floor(d / 40) });
      measurements.push({ date });
    }
  }

  const abilities = Array.from({ length: Math.floor((days / 365) * 12) }, (_, i) => ({
    abilityKey: `a${i}`,
    achieved: true,
  }));

  // ~6 movements x 3 sets per session, matching the plan's shape.
  const sets = sessions.flatMap((s) => Array.from({ length: 18 }, () => ({ date: s.date })));

  return { startDate: start, today, weights, sessions, food, trials, photos, measurements, abilities, sets };
}

const PROFILES = [
  { name: "consistent", attendance: 0.95, tracking: 0.95 },
  { name: "realistic", attendance: 0.8, tracking: 0.8 },
  { name: "patchy", attendance: 0.55, tracking: 0.5 },
];

console.log("XP earned by day 365\n");
const totals: Record<string, number> = {};
for (const p of PROFILES) {
  const s = computeGameState(buildYear(365, p.attendance, p.tracking));
  totals[p.name] = s.xp;
  console.log(`  ${p.name.padEnd(12)} ${s.xp.toLocaleString("en-GB").padStart(9)} XP  →  level ${s.level}`);
}

// Target: a consistent year finishes near level 50, leaving headroom to 60.
const TARGET_LEVEL = 50;
const suggestedK = Math.round(totals.consistent / Math.pow(TARGET_LEVEL - 1, 2));
console.log(`\nSuggested LEVEL_K for consistent → level ${TARGET_LEVEL}:  ${suggestedK}`);
console.log(`Currently in use: ${Math.round(xpForLevel(2))}\n`);

console.log("Ramp with the current curve\n");
for (const [label, xp] of [
  ["one weight log", 25 + 50],
  ["first session too", 25 + 50 + 150 + 50],
  ["end of week 1", 1_400],
  ["end of month 1", 7_000],
  ["end of month 3", 22_000],
  ["end of month 6", 55_000],
] as [string, number][]) {
  const lvl = levelForXp(xp);
  console.log(`  ${label.padEnd(18)} ${String(xp).padStart(7)} XP  →  level ${lvl}`);
}

console.log("\nLevel thresholds\n");
for (const l of [2, 3, 4, 5, 10, 20, 30, 40, 50, MAX_LEVEL]) {
  console.log(`  level ${String(l).padStart(2)}  ${Math.round(xpForLevel(l)).toLocaleString("en-GB").padStart(9)} XP`);
}
