# Workout generation — where it is, and where it could go

## The problem being solved

Two things pull against each other.

A **fixed movement list** is what makes tracking mean anything. "Push-ups: 8 → 11 → 14" is a
sentence only if the app knows those were the same push-ups. Let a model pick movements freely and
every session becomes a new exercise with no history, and the whole progression engine goes blind.

A **fixed movement list** is also wrong for a beginner. The document was written for one athlete on
one day, and its Monday session assumes you can already do the movements on it. Pike push-ups are
in the plan; handed to someone on day one they are hard *and* easy to get wrong, which is worse
than hard.

The resolution the app uses: **the plan owns which pattern, your logs own which variation.**

## What shipped (v1.4.0)

Proposals 2, 3, 4 and most of 1 are in. The catalogue in `lib/movements.ts` is the piece that made
the rest cheap:

- **A movement catalogue.** Every exercise carries a summary, setup, execution, what goes wrong,
  cues, what it trains, prerequisites and a mastery bar. `LADDERS` is derived from it by family and
  tier rather than being a second list that could drift.
- **THE WEB** (`/web`, from PATROL) renders it as a skill tree, all state derived from the logs.
- **Cross-family prerequisites** (proposal 2) — the thing that makes it a tree rather than parallel
  chains.
- **The feel check** (proposal 3) — one question the first time you do a movement; two "it hurt"
  answers steps it back down.
- **Rust** (proposal 4) — three weeks off and the first session back opens a tier lower.
- **The model is briefed** on every movement in front of it, plus where you stand on each strand.

v1.3.0 added the two things a week of using it made obvious:

- **Mastery repeats.** Clearing the bar once is a good day, not a level. It now takes two sets that
  clear it inside one session, on two separate days, and a session you reported as painful doesn't
  count towards it whatever the reps said.
- **Placement can be reset**, whole tree or one strand, without deleting anything. `skill_resets`
  holds a cutoff per strand; `lib/skills.ts` stops reading sets before it. Undo is a row delete.
  This exists because the app created the problem: a first patrol logged before the ladder knew
  anything about the athlete placed them halfway up a strand.

v1.4.0 closed the hole underneath all of it. The catalogue only ever held the movements someone had
got round to writing up — 45 of the 83 the plan can actually prescribe. The other 38 had no strand,
no explanation and no preparation, which is how the shoulder roll ended up in week one:

- **Every prescribable movement is in the catalogue**, and `npm run check` fails the build if that
  stops being true. Thursday's VR titles are the one exception; they are game sessions, not
  movements.
- **Two tracks.** `ladder` movements are rungs — earned, gated, with a mastery bar. `groundwork` —
  warm-ups, stretches, mobility drills, the dumbbell accessories — is always open and never moved.
  Both are explained and both are briefed to the model; only one is gated.
- **Eight new strands**, including the roll ladder the document describes in one sentence and the
  app never encoded.
- **A strand can be shut as a whole.** There is no easier cartwheel. When the entry rung's gate is
  closed the movement leaves the session and the session says which movement is waiting and on what.
- **An untouched strand opens at the bottom**, not at the plan's rung — see below.

## What shipped (v1.6.0)

A cold audit of the generated sessions, run against measurement rather than intuition, found the
tree emptying itself long before the year did — a best-case 52-week simulation had **every strand
topped out by week 30** — and found the fallback path not progressing at all. Six things changed.

**Mastery got much harder, and the hardest lever is the calendar.** `MasteryBar` gained `weeks`: the
clean sessions have to land in that many *different* calendar weeks. Sessions can be crammed; weeks
cannot. A movement trained twice a week banks six clean sessions in three weeks, which is a good
three weeks rather than a movement you own. Every rung now names one of ten shared levels rather
than writing its own numbers:

