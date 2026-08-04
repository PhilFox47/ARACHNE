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

## 1.5.5 — 2026-08-04

Removes the Docker Hub round-trip that has to succeed before the build starts.

The build now fails at **step 3** — before a line of the Dockerfile is parsed:

```
failed to fetch oauth token: Post "https://auth.docker.io/token": net/http: TLS handshake timeout
```

That step exists only because of `# syntax=docker/dockerfile:1`. The directive names a *tag*, so
BuildKit must ask Docker Hub which digest it points at on every build, and that needs an OAuth token
from `auth.docker.io` first. Docker's built-in frontend supports everything used here — cache
mounts, ARG in FROM, `COPY --from`, `COPY --chown` — so the external one bought nothing and cost a
mandatory network call. It is gone.

This also confirms the diagnosis behind v1.5.4 and generalises it: **this host's outbound HTTPS from
Docker is unreliable**, hanging at the TLS handshake for some hosts while others answer fine. That
is why the npm registry could finish in four seconds while `prebuild-install` sat on github.com for
ten minutes, and why no other container shows it — nothing else reaches those hosts. The usual cause
on Windows is an MTU mismatch, and `docs/DOCKER-TROUBLESHOOTING.md` now documents the check and the
fixes.

Nothing here is an application problem. The Dockerfile changes only reduce how many external hosts
have to be reachable for a build to succeed.

## 1.5.4 — 2026-08-04

The actual cause of the hanging build: `prebuild-install` fetching from GitHub.

The previous three releases made the install *faster* and never touched what was *stopping* it. The
log that gave it away showed every package downloaded inside four seconds — the npm cache mount
working — and then ten minutes of complete silence.

Only three installed packages run install scripts, and the one that reaches the network is
better-sqlite3: `prebuild-install || node-gyp rebuild`. **prebuild-install fetches its binary from
github.com, not from the npm registry**, using `simple-get` with no timeout configured anywhere. If
GitHub is slow or unreachable from inside the Docker network, that call never returns and never
errors. A fast npm registry proves nothing, because it is a different host — and this is why no
other container does it: nothing else here has a native module with a prebuilt download.

`npm_config_build_from_source=true` makes prebuild-install skip the download outright and hand
straight to node-gyp, which uses proper timeouts and retries and therefore fails loudly instead of
hanging. Verified: it prints "not attempting download", compiles in 1 m 51 s, and the resulting
binary opens a database and runs a query. node-gyp's header cache is mounted so that cost is paid
once.

`npm run check` now fails if the flag is removed, or if the compiler it depends on is.

## 1.5.3 — 2026-08-04

Stops installing 165 MB of binaries that cannot run.

`next`, `sharp`, `lightningcss` and Tailwind's oxide each ship one native binary per platform as
optional dependencies, and npm normally skips the ones whose `os`, `cpu` or `libc` do not match.
It cannot here: `package-lock.json` predates npm recording `libc`, so a glibc image installs the
musl builds as well — 165 MB across five packages, `@next/swc-linux-x64-musl` alone being 136 MB.
Regenerating the lockfile does not add the field and `npm ci --libc=glibc` is ignored for the same
reason; both were tried. They are pruned after the install instead, derived from the running
platform rather than a hardcoded list, so it stays correct if the base image ever changes.
node_modules goes from 628 MB to 463 MB, and a build against the pruned tree was verified.

## 1.5.2 — 2026-08-04

Docker builds off Alpine. `npm ci` went from minutes to seconds.

v1.5.1 stopped the dependency layer being invalidated on every release, which was real but was only
half of it: the layer was also expensive to rebuild in the first place. **better-sqlite3 ships
prebuilt binaries for glibc and none for musl**, so on `node:22-alpine` every cache miss handed the
whole SQLite amalgamation to g++ and compiled it single-threaded. Measured here: a cold,
cache-cleared `npm ci` on glibc takes **12 seconds** and downloads a 2 MB `.node` file. The same
install on Alpine was several minutes of compiler.

