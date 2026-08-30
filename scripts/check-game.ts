/**
 * Proves that a week is a week, on every day of it and from every start date.
 *
 * The fault this exists for: `weekIndex` counted calendar weeks from the Monday
 * of the week you started in, and the challenge window counted seven-day blocks
 * from the start date itself. Start on a Tuesday and the two disagreed by a day
 * — and they disagreed in the direction that loses work rather than misfiling
 * it. On a Monday the index had already rolled into the new week while the
 * window it produced did not open until the Tuesday, so the Monday belonged to
 * no window at all. Everything logged on one counted towards nothing.
 *
 * It was every Monday, not only the first, and the consequence was worse than
 * losing a day's credit: "Full Patrol" asks for five sessions and could only
 * ever see four of them, so a perfect Monday-to-Friday week scored 4/5 and the
 * challenge was unclearable for the whole run.
 *
 * Two rules, then, and both are checked against every weekday a run can start
 * on rather than the one that happened to be reported:
 *
 *   1. No day is lost. A day inside the run belongs to exactly one weekly
 *      window — never zero.
 *   2. No week is impossible. Anchoring the window on Monday gives a mid-week
 *      start a short week 0, so every challenge that week offers must still be
 *      clearable by doing everything on the days that exist.
 */

import { addDays, dayKeyOf, mondayOf, weekIndex } from "../lib/dates";
import { computeGameState, type GameInput } from "../lib/game";
import { TRAINING_DAYS } from "../lib/plan";

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) failures++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
};

/** The window the game builds for the week a date falls in. */
function windowFor(startDate: string, date: string): { from: string; to: string } {
  const from = addDays(mondayOf(startDate), weekIndex(startDate, date) * 7);
  return { from, to: addDays(from, 6) };
}

/** A run doing absolutely everything, every day, from `start` to `today`. */
function everything(start: string, today: string): GameInput {
  const days: string[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) days.push(d);
  return {
    startDate: start,
    today,
    weights: days.map((date) => ({ date, weightKg: 98 })),
    sessions: days.map((date) => ({
      date,
      dayKey: dayKeyOf(date),
      completed: true,
      rpe: 5,
      note: "a note comfortably past the length floor",
    })) as GameInput["sessions"],
    food: days.flatMap((date) => [
      { date, kcal: 700, proteinG: 70, mealType: "meal" as const },
      { date, kcal: 700, proteinG: 70, mealType: "meal" as const },
    ]) as GameInput["food"],
    trials: [],
    photos: ["front", "back", "left", "right"].map((angle) => ({ date: today, weekIndex: 0, angle })),
    measurements: [{ date: today }],
    abilities: [],
    sets: days.map((date) => ({ date })),
    water: days.map((date) => ({ date, ml: 2000 })),
    waterTargetMl: 2000,
    chores: [],
    choreLog: [],
  };
}

