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

## What shipped (v1.3.0)

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
push:  wall → table → chair → sofa edge → floor → diamond → archer → clap
pull:  dead hang → negative pull-ups → pull-ups → explosive pull-ups
```

A **strand** is every movement of one family, ordered by tier. Your **standing** on it is read out of
the logs: the highest tier you have a set on, plus one if that movement is mastered, minus one if
you have been away three weeks, and then walked down past anything whose cross-strand gates are
shut. Prescription takes `min(standing, planTier + 1)` — never above what you have done, never more
than one above what the plan asked.

**Mastered** means two sets clearing the movement's bar within one session, on two separate
sessions, with no session you reported as painful. Two sets rather than the document's three because
the baseline fortnight prescribes two, and a bar the sweep cannot clear would strand every ladder at
the bottom; two sessions rather than one for the same reason the fortnight repeats itself — a single
reading is a guess. `npm run check` fails if any movement asks for more than the fortnight can give.

The **baseline sweep** opens every ladder at the bottom and climbs. Five patrols cover every family;
the fortnight walks up to your limit rather than starting above it.

A **reset** draws a line rather than deleting. `skill_resets` stores a cutoff — one per strand, or
one for everything — and only sets logged after it are read. The logs are the record of what you did
on a given day and that should survive a change of mind about how to interpret it, so nothing is
destroyed and undo is a row delete. Pain reports deliberately survive a reset: a number can be
re-taken, "this shape hurts me" cannot.

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