| Level | Sets | Sessions | Weeks | For |
|---|---|---|---|---|
| `intro` | 2 | 3 | 2 | the version almost anyone can do |
| `foundation` | 3 | 5 | 3 | the early rungs of a strength strand |
| `working` | 3 | 7 | 4 | the rungs most of the year is spent on |
| `demanding` | 3 | 9 | 6 | the rung before a real step up |
| `advanced` | 3 | 12 | 8 | hard strength |
| `elite` | 3 | 15 | 10 | the top of a strength strand |
| `drill` | 2 | 4 | 4 | the first, safest version of a skill |
| `practice` | 2 | 6 | 6 | the middle of a skill strand |
| `craft` | 2 | 9 | 9 | the real version of a skill |
| `signature` | 2 | 12 | 12 | the one the strand was built for |

Three sets from `foundation` up, because that is the document's own rule — "only advance at a clean
3×12". `intro` keeps two, because the baseline fortnight prescribes two and a bar the sweep cannot
clear would leave every strand stuck at rung 0. Skills take two sets and pay in sessions instead:
three clean sets of a kip-up is asking for the tired third set the document explicitly warns against.

**The catalogue was overhauled**: 73 rungs became 103, across the same 20 strands. Every name is one
you can search for and find a tutorial — `Push-ups on a table`, `Push-ups on a chair` and
`Push-ups on the sofa edge` were three names for an incline push-up at two heights, and `Rock-backs`
was invented here. Every rename carries the old name in `aliases`, permanently, so logged history
still resolves. The thin strands were deepened with legitimate intermediate movements rather than
harder ones: lunging went from 2 rungs to 5, holds 2 → 5, crawling 2 → 4, the engine 2 → 4.

**Gates can name a rung, not just a number.** `Prerequisite.tier` was the missing half. "Five reps in
the falling strand" is satisfied by five backward breakfalls, which is not what a cartwheel is
waiting for — it is waiting for you to be able to roll out of one. Cartwheels now want the roll from
a crouch; vaults want the same; the kong vault wants the dive roll; the muscle-up wants a straight
bar dip; the wall run wants an actual pull-up.

**The fallback path progresses.** `withHistory` used to prefill exactly last session's best, so with
no model configured — or on any day the model call failed — nothing ever went up. It is ordinary
double progression now: short of the range repeats it, inside the range adds a rep or five seconds,
top of the range on a loaded movement adds 2.5 kg and drops back to the bottom of the range.

**The model is told what the body is recovering from.** Bodyweight, weight change since the start,
calorie target versus the last fortnight's mean intake, and the RPE of the last six sessions — none
of which it had. A push-up at 100 kg is a different exercise from one at 80 kg, four sessions at
RPE 9 means hold rather than add, and a month at 800 kcal under maintenance is a month in which
strength is defended rather than built.

**Press and pull happen twice a week in months 1–3**, and Friday is built skills-first, engine-last
in every phase — the document's own rule is that no skill is tried quickly at the tired end of a
session, and the week it was written into was appending every new skill after the burpees.

Four bugs the simulation surfaced, all of which had been quietly capping the year:

- **The dead hang was logged in reps.** Its dose is "3× to just short of letting go", which contains
  no unit for the dose parser to find, so it fell through to reps — and a hold recorded in reps can
  never clear a bar written in seconds. The pulling strand sat at rung one for the whole year
  because of a regex. `parseDose` now takes the catalogue's metric.
- **Equipment upgrades renamed movements.** "Ring rows" is this app's own alias for the plain
  inverted row, rung one — so owning rings dragged every rung above it back down and logged them
  there. "Ab wheel rollouts" and "L-sit on parallettes" are in no strand at all, so sessions upgraded
  onto them logged against names the tree has never heard of. An upgrade is a note now, and nothing
  else.
- **Nine baseline probes named a movement partway up its strand** without being ladder probes, so
  the fortnight logged them verbatim and parked a beginner on that rung. The Control patrol's
  "Shoulder roll" put week one at the roll from a walk.
- **Two plan entries from one strand collapsed onto one rung.** Wednesday names a goblet squat, a
  Bulgarian split squat and a pistol progression; below all three they became the same movement and
  two of them silently vanished from the session.

