/**
 * Proves the two rules THE WEB stands on, against a real database.
 *
 *   1. Mastery is not one good set, and not one good fortnight either. It is
 *      enough sets in a session to clear the bar, on enough separate sessions,
 *      spread across enough separate calendar weeks, with no session you said
 *      hurt. The week count is the part that cannot be crammed.
 *   2. A reset draws a line and deletes nothing. Sets before it stop counting
 *      towards the tree; every row is still there afterwards.
 *   3. A day that has not arrived is never written down. Browsing ahead used to
 *      issue and store that day's prescription, freezing its movements and its
 *      numbers at whatever level you were on the evening you scrolled past it.
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
  const { exerciseLogs, movementFeedback, sessionPlans, sessions, skillResets } =
    await import("../lib/db/schema");
  const { cutoffs, movementRecords } = await import("../lib/skills");
  const { placeOnLadder, standings, sweepMovement } = await import("../lib/baseline");
  const { findMovement, ladder, masteryLabel, masterySessions, masterySets, masteryWeeks, movementKey, setClears } =
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

  const log = (
    date: string,
    name: string,
    reps: number | null,
    seconds: number | null = null,
    weightKg: number | null = null,
  ) => {
    db.insert(exerciseLogs)
      .values({
        sessionId: sessionFor(date),
        date,
        exerciseKey: movementKey(name),
        exerciseName: name,
        setIndex: 1,
        reps,
        seconds,
        weightKg,
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

  // ── Short of the bar is not a clean set ──
  // The report that produced this: "I can do the incline inverted row, but only
  // two reps — that is far from mastering." It is, and it always was, but the
  // rule had never been demonstrated anywhere that a change could break it.
  console.log("\na set short of the bar counts for nothing");

  const ROW = "Incline inverted row";
  for (const date of ["2026-08-03", "2026-08-10", "2026-08-17"]) {
    for (let i = 0; i < 3; i++) log(date, ROW, 2);
  }
  ok("nine sets of two is not one clean session", rec(ROW)?.cleanSessions === 0);
  ok("and the strand has not moved", (standings("2026-08-18").get("row")?.tier ?? -1) === 0);
  ok("but the sets are still recorded", rec(ROW)?.sets === 9);
  ok("and the best is remembered", rec(ROW)?.bestReps === 2);

  // ── A loaded rung's bar is reps *and* kilograms ──
  // Fifteen goblet squats with a 2 kg dumbbell and fifteen with the plan's own
  // pair are the same number and not the same movement. Without the load in the
  // rule, the light one unlocked the split squat, the Bulgarian split squat and
  // the road to a pistol.
  console.log("\na loaded rung wants the weight too");

  const GOBLET = "Goblet squat";
  const bar = findMovement(GOBLET)!.masterAt;
  ok("the goblet squat states a load", bar.kg === 16, `${bar.reps} reps at ${bar.kg} kg`);

  for (const date of ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"]) {
    for (let i = 0; i < 3; i++) log(date, GOBLET, 15, null, 2);
  }
  ok("fifteen reps with 2 kg banks nothing", rec(GOBLET)?.cleanSessions === 0);

  for (const date of ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]) {
    for (let i = 0; i < 3; i++) log(date, GOBLET, 15, null, 16);
  }
  ok(
    "the same reps at 16 kg do",
    rec(GOBLET)?.cleanSessions === 4,
    `${rec(GOBLET)?.cleanSessions} clean`,
  );
  ok("and the heaviest set is remembered", rec(GOBLET)?.bestWeightKg === 16);
  ok(
    "a heavier set still counts — the load is a floor, not a target",
    setClears(findMovement(GOBLET)!, 15, null, 24),
  );
  ok(
    "the reps still have to be there",
    !setClears(findMovement(GOBLET)!, 4, null, 40),
  );

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
      verdict: "painful",
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

  // ── Looking ahead must not decide anything ──
  console.log("\nlooking at a future session decides nothing about it");

  const { storePrescription, storedPrescription } = await import("../lib/training");
  const { todayISO, addDays } = await import("../lib/dates");

  const ahead = addDays(todayISO(), 21);
  const plan = (date: string) => ({
    date,
    dayKey: "mon" as const,
    phase: 1 as const,
    source: "plan" as const,
    model: null,
    exercises: [
      {
        key: "wall pushup",
        name: "Wall push-up",
        sets: 3,
        metric: "reps" as const,
        repRange: "8–12",
        targetReps: 12,
        targetSeconds: null,
        targetWeightKg: null,
        note: null,
        perSide: false,
        loaded: false,
        substitutedFrom: null,
      },
    ],
    locked: [],
  });

  storePrescription(plan(ahead));
  ok("a session three weeks out is not stored", storedPrescription(ahead) === null);

  // Anyone who browsed ahead on an older build has rows already frozen. They are
  // swept on the next read rather than left to fire on the day they name.
  db.insert(sessionPlans)
    .values({
      date: ahead,
      dayKey: "mon",
      phase: 1,
      source: "plan",
      payload: JSON.stringify(plan(ahead).exercises),
      createdAt: ++clock,
    })
    .run();
  ok("a row frozen by an older build is swept", storedPrescription(ahead) === null);
  ok(
    "and it is gone from the table, not just ignored",
    db.select().from(sessionPlans).all().every((r) => r.date <= todayISO()),
  );

  storePrescription(plan(todayISO()));
  ok("today's session is still stored", storedPrescription(todayISO()) !== null);
  storePrescription(plan(addDays(todayISO(), -3)));
  ok("and so is a day you are filling in late", storedPrescription(addDays(todayISO(), -3)) !== null);

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

  // ── How it felt decides what is asked for next ──
  // The whole reason the question is asked. Double progression on its own reads
  // twelve reps the same way whether they flew up or nearly finished you, and
  // adds one either way — so on the old three-answer scale a movement someone
  // had outgrown crept up a rep a session while a movement that was crushing
  // them did exactly the same.
  console.log("\nthe rating changes what the next session asks for");

  const { stepFor, VERDICTS: SCALE } = await import("../lib/feedback");

  ok("five answers, not three", SCALE.length === 5, SCALE.map((v) => v.key).join(", "));
  ok("and each one says what it does", SCALE.every((v) => v.hint.length > 10 && v.meaning.length > 20));

  ok("easy asks for more than clean", stepFor("easy").reps > stepFor("clean").reps);
  ok("and more seconds on a hold too", stepFor("easy").seconds > stepFor("clean").seconds);
  ok("clean is the ordinary single step", stepFor("clean").reps === 1 && stepFor("clean").seconds === 5);
  ok("hard adds nothing", stepFor("hard").reps === 0 && stepFor("hard").seconds === 0);
  ok("limit adds nothing either", stepFor("limit").reps === 0 && stepFor("limit").seconds === 0);
  ok("painful goes back rather than nowhere", stepFor("painful").back);
  ok("and nothing else does", !["easy", "clean", "hard", "limit"].some((v) => stepFor(v as never).back));

  // A movement nobody has rated has to behave exactly as it did before any of
  // this existed, or a quiet session silently stalls the plan.
  ok("an unanswered movement keeps the ordinary step", stepFor(null).reps === 1 && stepFor(undefined).reps === 1);
  ok("and never steps back on its own", !stepFor(null).back);

  // Nothing on the scale may ever ask for less than nothing, or for a jump no
  // sane session could absorb.
  ok(
    "every step is a sane size",
    [...SCALE.map((v) => v.key), null].every((v) => {
      const st = stepFor(v as never);
      return st.reps >= 0 && st.reps <= 2 && st.seconds >= 0 && st.seconds <= 10;
    }),
  );

  // And end to end, through the real issuing path: identical work logged, only
  // the rating different. This is the assertion the whole feature stands on —
  // everything above proves the arithmetic, this proves it reaches the session.
  console.log("\nthe same session, rated differently, is prescribed differently");
  {
    const { baselinePrescription, generatePrescription } = await import("../lib/training");
    const { todayISO: nowISO, addDays: plus, dayKeyOf: dk } = await import("../lib/dates");
    const { setSetting } = await import("../lib/settings");

    const day = nowISO();
    const before = plus(day, -1);
    setSetting("start_date", plus(day, -60));

    const shape = baselinePrescription(1, dk(day) as never, 8, day);
    const move = shape.exercises.find((e) => e.metric === "reps");

    const issued = async (verdict: string | null) => {
      db.delete(exerciseLogs).run();
      db.delete(sessions).run();
      db.delete(movementFeedback).run();
      const sid = db
        .insert(sessions)
        .values({ date: before, dayKey: dk(before), phase: 1, completed: true })
        .returning({ id: sessions.id })
        .get().id;
      for (let i = 0; i < 3; i++) {
        db.insert(exerciseLogs)
          .values({ sessionId: sid, date: before, exerciseKey: move!.key, exerciseName: move!.name,
            setIndex: i, reps: 10, weightKg: 20 })
          .run();
      }
      if (verdict) db.insert(movementFeedback).values({ date: before, exerciseKey: move!.key, verdict: verdict as never }).run();
      const rx = await generatePrescription(baselinePrescription(1, dk(day) as never, 8, day), false);
      return rx.exercises.find((e) => e.key === move!.key)?.targetReps ?? null;
    };

    if (!move) {
      ok("today's session has a rep-based movement to test with", false);
    } else {
      const none = await issued(null);
      const easy = await issued("easy");
      const clean = await issued("clean");
      const hard = await issued("hard");
      const limit = await issued("limit");
      const painful = await issued("painful");

      ok("easy asks for more than clean", (easy ?? 0) > (clean ?? 0), `${easy} vs ${clean}`);
      ok("clean asks for more than the ten that were logged", (clean ?? 0) > 10, `${clean}`);
      ok("hard holds at what was logged", hard === 10, `${hard}`);
      ok("limit holds too", limit === 10, `${limit}`);
      ok("painful drops back rather than holding", (painful ?? 99) < 10, `${painful}`);
      // The one that must not change. A movement nobody rated has to behave
      // exactly as it did before any of this shipped.
      ok("and an unrated movement progresses as it always did", none === clean, `${none} vs ${clean}`);
    }
  }

  fs.rmSync(root, { recursive: true, force: true });
  console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
