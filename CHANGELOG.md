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

## 1.7.0 — 2026-08-05

A clock for the holds, so a plank does not need a second device.

Every timed movement — planks, hollow holds, wall sits, dead hangs, the deep
squat hold, wall handstands, the bear crawl hold, and every max attempt in the
baseline fortnight — now has a timer on its set row. Tap it, get into position
during a three-second lead-in, and the seconds go straight into the set when you
stop. No stopwatch, no typing a number in afterwards.

Four things about it, all decided by the fact that you are on the floor and
cannot look at the screen:

**It counts up, not down.** The mastery bar rewards going past the target — that
is the entire progression mechanism for a timed movement, since a hold has no
reps to add. A countdown would hide how far past you got. The target is drawn as
a line the clock crosses: cobalt while you are working toward it, crimson and
still counting once you are past, with how far past written underneath.

**It buzzes.** A tap on start, a beat each second of the lead-in, a long double
buzz the moment you clear the target, and a short tick every thirty seconds
after that — so a max hold still has a shape to it when your face is in the
carpet. On a max attempt with no target, the ticks run from the start.

**The elapsed time comes from the wall clock, never from counting intervals.**
Phones throttle timers in a backgrounded tab and stop them when the screen
locks. A counter adding 100 ms per tick would quietly under-report a three-
minute plank; two timestamps cannot. The screen is also kept awake while the
clock runs, where the browser allows it.

**The whole screen is the stop button.** You are dropping out of a plank with
shaking arms. A small target would be a design that had never been used lying
down.

Also: a baseline probe that the sweep has moved onto a different rung now
explains that rung rather than the one the patrol named. The Control patrol says
"Shoulder roll", the sweep hands a beginner the backward breakfall, and the
instructions underneath were still about the roll.

No schema change.

---

## 1.6.2 — 2026-08-05

The Docker build stopped failing on a seed script.

`docker compose up --build` died at `next build` with:

```
./scripts/seed-suit.ts:8:26
Type error: Cannot find module 'sharp' or its corresponding type declarations.
```

Two separate mistakes lined up to produce it.

**A dev script was importing a package nothing declares.** `scripts/seed-suit.ts`
fills SUIT CHECK with placeholder frames so the comparison wipe has something to
show. It imported `sharp` — which is not, and never has been, a dependency of
this project. It resolved on a development machine only because Next pulls sharp
in as an *optional* dependency for image optimisation, which this app does not
use: there is no `next/image` anywhere in it.

**The image install drops optional native packages silently.** Since 1.5.4 the
deps stage sets `build_from_source`, which stopped better-sqlite3 fetching its
binary from GitHub and hanging with no timeout. That switch is global — there is
no per-package form that works — so sharp builds from source too, which needs
libvips, which this image does not carry. npm drops an optional package whose
install script fails and says nothing about it. Measured three ways on this
lockfile: unset installs 146 packages with sharp, `true` installs 144 without,
and the scoped `better-sqlite3` form prebuild-install documents also installs 144
without.

So the production image had no sharp, correctly, and `next build` type-checked a
seeding script and stopped the release over it.

Fixed at both ends, and a third place so it cannot come back:

- `scripts/` is out of the app's tsconfig. `next build` type-checks whatever that
  file includes, so anything in there can stop an image being built — and the
  scripts are dev tooling run with tsx, never bundled. They are still fully
  type-checked, in `tsconfig.scripts.json`, which `npm run typecheck` runs.
- `seed-suit` resolves sharp at the moment it needs it rather than importing it,
  and prints `npm i -D sharp` if it is not there.
- `npm run check` now fails a static import of any package package.json does not
  declare, across `app/`, `components/`, `lib/` and `scripts/`. A guarded
  `createRequire` for something genuinely optional is the honest way to reach for
  it, and is deliberately still allowed.

The image keeps `build_from_source` — the hang it fixed was real — with the cost
written down next to it. It is 30 MB lighter without sharp, which it has no use
for.

Verified by removing sharp from `node_modules` entirely and running the
production build: compiles clean.

No schema change.

---

## 1.6.1 — 2026-08-05

Looking at next month's session no longer decides it.

Opening a session issues its numbers and writes them down, so they cannot move
under you halfway through a set. That is right for the day you are training. It
was quietly destructive for the day you were only looking at.

Browsing ahead to a Monday three weeks out opened that session, which fired the
prescription, which stored it — movements and numbers both — at whatever level
you happened to be on the evening you scrolled past it. A stored plan wins over
a fresh calculation everywhere it is read, so three weeks later you would train
that session at the level you were on the night you glanced at it. The skill
tree had moved on. That day had not, and nothing said so.

It also burned an AI call per session browsed, and would have let you log sets
against a date that had not happened.

