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
export const APP_VERSION = "1.1.0";

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