After the changes, the same best-case simulation unlocks something in **every month from 1 to 11**,
finishes with 4 of 20 strands still having room above them, and leaves the top rung of the pressing,
overhead, squatting and tumbling strands unreached — by an athlete who never missed a session and
cleared every bar on every set. A real year will be slower.

Still open: slots instead of session lists (proposal 1's remaining half), letting the model choose
within the earned range (5), fatigue-aware volume (6), in-session ramping for tests (7), and skills
as practice rather than sets (8).

## How it works today

Three layers, each with a different authority.

| Layer | Owns | Written by |
|---|---|---|
| `lib/plan.ts` | Which day is which session, which phase you are in, which movement patterns belong to it, calorie and checkpoint targets | The plan document. Never a model. |
| `lib/movements.ts` | The catalogue: every movement, its family, its tier, how it is done, what it trains, what gates it | The document's own progressions, written out |
| `lib/skills.ts` | What the logs say: which sets still count after a reset, and whether a movement has been held under control often enough to be mastered | Your logs, read on demand |
| `lib/training.ts` + the model | Sets, reps, seconds, load | Adapts to what you logged |

A **ladder** is an ordered list of variations for one movement family:

```
push:  wall → incline (waist) → incline (bench) → floor → decline → diamond → archer → clap
pull:  dead hang → scapular pull-up → negative → chin-up → pull-up → explosive → muscle-up
roll:  backward breakfall → from a kneel → a crouch → standing → a walk → dive roll
```

A **strand** is every movement of one family, ordered by tier. Your **standing** on it is read out of
the logs: the highest tier you have a set on, plus one if that movement is mastered, minus one if
you have been away three weeks, and then walked down past anything whose cross-strand gates are
shut. Prescription takes `min(standing, planTier + headroom)` — never above what you have done, never
more than `headroom` rungs above the one the plan named. Headroom is 1 in Phase 1, 2 in Phase 2 and 3
from Phase 3 on: early in the year the document knows better than your logs do, and by month nine
your logs are a year of evidence against a guess made before you started. A flat cap of 1 was
measurably wrong — several strands hit it by month six and sat there for the next twenty-five weeks
with the tree saying "earned" and the session still prescribing the beginner variation.

**Mastered** means enough sets clearing the movement's bar within one session, on enough separate
sessions, spread across enough separate calendar weeks, with no session you reported as painful. The
numbers come from the level the rung names (table above). `npm run check` fails a rung whose bar asks
for more sets than its dose prescribes, one that does not name a shared level, one whose weeks
outnumber its sessions, one that is cheaper than the rung below it, and any entry rung the baseline
fortnight's two sets could not clear.

A strand with **no standing at all** opens at its easiest movement. This matters more than it sounds:
`min(standing, planTier + 1)` only helps once there is a standing, so before v1.4.0 a strand nothing
had ever been logged on fell through to whatever the plan named. That is the pike push-up bug, and it
was still live for every strand the baseline fortnight does not reach — which is all of the skills.

The **baseline sweep** opens every ladder at the bottom and climbs. Five patrols cover every family;
the fortnight walks up to your limit rather than starting above it.

A **reset** draws a line rather than deleting. `skill_resets` stores a cutoff — one per strand, or
one for everything — and only sets logged after it are read. The logs are the record of what you did
on a given day and that should survive a change of mind about how to interpret it, so nothing is
destroyed and undo is a row delete. Pain reports deliberately survive a reset: a number can be
re-taken, "this shape hurts me" cannot.

A prescription is **issued on the day and never before**. Opening a session
computes its numbers, runs them past the model and stores them, so they cannot
move mid-set. A date in the future is a **preview** instead: computed live from
where you stand today, read-only, and stored nowhere. Storing it was the bug —
browsing ahead froze that day's movements and numbers at the level you were on
the evening you scrolled past it, and a stored plan wins over a fresh
calculation everywhere it is read. `storePrescription` refuses a future date and
`storedPrescription` sweeps any that an older build left behind.

The **model** never picks movements. It receives the resolved list and your recent history, and may
adjust sets (±1, clamped), reps, seconds and load. Anything it invents is dropped; anything it omits
keeps the plan's numbers. Every failure path falls back to the plan.

---

## Proposals

Ordered by what they would buy, not by effort.

### 1. Slots instead of lists — *large, high value*

Today Monday is a literal list of exercises. It could be a list of **slots**:

```
mon: [horizontal_press, vertical_press, dip, lateral, core, core]
```

The ladder then fills every slot, and the plan never names a variation at all. Consequences:

- Adding a variation to a ladder makes it available everywhere that family appears, once.
- Equipment substitution becomes "pick a different rung of the same family" instead of a separate
  table of hand-written swaps.
- Phase changes become "this slot's ladder gets three more rungs", which is what the document
  actually describes.

The cost is that `lib/plan.ts` stops reading like the document and starts reading like a
configuration. Worth doing if the ladders keep growing; not worth doing yet if they don't.

### 2. Cross-family prerequisites — *small, high value for safety*

The ladder is one chain, so the only thing gating a movement is the movement below it. Some
movements are gated by a *different* capacity:

- Handstand push-up negatives should need a wall handstand hold, not just pike push-ups.
- Dips between two chairs should need a shoulder that has survived chair dips, not just the reps.
- Clap push-ups should need a wrist that has done volume, not just strength.

A `requires: [{ family, reps | seconds }]` on a rung would express this, and the placement function
already has every standing in hand to check it. **This is the cheapest large safety win available.**

### 3. Ask how it felt, per movement, on a new rung — *small, high value*

The app collects an RPE for the whole session. It does not ask about a *movement*, and the movement
is where the injury is.

The first session at a newly unlocked rung, one question under that exercise: *controlled, hard, or
something hurt?* Two "something hurt" answers and the rung steps back down and stays down until
the one below is cleared again.

This catches the pike push-up problem from the inside — the app cannot see that your form collapsed,
but you can, and you would answer honestly if asked once rather than nagged.

### 4. Step back down after a lay-off — *small*

Standings have no memory of time. Miss three weeks and the ladder still says you earned rung 5, so
your first session back opens at rung 5. It should open at rung 4 and let you climb straight back —
a session, not a punishment. A `lastDate` staleness check in `standings()` is most of the work, and
that field is already being read.

### 5. Let the model choose within the earned range — *medium*

Right now the model may only move numbers. It could also be allowed to hold you at a rung when the
numbers say advance — *"you cleared 12, but RPE was 5 and the last two sessions were 4; stay here a
week"* — because that judgement is exactly what rules are bad at and a model is good at. The
guard stays: it may pick any rung from `[standing - 1, standing]`, never above.

### 6. Fatigue-aware volume — *medium*

Feed the model the last seven days of sets and RPE, not just per-movement history, and let it cut
volume when the week has been heavy. The document's own low-profile week is a fixed every-fourth
rule; this would make it responsive as well.

### 7. Ramp within a session for tests — *small*

The sweep finds your ceiling over two weeks because each patrol tests one rung. A test session
could issue rung N *and* N+1 with "stop when one gets hard, leave the rest blank" — the standard
way to find a max safely, and it would find it in one session rather than four.

Worth adding when re-tests arrive at each checkpoint; the fortnight has time to spare, a checkpoint
does not.

### 8. Skills are practice, not sets — *small*

Handstands, kip-ups and rolls are not strength ladders and do not progress on reps. They want a
time box and a quality note — *five minutes, did it feel closer?* — rather than 3×8. Partly true
today by accident; making it explicit would stop the skill work being logged as though it were
volume, which currently distorts the session totals.

---

## What must not change

- **Movement identity is the tracking key.** Any change that lets a movement's name drift breaks
  every chart behind it. Renaming a rung is a data migration, not a copy edit.
- **The model never selects movements.** It adjusts. Everything it returns is merged by name
  against a list the plan produced, and unknown names are dropped.
- **Every failure degrades to the plan.** No session ever fails to load because a model was slow.