function main() {
  // A Monday through a Sunday — every weekday a run can begin on.
  const STARTS = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"];

  // ── 1. No day is lost ──
  // Asked of the real scorer rather than of the date helpers: one day's work
  // and nothing else, for every day of a month, from every possible start.
  // If that day is inside a weekly window, something must move off zero.
  console.log("\nevery day of the run belongs to a week");

  for (const start of STARTS) {
    const lost: string[] = [];
    for (let d = 0; d < 28; d++) {
      const date = addDays(start, d);
      const input: GameInput = {
        ...everything(start, date),
        weights: [{ date, weightKg: 98 }],
        sessions: [
          { date, dayKey: dayKeyOf(date), completed: true, rpe: 5, note: "one day of work, nothing else" },
        ] as GameInput["sessions"],
        food: [{ date, kcal: 700, proteinG: 70, mealType: "meal" }] as GameInput["food"],
        photos: [],
        measurements: [],
        sets: [{ date }],
        water: [{ date, ml: 2000 }],
      };
      const weekly = computeGameState(input).challenges.filter((c) => c.scope === "weekly");
      if (!weekly.some((c) => c.current > 0)) lost.push(`${date} (${dayKeyOf(date)})`);
    }
    ok(
      `a ${dayKeyOf(start)} start loses no day in four weeks`,
      lost.length === 0,
      lost.length ? `${lost.length} lost: ${lost.slice(0, 4).join(", ")}` : "28 days, all counted",
    );
  }

  // The window must be the calendar week, whatever day the run began.
  for (const start of STARTS) {
    const { from, to } = windowFor(start, addDays(start, 30));
    ok(
      `a ${dayKeyOf(start)} start still runs its weeks Monday→Sunday`,
      dayKeyOf(from) === "mon" && dayKeyOf(to) === "sun",
      `${from} (${dayKeyOf(from)}) → ${to} (${dayKeyOf(to)})`,
    );
  }

  // ── 2. A perfect week clears the patrol challenge ──
  // The regression that made the report worth filing: five sessions asked for,
  // four ever visible.
  console.log("\na perfect Monday-to-Friday week reads as perfect");

  for (const start of STARTS) {
    // Three of the pool are drawn per week, so one week proves nothing. Every
    // full week over three months that offers it must clear it, and it has to
    // be offered somewhere or the check is passing vacuously.
    let offered = 0;
    const bad: string[] = [];
    for (let wk = 1; wk <= 13; wk++) {
      const monday = addDays(mondayOf(start), wk * 7);
      const st = computeGameState(everything(start, addDays(monday, 6)));
      const fp = st.challenges.find((c) => c.title === "Full Patrol");
      if (!fp) continue;
      offered++;
      if (!fp.done || fp.target !== TRAINING_DAYS.length) bad.push(`wk${wk} ${fp.current}/${fp.target}`);
    }
    ok(
      `a ${dayKeyOf(start)} start clears Full Patrol in every full week`,
      offered > 0 && bad.length === 0,
      bad.length ? bad.join(", ") : `offered in ${offered} of 13 weeks`,
    );
  }

  // ── 3. No week is impossible ──
  console.log("\nevery challenge offered in a short first week is clearable");

  for (const start of STARTS) {
    const sunday = addDays(mondayOf(start), 6);
    const st = computeGameState(everything(start, sunday));
    const weekly = st.challenges.filter((c) => c.scope === "weekly");
    const stuck = weekly.filter((c) => !c.done);
    const span = weekIndex(start, sunday) === 0 ? `${weekly.length} offered` : "not week 0";
    ok(
      `a ${dayKeyOf(start)} start clears everything week 0 offers`,
      stuck.length === 0,
      stuck.length ? stuck.map((c) => `${c.title} ${c.current}/${c.target}`).join(", ") : span,
    );
    // And it must never ask for more than the week holds.
    const over = weekly.filter((c) => c.target > 7);
    ok(`  …and asks for nothing longer than the week`, over.length === 0, over.map((c) => c.title).join(", "));
  }

  // ── 4. The reported case, end to end ──
  // Everything on one Monday and nothing else, three separate Mondays.
  console.log("\nwork done on a Monday counts (the reported case)");

  const start = "2026-08-04"; // a Tuesday
  for (const monday of ["2026-08-10", "2026-08-17", "2026-08-24"]) {
    const input: GameInput = {
      ...everything(start, monday),
      // Strip everything except the Monday itself.
      weights: [{ date: monday, weightKg: 98 }],
      sessions: [
        { date: monday, dayKey: dayKeyOf(monday), completed: true, rpe: 5, note: "the Monday patrol" },
      ] as GameInput["sessions"],
      food: [{ date: monday, kcal: 700, proteinG: 70, mealType: "meal" }] as GameInput["food"],
      sets: [{ date: monday }],
      water: [{ date: monday, ml: 2000 }],
    };
    const weekly = computeGameState(input).challenges.filter((c) => c.scope === "weekly");
    ok(
      `${monday} is inside its own weekly window`,
      weekly.some((c) => c.current > 0),
      weekly.map((c) => `${c.title} ${c.current}/${c.target}`).join(", "),
    );
  }

  console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
