/**
 * Proves the two rules THE WEB stands on, against a real database.
 *
 *   1. Mastery is not one good set. It is enough sets in a session to clear the
 *      bar, on enough separate sessions, with no session you said hurt.
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
  const { findMovement, ladder, movementKey } = await import("../lib/movements");
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
  // "Push-ups on a table" masters at 12 reps, and the default rule asks for two
  // such sets on two separate days.
  console.log("mastery takes more than one good set");

  log("2026-08-01", "Push-ups on a table", 12);
  ok("one set at the bar is not mastery", rec("Push-ups on a table")?.mastered === false);
  ok("best session reads 1 of 2 sets", rec("Push-ups on a table")?.bestCleanSets === 1);

  log("2026-08-01", "Push-ups on a table", 12);
  ok("two sets on one day is not mastery", rec("Push-ups on a table")?.mastered === false);
  ok("but it banks a clean session", rec("Push-ups on a table")?.cleanSessions === 1);

  log("2026-08-04", "Push-ups on a table", 12);
  log("2026-08-04", "Push-ups on a table", 11);
  ok(
    "a second day with one set short does not master",
    rec("Push-ups on a table")?.mastered === false,
    `cleanSessions=${rec("Push-ups on a table")?.cleanSessions}`,
  );

  log("2026-08-06", "Push-ups on a table", 13);
  log("2026-08-06", "Push-ups on a table", 12);
  ok("two clean sessions masters it", rec("Push-ups on a table")?.mastered === true);
  ok("progress is full", rec("Push-ups on a table")?.progress === 1);

  // ── The feel check ──
  console.log("\na session you said hurt does not count");

  log("2026-08-01", "Push-ups on a chair", 12);
  log("2026-08-01", "Push-ups on a chair", 12);
  log("2026-08-04", "Push-ups on a chair", 12);
  log("2026-08-04", "Push-ups on a chair", 12);
  ok("mastered on the numbers alone", rec("Push-ups on a chair")?.mastered === true);

  db.insert(movementFeedback)
    .values({
      date: "2026-08-04",
      exerciseKey: movementKey("Push-ups on a chair"),
      verdict: "pain",
      createdAt: ++clock,
    })
    .run();
  ok("reporting pain takes that session back", rec("Push-ups on a chair")?.mastered === false);
  ok("and it is counted", rec("Push-ups on a chair")?.painReports === 1);

  // ── Standings read the same rule ──
  console.log("\nstandings promote on the harder bar");
  ok(
    "push strand sits above the mastered rung",
    (standings("2026-08-07").get("push")?.tier ?? -1) >= 2,
    `tier=${standings("2026-08-07").get("push")?.tier}`,
  );

  // ── Resets ──
  console.log("\na reset draws a line and deletes nothing");

  const rowsBefore = db.select().from(exerciseLogs).all().length;
  const line = ++clock;
  db.insert(skillResets).values({ family: "push", resetAt: line, createdAt: line }).run();

  ok("push movements stop counting", rec("Push-ups on a table") === undefined);
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
  const after = standings("2026-08-07");
  ok("the strand has no standing left", after.get("push") === undefined);
  ok(
    "the next patrol opens at the easiest push-up",
    sweepMovement("push", after)?.name === ladder("push")[0].name,
    sweepMovement("push", after)?.name,
  );

  console.log("\ntraining after the line counts again");
  clock += 10;
  log("2026-08-07", "Push-ups on a table", 12);
  log("2026-08-07", "Push-ups on a table", 12);
  ok("the new session counts", rec("Push-ups on a table")?.cleanSessions === 1);
  ok("the old sets stay out", rec("Push-ups on a table")?.sets === 2);

  console.log("\nundoing a reset brings everything back");
  db.delete(skillResets).run();
  ok("mastery is restored", rec("Push-ups on a table")?.mastered === true);
  ok("and so are the old sets", (rec("Push-ups on a table")?.sets ?? 0) > 2);

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
    "a beginner is given rock-backs instead",
    place("Shoulder roll").name === "Rock-backs",
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

  // Once the roll is earned, tumbling opens.
  for (const date of ["2026-08-08", "2026-08-09"]) {
    log(date, "Rock-backs", 10);
    log(date, "Rock-backs", 10);
    log(date, "Plank", null, 40);
    log(date, "Plank", null, 40);
  }
  const rolled = standings("2026-08-10");
  ok("the roll strand promoted off rock-backs", (rolled.get("roll")?.tier ?? 0) === 1);
  ok(
    "cartwheels are still shut — the roll gate wants 5 of the real thing",
    placeOnLadder("Cartwheel", "5", null, rolled).blocked !== null,
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