The base image is now `node:22-slim`. That costs roughly 40 MB of image and removes the compile
entirely — the right trade for something rebuilt far more often than it is pulled. `python3 make g++`
stay in the deps stage as a fallback in case a prebuild ever 404s, and are discarded with that stage.

Also: `--foreground-scripts` makes install scripts print, because a native build with output
suppressed is a silent void that is indistinguishable from a hang while you are watching it. The
healthcheck uses `node` instead of `wget`, which is not guaranteed to exist in a slim base, and
zombie reaping moved from a `tini` package to Docker's own init (`init: true` in compose). Apt's
downloaded packages are cached across builds too.

`npm run check` now fails if the base image goes back to Alpine, if the healthcheck reaches for
`wget` or `curl`, or if the init process disappears.

## 1.5.1 — 2026-08-04

The Docker build stopped recompiling SQLite on every release.

`RUN npm ci` was taking ninety seconds or more on builds where **not one dependency had changed** —
`package-lock.json` has not moved since the first commit. The deps stage copied `package.json`, and
that file changes on every release because the version bumps, so the layer was invalidated each
time. `npm ci` then rebuilt better-sqlite3 from source, which Alpine has to do because musl has no
prebuilt binary, over three characters in a string the installer never reads.

The stage now copies only the lockfile and generates `package.json` from its root entry, which
carries the name, version and both dependency sets — everything `npm ci` consults. Change a
dependency and the layer rebuilds as it must; bump the version or edit a script and it stays cached.
The real `package.json` arrives with `COPY . .` in the build stage, so the build sees the file as
written.

Also: the npm download cache is mounted across builds, `--no-audit` removes a network round-trip
that runs *after* the install finishes and is where a build appears to hang, `npm_config_jobs=max`
lets node-gyp use every core when it does have to compile, and Next's own cache is mounted so an
incremental rebuild is not a cold one. `npm run check` now fails if the deps stage starts copying
`package.json` again, or if the lockfile drifts out of sync with `package.json`.

## 1.5.0 — 2026-08-04

FUEL reads more than one photo, and shows its working.

**Several photos, one meal** (schema v13). The plate, the packet, the back of the packet, the recipe
you cooked from. You tag what each one is and the model is told — so a Nährwerttabelle is read as a
table rather than guessed at as a picture of food with writing on it, and a recipe is read for its
servings. They are explicitly one meal from several angles, never summed.

Photos can also be added to an entry after the fact. The label you forgot to shoot is usually a far
bigger correction than anything you could type into the fields.

**Portions are scaled, not copied.** This is the change that should move the numbers most. A label
states values per 100 g; the pack says 500 g; you ate the pot. The estimate should be 310 kcal, not
62, and the prompt now says so in those terms — along with what to do about a "pro Portion" column
that doesn't match your portion, a recipe that serves four, and a menu photo that tells you what the
dish is but nothing about how much of it arrived. Where the packaging and the plate disagree, the
plate wins. `portion` now states what was actually scaled to — "whole 500 g pot", "1 of 4 servings" —
because it is the number everything else is derived from.

**Suspected ingredients**, for meals. What the model thinks went in, biggest first, with amounts in
ordinary words — "2 eggs", "a splash" — rather than grams to a decimal place the estimate does not
have. Editable, and a list you have corrected is marked as yours. Snacks don't get one: breaking a
coffee into water and beans says nothing the description didn't.

**Re-analyse**, which is what makes correcting the list worth doing. It takes the name, the portion
and the ingredients, and **not the numbers**. A model handed its own previous answer adjusts it — a
900 kcal mistake comes back as 850 — so the figures are recomputed from the description instead of
nudged. Pending edits are saved first, and a list you confirmed survives the run rather than being
overwritten by the model's fresh guess at it.

Also: `lib/meal.ts` splits the photo and ingredient vocabulary out of `lib/vision.ts`, because a
client component importing the word "label" was pulling `node:crypto` into the browser bundle.
Deleting an entry now removes every photo rather than only the cover, and deleting a cover promotes
the next one so no list ever renders a thumbnail whose file is gone. `npm run check` gained a third
suite covering all of it — including an assertion that no previous figure can leak into a
re-analysis prompt, which is one line away from silently regressing.

