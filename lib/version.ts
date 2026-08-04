/**
 * The build's version, and the rule for changing it.
 *
 *   MAJOR  a fundamental change — the plan model itself, or a break that
 *          existing data cannot be carried across. Not expected.
 *   MINOR  a large change. A new screen, a new part of the plan, a reworked
 *          feature, anything that changes how the app is used.
 *   PATCH  a small change. Fixes, copy, tuning, anything you would not need to
 *          be told about.
 *
 * `SCHEMA_VERSION` in lib/db moves independently and on its own rules: it is
 * the count of migrations, and it only ever goes up by one per shipped schema
 * change. A version bump does not imply a schema bump or the reverse.
 */
export const APP_VERSION = "1.3.0";

/** Bumped on the release that introduced it, for the settings screen. */
export const RELEASED = "2026-08-04";

export interface ReleaseNote {
  version: string;
  date: string;
  /** Which part of the rule this release exercised. */
  kind: "major" | "minor" | "patch";
  headline: string;
  changes: string[];
}

/**
 * Newest first. Kept in the app rather than only in CHANGELOG.md so the phone
 * can answer "what changed?" without a laptop — this is the only place the
 * running build can be identified from.
 */
export const RELEASES: ReleaseNote[] = [
  {
    version: "1.3.0",
    date: "2026-08-04",
    kind: "minor",
    headline: "Mastery takes repeating, and placement can be reset",
    changes: [
      "A movement is mastered at two sets that clear its bar in one session, on two separate days — not the first time the number happens. One good set is a good day.",
      "A session where you reported that something hurt no longer counts towards mastering it, whatever the reps said.",
      "THE WEB can be reset: the whole tree or one strand at a time, so a first patrol logged before the ladder knew anything about you doesn't leave a strand opening halfway up.",
      "A reset deletes nothing. Every set stays in your history and still counts towards your streak — THE WEB just stops reading the ones before the line, and there is an Undo.",
      "Each node now shows how many clean sessions it has banked rather than just your best number.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-04",
    kind: "minor",
    headline: "THE WEB — every movement explained, and a skill tree that unlocks",
    changes: [
      "A movement catalogue: what each exercise is, how to set it up, how to do the rep, what goes wrong on it, and what it trains.",
      "THE WEB, reachable from PATROL — twelve strands from the version anyone can do to the one the year is aiming at, each node locked, open, being worked or mastered.",
      "Movements can be gated by a different strand: pike push-ups elevated needs 30 s of wall handstand, hanging knee raises needs a 30 s dead hang.",
      "The first time you do a movement, one question — controlled, hard, or did something hurt. Say it hurt twice and the movement steps back down.",
      "Come back after three weeks away and the first session opens a level lower.",
      "Every movement in a session is now described to the model before it is asked to program anything.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-04",
    kind: "minor",
    headline: "Calendar weeks, versioning, and a gentler first fortnight",
    changes: [
      "Weeks run Monday to Sunday everywhere. Starting mid-week no longer produces a week that begins on a Tuesday; day 0's calendar week is week 1, with the days before it marked as not-yet-started.",
      "The baseline sweep starts every movement at the bottom of its ladder and walks up, rather than opening on the plan's default variation.",
      "A movement is never prescribed more than one rung above what you have actually logged.",
      "This screen now shows the version, and every database is migrated forward on open.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-08-03",
    kind: "major",
    headline: "First run",
    changes: [
      "HQ, PATROL, FUEL, VITALS, JOURNEY, SUIT CHECK, THE TRIAL and SENSE.",
      "Onboarding, the twelve-month course fitted to your own goal and timeframe, and the five-patrol baseline sweep.",
      "Rolling daily backups, 31 kept, importable from the settings screen.",
    ],
  },
];
