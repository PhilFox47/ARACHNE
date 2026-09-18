/**
 * Proves where one day ends and the next begins.
 *
 * The rule: a day runs from 04:00 to 04:00, not midnight to midnight. Staying
 * up past twelve should not move the water you are drinking, the meal you are
 * logging or the chores you are ticking onto a day that has not started — and
 * it should not hand the day you are still in a set of missed chores it has not
 * had a chance to do.
 *
 * This is the most load-bearing function in the app. Every screen, every
 * challenge window, every chore standing and every backup asks `todayISO()`
 * what day it is, so an off-by-one here is an off-by-one everywhere, and it is
 * the kind of fault that looks like nothing until the one night it matters.
 *
 * `TZ` is pinned to the value docker-compose ships, before anything is
 * imported. That is not decoration: `getHours()` is local time, "four in the
 * morning" means four in *their* morning, and Europe/Berlin has daylight saving
 * — a spring-forward day is 23 hours long and an autumn-back day is 25. Both
 * are checked, because both are ordinary and neither is reproducible in the UTC
 * container these checks otherwise run in.
 */

process.env.TZ = "Europe/Berlin";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { DAY_START_HOUR, addDays, dayOf, inSmallHours, parseDayStartHour, todayISO, toISODate } from "../lib/dates";

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) failures++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
};

const at = (iso: string) => new Date(iso);

