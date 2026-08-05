/**
 * Proves the two rules THE WEB stands on, against a real database.
 *
 *   1. Mastery is not one good set, and not one good fortnight either. It is
 *      enough sets in a session to clear the bar, on enough separate sessions,
 *      spread across enough separate calendar weeks, with no session you said
 *      hurt. The week count is the part that cannot be crammed.
 *   2. A reset draws a line and deletes nothing. Sets before it stop counting
 *      towards the tree; every row is still there afterwards.
 *
 * Both are easy to break by accident from a long way away — a change to how logs
 * are aggregated, or one to the catalogue's `masterAt` — and both are invisible
 * until a strand quietly advances a level early or a reset eats a session.
 *
 * `DATABASE_PATH` is set before anything is imported, so this runs against a
 * throwaway file and never touches ./data.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "arachne-skills-"));
process.env.DATABASE_PATH = path.join(root, "db", "arachne.db");

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) failures++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
};

async function main() {
  // Dynamic, because `lib/db` opens the file the moment it is imported and the
  // path above has to be in place first.
  const { db } = await import("../lib/db");
  const { exerciseLogs, movementFeedback, sessions, skillResets } = await import("../lib/db/schema");
  const { cutoffs, movementRecords } = await import("../lib/skills");
  const { placeOnLadder, standings, sweepMovement } = await import("../lib/baseline");
  const { findMovement, ladder, masteryLabel, masterySessions, masterySets, masteryWeeks, movementKey } =
    await import("../lib/movements");
  const { dayKeyOf } = await import("../lib/dates");

  /**
   * Rows are stamped with a monotonic fake clock rather than the real one: the
   * cutoff is compared in seconds, and a test that logged and reset inside the
   * same second would pass or fail depending on how fast the machine is.
   */
  let clock = 1_700_000_000;

  const sessionFor = (date: string): number => {
    const existing = db.select().from(sessions).all().find((s) => s.date === date);
    if (existing) return existing.id;
    return db
      .insert(sessions)
      .values({ date, dayKey: dayKeyOf(date), phase: 0, createdAt: ++clock })
      .returning({ id: sessions.id })
      .get().id;
  };

  const log = (date: string, name: string, reps: number | null, seconds: number | null = null) => {
    db.insert(exerciseLogs)
      .values({
        sessionId: sessionFor(date),
        date,
        exerciseKey: movementKey(name),
        exerciseName: name,
        setIndex: 1,
        reps,
        seconds,
        createdAt: ++clock,
      })
      .run();
  };

  const rec = (name: string) => movementRecords().get(name);

  // ── The bar ──
  // The waist-height incline push-up is a `foundation` rung: 12 reps, three such
  // sets in a session, five sessions, across three separate calendar weeks.
  const WAIST = "Incline push-up (waist height)";
  const wm = findMovement(WAIST)!;
  console.log("mastery takes more than one good set");
  ok(
    "the rung under test asks for 3×12, five times, across three weeks",
    masterySets(wm) === 3 && masterySessions(wm) === 5 && masteryWeeks(wm) === 3,
    masteryLabel(wm),
  );

  log("2026-08-03", WAIST, 12);
  ok("one set at the bar is not mastery", rec(WAIST)?.mastered === false);
  ok("best session reads 1 of 3 sets", rec(WAIST)?.bestCleanSets === 1);

  log("2026-08-03", WAIST, 12);
  ok("two of the three sets is not a clean session", rec(WAIST)?.cleanSessions === 0);

  log("2026-08-03", WAIST, 12);
  ok("the third set banks the session", rec(WAIST)?.cleanSessions === 1);
  ok("but one session is not mastery", rec(WAIST)?.mastered === false);

  log("2026-08-05", WAIST, 12);
  log("2026-08-05", WAIST, 12);
  log("2026-08-05", WAIST, 11);
  ok(
    "a session one set short banks nothing",
    rec(WAIST)?.cleanSessions === 1,
    `cleanSessions=${rec(WAIST)?.cleanSessions}`,
  );

  // ── The week spread ──
  // Four more clean sessions, all inside the following week. That is five clean
  // sessions — the session count is met — in two calendar weeks.
  console.log("\nfive good sessions in a fortnight is a good fortnight, not mastery");

  for (const date of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]) {
    for (let i = 0; i < 3; i++) log(date, WAIST, 12);
  }
  ok("the session count is met", (rec(WAIST)?.cleanSessions ?? 0) >= 5);
  ok("but only two weeks are covered", rec(WAIST)?.cleanWeeks === 2, `weeks=${rec(WAIST)?.cleanWeeks}`);
  ok("so it is not mastered", rec(WAIST)?.mastered === false);
  ok("and the tree has not moved on", (standings("2026-08-14").get("push")?.tier ?? -1) === 1);

  console.log("\nthe third week finishes it");
  for (let i = 0; i < 3; i++) log("2026-08-17", WAIST, 12);
  ok("three weeks covered", rec(WAIST)?.cleanWeeks === 3);
  ok("mastered", rec(WAIST)?.mastered === true);
  ok("progress is full", rec(WAIST)?.progress === 1);

  // ── The feel check ──
  console.log("\na session you said hurt does not count");

  const BENCH = "Incline push-up (bench height)";
  for (const date of ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"]) {
    for (let i = 0; i < 3; i++) log(date, BENCH, 12);
  }
  ok("mastered on the numbers alone", rec(BENCH)?.mastered === true);

  db.insert(movementFeedback)
    .values({
      date: "2026-09-14",
      exerciseKey: movementKey(BENCH),
      verdict: "pain",
      createdAt: ++clock,
    })
    .run();
  ok("reporting pain takes that session back", rec(BENCH)?.mastered === false);
  ok("and the week it was in goes with it", rec(BENCH)?.cleanWeeks === 6);
  ok("and it is counted", rec(BENCH)?.painReports === 1);

  // ── Standings read the same rule ──
  console.log("\nstandings promote on the harder bar");
  ok(
    "push strand sits above the mastered rung",
    (standings("2026-09-15").get("push")?.tier ?? -1) >= 2,
    `tier=${standings("2026-09-15").get("push")?.tier}`,
  );

  // ── Resets ──
  console.log("\na reset draws a line and deletes nothing");

  const rowsBefore = db.select().from(exerciseLogs).all().length;
  const line = ++clock;
  db.insert(skillResets).values({ family: "push", resetAt: line, createdAt: line }).run();

  ok("push movements stop counting", rec(WAIST) === undefined);
  ok("the cutoff lands on push only", cutoffs().byFamily.get("push") === line);
  ok("no cutoff on any other strand", cutoffs().global === 0 && cutoffs().byFamily.size === 1);
  ok(
    "every logged set is still there",
    db.select().from(exerciseLogs).all().length === rowsBefore,
    `${rowsBefore} rows`,
  );
  // A reset strand has no standing at all rather than a standing of zero — the
  // logs no longer say anything about it, which is the state a fresh account is
  // in. What matters is where the next patrol opens.
  const after = standings("2026-09-15");
  ok("the strand has no standing left", after.get("push") === undefined);
  ok(
    "the next patrol opens at the easiest push-up",
    sweepMovement("push", after)?.name === ladder("push")[0].name,
    sweepMovement("push", after)?.name,
  );

  console.log("\ntraining after the line counts again");
  clock += 10;
  for (let i = 0; i < 3; i++) log("2026-09-16", WAIST, 12);
  ok("the new session counts", rec(WAIST)?.cleanSessions === 1);
  ok("the old sets stay out", rec(WAIST)?.sets === 3);

  console.log("\nundoing a reset brings everything back");
  db.delete(skillResets).run();
  ok("mastery is restored", rec(WAIST)?.mastered === true);
  ok("and so are the old sets", (rec(WAIST)?.sets ?? 0) > 3);

  // ── New movements are earned and prepared ──
  console.log("\nnothing complicated arrives unprepared");

  db.delete(exerciseLogs).run();
  db.delete(movementFeedback).run();
  db.delete(skillResets).run();

  const fresh = standings("2026-08-07");
  const place = (name: string) => placeOnLadder(name, "10", null, fresh);

  // The movement that started this: the plan puts "Shoulder roll" on the first
  // Friday, and the document means the version done from a walk.
  ok("the plan's shoulder roll is the one from a walk", findMovement("Shoulder roll")?.tier === 4);
  ok(
    "a beginner is given the backward breakfall instead",
    place("Shoulder roll").name === "Backward breakfall",
    place("Shoulder roll").name,
  );
  ok("and is told why", (place("Shoulder roll").note ?? "").includes("nothing logged here yet"));

  // Strands that should be shut outright rather than opened at the bottom.
  for (const [name, family] of [
    ["Cartwheel", "tumbling"],
    ["Safety vault over a bench", "vaults"],
    ["Kip-up progression", "kip-ups"],
  ] as const) {
    ok(`${family} are held back entirely`, place(name).blocked !== null, place(name).name);
  }

  // Groundwork is never moved and never gated.
  ok("warm-ups are left exactly as the plan wrote them", place("Arm circles").name === "Arm circles");
  ok("and are never blocked", place("Arm circles").blocked === null);

  // Logging a warm-up must not place you on the strand it is grouped under.
  log("2026-08-07", "Arm circles", 10);
  ok(
    "logging a warm-up does not create a standing",
    standings("2026-08-07").get("vertical_push") === undefined,
  );

  // ── Cross-strand gates name a rung, not just a number ──
  // The cartwheel waits on the roll from a crouch. Four weeks of breakfalls
  // produces plenty of reps in the falling strand and must not open it: five
  // backward breakfalls is not what "be able to roll out of a cartwheel" means.
  console.log("\na tier gate wants the rung, not the reps");

  for (const date of ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]) {
    log(date, "Backward breakfall", 10);
    log(date, "Backward breakfall", 10);
    for (let i = 0; i < 3; i++) log(date, "Plank", null, 40);
    for (let i = 0; i < 3; i++) log(date, "Wall handstand", null, 35);
  }
  const rolled = standings("2026-09-01");
  ok("the roll strand promoted off the breakfall", (rolled.get("roll")?.tier ?? 0) === 1);
  ok(
    "plenty of reps banked in the strand",
    (rolled.get("roll")?.familyBestReps ?? 0) >= 10,
    `best=${rolled.get("roll")?.familyBestReps}`,
  );
  ok(
    "cartwheels are still shut — the gate wants the roll from a crouch",
    placeOnLadder("Cartwheel", "5", null, rolled).blocked !== null,
  );

  console.log("\nreaching the rung opens it");
  log("2026-09-02", "Shoulder roll from a kneel", 5);
  log("2026-09-02", "Shoulder roll from a crouch", 5);
  const crouched = standings("2026-09-03");
  ok("the falling strand has logged the crouch", (crouched.get("roll")?.loggedTier ?? 0) === 2);
  ok(
    "and tumbling opens at the bottom",
    placeOnLadder("Cartwheel", "5", null, crouched).blocked === null,
  );

  console.log("\na whole-tree reset covers every strand");
  log("2026-08-07", "Bodyweight squats", 20);
  const rowsNow = db.select().from(exerciseLogs).all().length;
  const all = ++clock;
  db.insert(skillResets).values({ family: null, resetAt: all, createdAt: all }).run();
  ok("nothing counts anywhere", movementRecords().size === 0);
  ok(
    "and every row survived that too",
    db.select().from(exerciseLogs).all().length === rowsNow,
    `${rowsNow} rows`,
  );

  fs.rmSync(root, { recursive: true, force: true });
  console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
