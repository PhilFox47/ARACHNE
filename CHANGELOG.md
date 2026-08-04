# Changelog

Versions follow `MAJOR.MINOR.PATCH`:

- **MAJOR** — a fundamental change. The plan model itself, or a break existing data cannot be
  carried across. Not expected.
- **MINOR** — a large change. A new screen, a new part of the plan, a reworked feature.
- **PATCH** — a small change. Fixes, copy, tuning.

`SCHEMA_VERSION` (shown next to the app version in SETTINGS) moves on its own rules: it is the
count of migrations, and goes up by exactly one per shipped schema change. A version bump does not
imply a schema bump, or the reverse.

**Every database from every earlier version must open.** `npm run check` builds a database at each
historical schema version, migrates it forward, and fails if anything is lost. A change that cannot
carry an existing database forward does not ship.

---

## 1.2.0 — 2026-08-04

THE WEB — every movement explained, and a skill tree that unlocks.

**A movement catalogue** (`lib/movements.ts`). Every exercise the plan can prescribe now carries a
summary, a setup, the execution, what specifically goes wrong on it, cues, what it trains, its
prerequisites and the bar that counts as mastered. One file, three readers: you, the progression
engine, and the model — which previously got a name and a set count and was programming from
whatever it happened to associate with the words.

**THE WEB**, from PATROL. Twelve strands, each running from the version anyone can do to the one the
year is aiming at. Nodes are locked, open, being worked or mastered, all derived from your logs on
read — there is no unlock table, so correcting a mis-logged set corrects the tree and a restored
backup restores it.

**Cross-strand prerequisites.** A movement can now be gated by a capacity from somewhere else, which
is what makes this a tree rather than twelve parallel chains: pike push-ups elevated needs 30 s of
wall handstand, hanging knee raises needs a 30 s dead hang, diamond push-ups need a 45 s plank. The
gate explains itself on the locked node.

**One question, once.** The first time you do a movement: controlled, hard, or did something hurt.
The session RPE says how hard the session was; this says whether a movement was under control, which
is the one thing the app cannot see from outside. Two "it hurt" answers and the movement steps back
down until the level below is clean again (schema v11).

**Rust.** Three weeks with nothing logged on a strand and the first session back opens a level
lower. Strength does not fall off a cliff in a fortnight; form does, and form is what the level above
asks more of.

Also: the model now receives a full brief on every movement in front of it — what it is, what it
trains, how it executes, what goes wrong, and which variations sit either side — plus where you
stand on each strand and whether you are returning from a break. `npm run check` gained catalogue
invariants: every movement resolves from its own name and its aliases, tiers are dense from zero,
and no prerequisite points at its own strand.

## 1.1.0 — 2026-08-04

Calendar weeks, versioning, and a gentler first fortnight.

**Weeks run Monday to Sunday.** Week 1 is the calendar week containing day 0, not a rolling
seven-day block from it. Starting on a Tuesday no longer produces a week that begins on a Tuesday;
the days before day 0 appear dimmed and marked *Before day 0*. `photos.week_index` is recomputed
from each photo's own date (schema v10) — where two old weeks collapse into one slot, the later
shot keeps it.

**The baseline sweep starts at the bottom of every ladder.** Patrol 1 opened on the plan's default
variation, which handed a beginner pike push-ups — hard, and easy to do in a way that hurts. Ladder
probes now resolve to the easiest rung when nothing is logged and climb one rung per clean 3×12, so
the fortnight walks up to your limit instead of starting above it.

**A movement is never prescribed more than one rung above what you have logged.** The old rule
clamped to one rung either side of what the plan asked, which let the calendar drag you upward:
reach Phase 3 having missed most of Phase 2 and it would have offered archer push-ups on the
strength of a chair push-up. Harder variations now unlock rather than arrive.

**Every ladder rung carries a technique warning** — what specifically goes wrong on it, shown next
to the set you are about to do. A rung is not just harder than the one below; it is harder to do
correctly, and that is not visible from the inside.

Also: the version and schema version are shown in SETTINGS, with the release notes behind them.
`npm run check` verifies every upgrade path and that each ladder rung can be read back out of the
logs. Holds advance on seconds rather than never advancing at all.

## 1.0.0 — 2026-08-03

First run. HQ, PATROL, FUEL, VITALS, JOURNEY, SUIT CHECK, THE TRIAL and SENSE; onboarding; the
twelve-month course fitted to your own goal and timeframe; the five-patrol baseline sweep; rolling
daily backups.
