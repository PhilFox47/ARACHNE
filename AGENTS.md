# AGENTS.md

Instructions for coding agents working in this repository. See also `README.md` (running,
backups, environment variables) and `docs/` (design history, plan extraction, Docker
troubleshooting). This file is the one agents should read first.

## What this is

ARACHNE is a private, single-user, self-hosted 12-month fitness console. One person, one
password, one Docker container. There is no multi-tenant anything — no user table, no roles,
no public deployment story. Keep that in mind before reaching for patterns that exist to solve
problems this app doesn't have.

Stack: Next.js 15 (App Router) · TypeScript, strict · Tailwind 4 · SQLite via better-sqlite3 +
Drizzle · Recharts · PWA.

## The source of truth is a document, not you

`spiderman-transformation-12-monate.md` (German) is the actual fitness plan a real person is
following. `docs/PLAN-EXTRACT.md` documents what was pulled from it. **If a number is in the
document — a calorie target, a rep range, a checkpoint — use it. Do not invent fitness,
nutrition, or training numbers.** Where a number had to be derived because the document doesn't
state one, it's marked `EXTRAPOLATED` in a comment at the point it's introduced, with the
reasoning (e.g. a public health guideline, or a formula applied to a stated figure). Grep for
`EXTRAPOLATED` before adding a new one, to see the existing standard for how that's written up.

`lib/plan.ts` owns everything structural from the document: phases, calorie targets, the weekly
session structure, checkpoints, trial targets. Nothing else hardcodes a fitness number.

## The user has real data. Never break it.

This is not a toy project with disposable seed data — someone is actively using this app to run
their own year-long transformation, with months of real logged data. Any change that touches the
schema **must** carry every existing database forward without loss.

- Migrations are inline and versioned via `PRAGMA user_version` in `lib/db/index.ts`
  (`MIGRATIONS` array, run under `BEGIN IMMEDIATE`).
- **Never edit a migration that has already shipped.** Once a migration is in `MIGRATIONS`, its
  historical shape is frozen — write a new one instead, even to fix a bug in an old one.
- **Never import from `lib/` inside a migration function.** A migration has to keep working
  exactly as written no matter how the rest of the app changes around it later. Write SQL
  directly, not through application code that might itself change.
- `SCHEMA_VERSION` (`lib/db/index.ts`) is the count of migrations and moves independently of the
  app version in `lib/version.ts`. A schema change doesn't require a version bump category of its
  own, but every migration needs a matching entry in `scripts/check-migrations.ts`.
- `npm run check` includes `check-migrations.ts`, which builds a database at *every* historical
  schema version, migrates it forward to current, and fails if any row is lost or any table
  disappears unexpectedly. **A change that cannot carry an existing database forward does not
  ship.** Run this before you consider a schema change done, not just before committing.

## Derive on read; don't cache state you can compute

The house style is to store facts and compute everything else on read, rather than storing
derived state that can drift out of sync.

- No stored XP, no stored "unlocked" table, no stored streak counters. `lib/game.ts` and
  `lib/skills.ts` compute all of that from the raw logged rows every time.
- **Store "done at", never "done".** A boolean that means "did you do this today" needs a
  midnight job to reset it, and that job breaks the moment the container is asleep at midnight,
  runs twice, or crosses a timezone. Storing a timestamp instead makes the reset free: a new day
  simply has no row for it yet. This is why there's no scheduled reset job anywhere in the app.