## 1.4.0 — 2026-08-04

Every movement the plan can prescribe is now on THE WEB, and the hard ones have something under
them.

**Thirty-eight movements were in the plan and in no strand.** The shoulder roll was the one that
gave it away: the document calls it *the foundational parkour skill and your insurance against
injury in everything that follows*, prescribes it on the first Friday, and the app had it in a
session with no explanation, no preparation and nothing the model could be told about it. Cartwheels,
kip-ups, wall runs, burpees, the whole Tuesday range block and every warm-up were in the same
position. The catalogue went from 45 entries to 89.

**The shoulder roll is a five-level strand**, and the levels are the document's own: *"Erst langsam
aus der Hocke, dann aus dem Stand, dann aus dem Gehen."* Rock-backs and a roll from a kneel sit under
those three, because a crouch is already a fall for someone who has never rolled. Every level says
what the roll actually is — chin to chest, over the shoulder blade and out at the opposite hip — and
what it costs to get wrong.

**Eight new strands**: falling, tumbling, getting up, obstacles, spine, hips, lunging and the engine.
They are gated on each other the way the movements actually depend on each other: cartwheels need
30 s of wall handstand *and* a roll, vaults need a roll, the wall run needs 3 pull-ups, the kip-up
needs a hollow hold, burpees need 8 floor push-ups. A strand can now be shut as a whole — there is
no easier cartwheel to offer instead — and when one is, the session says which movement is waiting
and on what, rather than quietly not containing it.

**Groundwork.** Warm-ups, cooldowns, mobility drills and the three dumbbell lifts are on THE WEB and
fully explained, but never locked and never moved. Arm circles do not gate cat-cow, and a warm-up you
have to earn is a warm-up nobody does.

**A strand with nothing logged on it opens at its easiest movement**, not at whatever the plan named.
This is v1.1.0's pike push-up fix generalised: that one fixed the baseline fortnight, but every
strand the fortnight does not reach still arrived at the plan's own variation the first time it
appeared. That is why "Shoulder roll" meant rolling from a walk in week one.

Also: `npm run check` now fails the build if the plan can prescribe a movement the catalogue doesn't
know, so this cannot come back. It also proves no strand waits on itself however far round, and that
no gate asks in a unit its strand doesn't measure. The Tuesday range work split into spine and hips
because three different capacities were collapsing onto one rung. 896 checks.

## 1.3.0 — 2026-08-04

Mastery takes repeating, and placement can be reset.

**A movement is no longer mastered the first time the number happens.** The bar is now two sets that
clear it *within one session*, on *two separate days* — the document's own rule was "only advance at
a clean 3×12", and one set of twelve is a good day rather than a level. Two sets rather than three
because the baseline fortnight prescribes two, and a bar the sweep cannot clear would leave every
strand stuck at the bottom; `npm run check` now fails if any movement asks for more than the
fortnight can give it.

**A session where you reported that something hurt does not count towards mastering it**, whatever
the reps said. The point of the bar is that the movement is under control, not that the number
happened — which is the same reason the feel check exists at all.

**THE WEB can be reset**, whole or one strand at a time, from a button on the summary panel. This is
for the case the app created: a first patrol logged before the ladder knew anything about you, on a
variation you had never done, leaving a strand opening halfway up.

**A reset deletes nothing** (schema v12). It writes a line — sets logged before it stop counting
towards the tree, and stay in your history, your streak and every chart. That makes it reversible,
and there is an Undo on the screen afterwards. Hold targets seeded off a tested maximum respect the
same line, so a reset strand stops prescribing planks seeded off the reading you just disregarded.
Pain reports deliberately survive a reset: "this shape hurts me" is not a number you can re-take.

Also: nodes show clean sessions banked rather than only a best number, and the model's brief now
states the whole mastery rule instead of the bar alone. Log reading moved into one file
(`lib/skills.ts`) — THE WEB and the progression engine had been aggregating the same rows twice, and
were one edit away from disagreeing about what you had done. `npm run check` gained a second half
that proves both rules against a real database.

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
