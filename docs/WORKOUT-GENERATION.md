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

## How it works today

Three layers, each with a different authority.

| Layer | Owns | Written by |
|---|---|---|
| `lib/plan.ts` | Which day is which session, which phase you are in, which movement patterns belong to it, calorie and checkpoint targets | The plan document. Never a model. |
| `LADDERS` in `lib/plan.ts` | The ordered variations of each pattern, and the rule for climbing | The document's own progressions |
| `lib/training.ts` + the model | Sets, reps, seconds, load | Adapts to what you logged |

A **ladder** is an ordered list of variations for one movement family:

```
push:  wall → table → chair → sofa edge → floor → diamond → archer → clap
pull:  dead hang → negative pull-ups → pull-ups → explosive pull-ups
```

Your **standing** on a ladder is read out of the logs: the highest rung you have a set on, plus one
if that set met the document's own advance rule (a clean 3×12, or 30 s on a hold). Prescription then
takes `min(standing, planRung + 1)` — never more than one rung above what you have actually done,
and never more than one above what the plan asked for.

The **baseline sweep** opens every ladder at the bottom and climbs. Five patrols cover every family;
the fortnight walks up to your limit rather than starting above it.

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