Now: a day that has not arrived is a **preview**. It is worked out fresh from
where you stand today, every time you look, and none of it is saved. No model
call, nothing written down, and the session is read-only — it shows the
movements, the doses and anything the tree is currently holding back, and says
so on the page. The real prescription is issued on the morning of, from
everything you have logged by then.

Sessions already frozen by an earlier build are swept the next time any session
is opened, so a day you browsed to last week will still be worked out properly
when it arrives.

Two smaller things the same investigation turned up:

- A preview more than three weeks out used to read as though you had been away,
  because the tree was being asked where you stood *on that future date* and
  the intervening weeks contain no training yet. It now reads the tree as of
  today whenever you look forward, and as of the day itself when you fill one
  in late.
- `npm run check` proves all of it: a future session is not stored, a row frozen
  by an older build is deleted rather than ignored, and today and yesterday
  still store normally.

No schema change.

---

## 1.6.0 — 2026-08-05

Mastery takes months, not a good fortnight — and the tree now lasts the year.

A cold audit of the generated sessions produced one measurement that settled the argument: a
best-case 52-week simulation, an athlete who never misses a session and clears every bar on every
set, had **every strand topped out by week 30**. Twenty-two weeks with nothing left to unlock. The
same run also showed the fallback path prescribing exactly last session's numbers, so without a
model configured the plan never progressed at all.

### Mastery

A movement is no longer mastered by clearing its bar twice. `MasteryBar` gained a **weeks** count:
the clean sessions have to land in that many different calendar weeks. Sessions can be crammed,
weeks cannot — a movement trained twice a week banks six clean sessions in three weeks, which is a
good three weeks rather than a movement you own.

Every rung names one of ten shared levels rather than inventing its own numbers. The wall push-up
asks for 2×12 three times across two weeks; the archer push-up asks for 3×10 twelve times across
eight; the kip-up to standing asks for 2×3 twelve times across twelve. Three sets from the second
rung of every strand upward, which is the document's own rule — "only advance at a clean 3×12".
Entry rungs stay at two, because the baseline fortnight prescribes two and a bar the sweep cannot
clear would leave every strand stuck at the bottom.

Skills take two sets and pay in sessions instead. Three clean sets of a kip-up is asking for exactly
the tired third set the document warns against, and the document says the kip-up is several months
of work.

### The catalogue

Seventy-three rungs became a hundred and three, across the same twenty strands.

Every movement is now named something you can search for and find a tutorial. "Push-ups on a table",
"Push-ups on a chair" and "Push-ups on the sofa edge" were three names for an incline push-up at two
heights; "Rock-backs" was invented here and exists nowhere else. Every rename carries its old name
in `aliases`, permanently, so nothing logged under the old wording is orphaned.

The thin strands were deepened with legitimate intermediate movements rather than harder ones —
lunging 2 rungs to 5, holds 2 to 5, crawling 2 to 4, the engine 2 to 4 — and the gaps filled:
scapular pull-ups and chin-ups under the pull-up, a box squat under the bodyweight squat, hollow
body rocks between the hollow hold and the tuck L-sit, a backward breakfall where an invented drill
used to be.

Gates can name a rung now, not just a number. "Five reps in the falling strand" was satisfied by
five backward breakfalls, which is not what a cartwheel is waiting for — it is waiting for you to be
able to roll out of one. Cartwheels want the roll from a crouch, the kong vault wants the dive roll,
the muscle-up wants a straight bar dip, the wall run wants an actual pull-up.

### The sessions

Press and pull now happen twice a week in months 1–3. Once a week is enough to learn a pattern and
not enough to build one, and those twelve weeks are where the patterns are laid down.

Friday is built skills-first and engine-last in every phase. The document's own injury rule is that
no skill is tried quickly at the tired end of a session; the week it was written into put burpees in
the middle of Friday's list and appended every new skill after them.

The plan's named variation is a floor for a beginner, not a ceiling for month nine. Prescription may
now sit one rung above it in Phase 1, two in Phase 2 and three from Phase 3 — the cap on what you
have actually earned is unchanged.

The fallback path progresses: short of the working range repeats it, inside the range adds a rep or
five seconds, and the top of the range on a loaded movement adds 2.5 kg and drops back to the bottom
of the range.

The model is told what the body is being asked to recover from — bodyweight, weight change since the
start, the calorie target against the last fortnight's actual intake, and the RPE of the last six
sessions — with the rule that when recovery says hold and history says progress, it holds.

### Four things that were quietly capping the year

- **The dead hang was logged in reps.** Its dose reads "3× to just short of letting go", which
  contains no unit, so the dose parser fell through to reps — and a hold recorded in reps can never
  clear a bar written in seconds. The pulling strand sat on rung one for the entire year because of
  a regex.