function main() {
  ok("the shipped timezone is the one under test", Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/Berlin");

  // ── The boundary itself ──
  console.log("\na day runs 04:00 to 04:00");

  const cases: [string, string][] = [
    ["2026-09-05T20:00:00", "2026-09-05"],
    ["2026-09-05T23:59:00", "2026-09-05"],
    ["2026-09-06T00:00:00", "2026-09-05"],
    ["2026-09-06T00:30:00", "2026-09-05"],
    ["2026-09-06T03:59:00", "2026-09-05"],
    ["2026-09-06T04:00:00", "2026-09-06"],
    ["2026-09-06T04:01:00", "2026-09-06"],
    ["2026-09-06T12:00:00", "2026-09-06"],
  ];
  for (const [iso, expected] of cases) {
    ok(`${iso.slice(11, 16)} on the 6th is ${expected.slice(-2)}`, dayOf(at(iso)) === expected, dayOf(at(iso)));
  }

  // The point of the whole thing, stated as the user did.
  ok(
    "a glass of water at 00:30 lands on the same day as one at 23:00",
    dayOf(at("2026-09-06T00:30:00")) === dayOf(at("2026-09-05T23:00:00")),
  );
  ok(
    "and one at 05:00 does not",
    dayOf(at("2026-09-06T05:00:00")) !== dayOf(at("2026-09-05T23:00:00")),
  );

  // ── Nothing is lost at a rollover ──
  console.log("\nthe boundary survives every kind of rollover");

  const rollovers: [string, string, string][] = [
    ["month", "2026-10-01T02:00:00", "2026-09-30"],
    ["year", "2027-01-01T01:00:00", "2026-12-31"],
    ["a 28-day February", "2026-03-01T03:30:00", "2026-02-28"],
    ["a leap day", "2028-03-01T02:00:00", "2028-02-29"],
    ["into a leap day", "2028-02-29T01:00:00", "2028-02-28"],
  ];
  for (const [what, iso, expected] of rollovers) {
    ok(`across ${what}`, dayOf(at(iso)) === expected, dayOf(at(iso)));
  }

  // ── Daylight saving ──
  // The reason TZ is pinned. In 2026 Europe/Berlin springs forward on 29 March
  // (02:00 → 03:00, a 23-hour day) and falls back on 25 October (03:00 → 02:00,
  // a 25-hour day). The turnover has to stay at four o'clock through both.
  console.log("\nand it survives daylight saving");

  const dst: [string, string, string][] = [
    ["the short night, before the turnover", "2026-03-29T00:30:00", "2026-03-28"],
    ["the short night, after the skip", "2026-03-29T03:30:00", "2026-03-28"],
    ["the short morning", "2026-03-29T05:00:00", "2026-03-29"],
    ["the long night, before the turnover", "2026-10-25T00:30:00", "2026-10-24"],
    ["the long night, after the repeat", "2026-10-25T03:30:00", "2026-10-24"],
    ["the long morning", "2026-10-25T05:00:00", "2026-10-25"],
  ];
  for (const [what, iso, expected] of dst) {
    ok(what, dayOf(at(iso)) === expected, dayOf(at(iso)));
  }

  // ── Every hour belongs to exactly one day ──
  // The shape of check that caught the Monday bug: asked of every hour rather
  // than of the few a person thinks to try. A day that gains or loses an hour to
  // daylight saving is fine; a day that gains or loses a *day* is not.
  console.log("\nevery hour of a season maps to one day, in order");

  for (const [label, from] of [
    ["an ordinary fortnight", "2026-09-01T00:00:00"],
    ["the spring-forward week", "2026-03-25T00:00:00"],
    ["the autumn-back week", "2026-10-21T00:00:00"],
    ["the turn of the year", "2026-12-28T00:00:00"],
  ] as [string, string][]) {
    const start = at(from);
    const hours = 14 * 24;
    let prev: string | null = null;
    const jumps: string[] = [];
    const offHour: string[] = [];
    const seen = new Set<string>();

    for (let h = 0; h < hours; h++) {
      const now = new Date(start.getTime() + h * 3_600_000);
      const day = dayOf(now);
      seen.add(day);
      if (prev !== null && day !== prev) {
        if (day !== addDays(prev, 1)) jumps.push(`${prev} → ${day}`);
        if (now.getHours() !== DAY_START_HOUR) offHour.push(`${day} at ${now.getHours()}:00`);
      }
      prev = day;
    }

    ok(`${label}: never skips or repeats a day`, jumps.length === 0, jumps.join(", "));
    ok(`  …and always turns over at ${DAY_START_HOUR}:00`, offHour.length === 0, offHour.join(", "));
    // 14 days of hours cover 14 or 15 logical days depending where the sweep
    // starts relative to the boundary. Anything else means hours went missing.
    ok(`  …and covers the fortnight exactly once`, seen.size === 15, `${seen.size} days`);
  }

  // ── The one window where the app disagrees with the calendar ──
  console.log("\nthe app says so when its date is not the calendar's");

  let wrong = 0;
  const start = at("2026-09-01T00:00:00");
  for (let h = 0; h < 14 * 24; h++) {
    const now = new Date(start.getTime() + h * 3_600_000);
    const disagrees = dayOf(now) !== toISODate(now);
    if (disagrees !== inSmallHours(now)) wrong++;
  }
  ok("inSmallHours is true exactly when the two dates differ", wrong === 0, `${wrong} hours differ`);

  ok(
    "and the app is never ahead of the calendar",
    Array.from({ length: 14 * 24 }, (_, h) => new Date(start.getTime() + h * 3_600_000)).every(
      (d) => dayOf(d) <= toISODate(d),
    ),
  );

  // ── The configured hour ──
  // Four is the default, not the rule: the right boundary is a fact about the
  // person. A bad value has to fail safe rather than poison every date in the
  // app — `Number("five")` is NaN, and a NaN hour makes `dayOf` return
  // "NaN-NaN-NaN" everywhere at once.
  console.log("\na bad DAY_START_HOUR cannot poison every date in the app");

  ok("the default is four", parseDayStartHour(undefined) === 4);
  ok("an empty value is the default", parseDayStartHour("") === 4 && parseDayStartHour("   ") === 4);
  ok("a word is the default, not NaN", parseDayStartHour("five") === 4);
  ok("a real hour is taken", parseDayStartHour("5") === 5 && parseDayStartHour("0") === 0);
  ok("a fraction is truncated", parseDayStartHour("4.7") === 4);
  ok("negatives clamp to midnight", parseDayStartHour("-3") === 0);
  ok("and nothing turns the day over in the evening", parseDayStartHour("23") === 11 && parseDayStartHour("999") === 11);
  ok(
    "every accepted value is an hour of the morning",
    ["0", "1", "4", "5", "11", "-1", "40", "abc", "", undefined].every((v) => {
      const h = parseDayStartHour(v as string | undefined);
      return Number.isInteger(h) && h >= 0 && h <= 11;
    }),
  );

  // And the variable has to actually reach `dayOf`. Asserted in a child process
  // with the env set, because the constant is read once at import: recomputing
  // the shift here by hand would prove only that this check can subtract.
  const probe = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "arachne-dayhour-")),
    "probe.mts",
  );
  fs.writeFileSync(
    probe,
    `const { dayOf, DAY_START_HOUR } = await import(${JSON.stringify(path.resolve("lib/dates.ts"))});\n` +
      `console.log(DAY_START_HOUR + " " + dayOf(new Date("2026-09-18T04:30:00")));\n`,
  );
  const run = (hour: string | undefined) =>
    execFileSync("npx", ["tsx", probe], {
      encoding: "utf8",
      env: { ...process.env, TZ: "Europe/Berlin", ...(hour === undefined ? {} : { DAY_START_HOUR: hour }) },
    }).trim();

  // 04:30 is after a 4:00 boundary and before a 5:00 one, so the two configs
  // have to disagree about which day it is.
  ok("unset, 04:30 is already the new day", run(undefined) === "4 2026-09-18", run(undefined));
  ok("set to 5, the same moment is still yesterday", run("5") === "5 2026-09-17", run("5"));
  ok("set to 0, the boundary is midnight again", run("0") === "0 2026-09-18", run("0"));
  ok("and a nonsense value falls back to four", run("five") === "4 2026-09-18", run("five"));

  fs.rmSync(path.dirname(probe), { recursive: true, force: true });

  // ── The live function ──
  console.log("\nand the live one agrees with the rule");
  ok("todayISO is dayOf(now)", todayISO() === dayOf(new Date()));

  console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