- The two deliberate exceptions: `briefings` (the row costs a model call, so it's written once a
  day and must stay stable through that day) and the `chores` / `chore_log` tables (the log is
  the source of truth — you tick a chore *for* a date, you don't set a flag).
- If you're about to add a new stored/cached value, ask whether it can be computed from
  `exercise_logs`, `food_entries`, `movement_feedback`, etc. on the fly instead. It almost always
  can, and almost always should be.

## Dates, weeks, and the day boundary

- `lib/dates.ts` is the *only* place a `Date` becomes a day string. Everything that needs "what
  day is it" goes through `todayISO()` / `dayOf()`, not a fresh `new Date().toISOString()`.
- **A day is not midnight to midnight.** It runs from `DAY_START_HOUR` (default 04:00, configurable
  via env, shown in Settings) to the same hour the next day, local time (`TZ`). Logging water,
  chores, or food between midnight and the boundary belongs to the day that hasn't turned over
  yet. See `README.md § When a day ends` for the full reasoning.
- Weeks run **Monday → Sunday** everywhere, via `mondayOf()` in `lib/dates.ts`. This was the
  subject of a real bug (a week anchored on the start date rather than its Monday, silently
  losing every Monday's data) — don't reintroduce ad hoc week math elsewhere.
- `scripts/check-day.ts` walks entire years hour-by-hour, including both DST transitions in the
  configured timezone, asserting the boundary never skips or repeats a day. Run it (via `npm run
  check`) after touching anything date-related.

## Server/client boundary — this will break the build if you get it wrong

- A `"use server"` module may **only** export async functions. If you need a synchronous read
  helper alongside server actions, put it in a plain `lib/` module and import that from both the
  action file and the page — don't try to export a non-async helper from an actions file.
- **A client component (`"use client"`) must never import — even transitively — a module that
  imports `lib/db`.** `better-sqlite3` is a native Node module; if webpack has to resolve it for
  the client bundle, the build fails with `Module not found: Can't resolve 'fs'`. This has bitten
  this codebase more than once, including through *type-only* imports that later gained a real
  value export. If a client component needs a pure calculation that a server module also uses
  (date math, a scoring formula, a progression rule), factor it into its own dependency-free
  module (see `lib/prescription.ts`, `lib/feedback.ts`, `lib/bodyfat.ts` for the pattern) rather
  than importing it from a module that also touches the database.
- `instrumentation.ts` cannot import `better-sqlite3` either, for a related reason: this app ships
  middleware, so Next compiles `instrumentation.ts` for the edge runtime too, and a
  `NEXT_RUNTIME` guard doesn't help because webpack has already tried to resolve the import by
  then. Background schedulers (`lib/briefingSchedule.ts`, `lib/backupSchedule.ts`) are instead
  armed from the root layout on first server-side request.

## Testing

There is no unit test framework (no Jest/Vitest). Verification is:

1. **`npm run check`** — a suite of narrative TypeScript scripts in `scripts/check-*.ts`, each
   proving one thing end-to-end against a real (temp-file) SQLite database: migrations carry data
   forward, the skill tree / mastery logic, FUEL/food logic, game/challenge-window logic, the day
   boundary. Read a couple of these before writing a new one — they're written as explanations of
   the bug they exist to prevent, not just assertions, and new checks should follow that style.
   When you fix a real bug, write the check that would have caught it, in the same file if one
   already covers that area.
2. **`npm run typecheck`** — `tsc --noEmit` for the app plus `tsconfig.scripts.json` for the
   `scripts/` directory.
3. **`npm run build`** — also the only reliable way to catch the client/server boundary violation
   above; `tsc` alone won't catch it.
4. **Manual verification in a real browser** for anything UI-facing, at a phone viewport
   (**393×852** is the reference size used throughout this project's history — this is a
   mobile-first app, ~80% of usage is on a phone) — take a screenshot and actually look at it,
   don't just assert the DOM.

Prefer reproducing a reported bug with a small script *before* changing code, and turning that
reproduction into a permanent check rather than deleting it once the fix works. Several real bugs
in this codebase were only found by simulating a long run (a full year, 52 weeks) or a full
migration chain rather than by reading the code — when in doubt, run it rather than reason about
it.

## Versioning

`lib/version.ts` holds `APP_VERSION` and a `RELEASES` array (newest first) that's rendered in the
app's own Settings screen — the app can say what changed without anyone opening a laptop.
`CHANGELOG.md` carries the same information in more detail. Update both together.

- **MAJOR** — a fundamental change (the plan model itself, or a break existing data can't survive).
- **MINOR** — a large change: a new screen, a reworked feature, anything that changes how the app
  is used.
- **PATCH** — a fix, tuning, or copy change nobody needs telling about.

`SCHEMA_VERSION` (see above) is independent of `APP_VERSION` — bumping one never implies bumping
the other.

## In-world vocabulary

The app has a consistent Spider-Man-adjacent naming scheme for its own concepts, used in UI copy,
comments, and identifiers alike: **HQ** (home screen), **PATROL** (a training session), **FUEL**
(nutrition logging), **VITALS** (weight/measurements), **THE TRIAL** (periodic fitness test),
**SUIT CHECK** (progress photos), **SENSE** (contextual nudges), **ABILITIES**, **THE WEB** (skill
tree), **LOW PROFILE WEEK** (deload), **REFUEL WEEK** (diet break), **PATROL STREAK**,
**MAINTENANCE** (household chore tracking). Keep using these terms rather than generic
equivalents ("workout", "meal log") in anything user-facing.

## Visual design

Full detail in `docs/DESIGN.md`. The load-bearing rule: colour is semantic, not decorative.
Crimson (`#D42A3F`) means effort, achievement, or a warning — a value out of its target range.
Cobalt (`#2B5CB8`) means data, history, or a calm state — the same value inside range. A chart
line changes colour when it crosses a threshold; it's never crimson or cobalt as a stylistic
choice. Base `#0A0D16`, panel `#141A2B`, text `#EDEBE8`, muted `#8A92A6`.

## Git

- Working branch for this project's agent sessions: `claude/arachne-fitness-app-t5i8mv`. Create it
  if it doesn't exist locally; don't push to any other branch without being asked.
- Commit messages in this repo are written as short essays explaining *why*, not just *what* —
  look at `git log` for the standing of it (each commit message walks through the bug or the
  request, the fix, and what was verified). Match that register rather than a one-line summary.
- **Do not open a pull request unless explicitly asked to.** Commit and push to the working branch
  is the default; a PR is a separate, explicit request.
- Do not commit `.env`, anything under `data/`, or images. `.gitignore` already covers the
  standard ones — check it before adding a new kind of local artifact.

## A few things not to do

- Don't add a state-management library, a client-side fetch/cache layer, or an API route for
  something a Server Action can do. Mutations are Server Actions; API routes exist only where
  something external needs a URL (health check, photo serving, the meal-analysis endpoint).
- Don't reach for `next-auth` or any multi-user auth scheme. Auth is one password
  (`APP_PASSWORD`) and a signed session cookie (`lib/auth.ts`, `lib/session-cookie.ts`). This is
  deliberate, not a placeholder.
- Don't call the Nano-GPT (or any) vision/LLM API directly from a client component or hardcode a
  model ID. All calls go through `/api/analyze-meal` server-side; the model is read from settings
  (`lib/nanogpt.ts`), never hardcoded, so it can be changed from the Settings screen with no
  redeploy.
- Don't add a scheduled/cron reset job. See "derive on read" above — if you think you need one,
  the data model is probably wrong.