- **Owning kit moved you down the tree.** "Ring rows" is this app's own alias for the plain inverted
  row, so owning rings dragged the feet-elevated and archer rows back to rung one and logged them
  there. "Ab wheel rollouts" and "L-sit on parallettes" are in no strand at all, so a session
  upgraded onto one logged against a name the tree has never heard of. Equipment is a note now: it
  changes how a movement is loaded, never which movement it is.
- **Nine baseline probes named a movement partway up its strand.** The Control patrol's "Shoulder
  roll" put week one at the roll from a walk — the top of the falling strand, and the thing the
  whole strand exists to prepare for.
- **Two movements from one strand collapsed into one.** Wednesday names a goblet squat, a Bulgarian
  split squat and a pistol progression; below all three they became the same movement and two of
  them silently disappeared from the session.

The six substitute movements the equipment rules can drop you onto — prone back extensions, calf
raises, the towel row and three others — were reachable from a session and explained nowhere. They
are on THE WEB now, as groundwork.

### After

The same best-case simulation unlocks something in every month from 1 to 11, finishes with four of
twenty strands still having room above them, and leaves the top rung of the pressing, overhead,
squatting and tumbling strands out of reach — for someone who never missed a session. A real year
will be slower, which is the point.

No schema change. Every existing database opens and every logged set still resolves.

---

## 1.5.8 — 2026-08-04

The note sheet moved off the keyboard.

Logging a meal opens a sheet asking what the photo missed — size, how much you ate, what it was
cooked in. It was a bottom sheet, which is the right shape for something you tap and the wrong one
for something you type into: on a phone the on-screen keyboard takes the lower half of the screen
and the field was behind it.

It now hangs from the top, with the dismiss area below it. Measured at 393×400 — roughly what is
left of a 393×852 phone once the keyboard is up — the text field, the chips and the Analyse button
are all still on screen.

Sized from `visualViewport` rather than `dvh`, because `dvh` only solves half of this: Chrome on
Android shrinks the dynamic viewport when the keyboard opens and iOS Safari does not, so anything
measured in dvh sits calmly underneath the keyboard on an iPhone. The viewport is read rather than
assumed, since keyboard height varies by device, by language, and by whether a suggestion strip is
showing.

Tapping the backdrop now analyses without a note instead of doing nothing — the entry and its photos
are already saved by that point, so the only thing on the sheet is optional context and dismissing
it should still get you numbers.

## 1.5.7 — 2026-08-04

A stalled download gives up in a minute, not fifteen. And a correction.

I had read "npm's warnings appear in 4 seconds" as the registry being healthy, and argued against a
CDN explanation on that basis. **That was wrong.** Four seconds is where the deprecation warnings
stop, not where the download finishes — the bulk tarball transfer comes after, and that is what
stalls. A plain `curl` of `registry.npmjs.org` from Windows, outside Docker, with no VPN, did not
finish in five minutes, while `github.com` completed its TLS handshake in 51 ms. So this was never
Docker's networking.

npm's default `fetch-timeout` is **300000 ms with two retries**. A transfer that stalls mid-tarball
sits silent for five minutes, retries, and can burn a quarter of an hour before reporting anything.
That is the exact shape of the "hang": not a dead link, a slow one inside a timeout long enough to
look dead.

```
npm_config_fetch_timeout=60000
npm_config_fetch_retries=5
npm_config_fetch_retry_maxtimeout=20000
```

Sixty seconds is far longer than any of these tarballs needs on a healthy connection, so it costs
nothing when the network is fine and turns one fifteen-minute stall into five quick attempts when it
is not. With the npm cache mount, a partial run also banks what it managed to fetch, so each attempt
starts further along.

The troubleshooting doc gains the corrected diagnosis and a better test — curl's `-w` values only
print when the *whole* transfer completes, so a command that returns nothing means the body stalled
rather than the handshake failing. Those are now measured separately, with `--max-time` on
everything.

## 1.5.6 — 2026-08-04

Closes the last host the native build needs.

v1.5.4 moved better-sqlite3 off github.com, but node-gyp still fetched node's headers from
**nodejs.org** — a third host that has to be reachable on a connection where reachability is the
whole problem. The official node images ship those headers at `/usr/local/include/node`, so the deps
stage now points node-gyp at them and the native build makes no network call at all.

Conditional on purpose: setting `nodedir` unconditionally would hard-fail on a base image that omits
the headers, where falling back to the download is correct. Both branches were run and verified —
it sets the config when the headers are there and exits cleanly when they are not.

The three hosts a build used to depend on, in order of removal: `auth.docker.io` (v1.5.5),
`github.com` (v1.5.4), `nodejs.org` (here). What remains is the npm registry and Debian's mirrors,
both of which have been answering in seconds throughout.

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
