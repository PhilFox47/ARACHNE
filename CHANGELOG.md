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

## 1.18.0 — 2026-08-30

The trainer can see the rest of the app.

An audit of `gatherFacts` against the schema found it querying six tables of
nineteen. Four areas were covered in detail; five things it could not see at all.

### The one that mattered for safety

`movement_feedback` records how each movement felt — `controlled`, `hard` or
`pain` — and the trainer had never read it. So it could see that your rows fell
from ten to six, and could not see that you had told the app your shoulder hurt.
A coach explicitly instructed to push you had every reason to push, on precisely
the day it should have said stop.

Pain now sits at priority 99 in the offline composer — above a week of missed
patrols, above a 1,100 kcal overshoot — and the prompt gained a section of its
own:

> **PAIN OVERRIDES EVERYTHING.** Do not tell someone to work harder on a
> movement they have reported pain on — not in the same paragraph, not anywhere.
> If the pain has repeated, say so and tell them to get it looked at. You are not
> diagnosing anything; you are declining to coach through it.

`hard` is left alone, because hard is what training is. Only `pain` triggers any
of it.

### Your notes, actually read

Session notes were already in the facts and nothing drew attention to them. They
are now called out explicitly in the prompt, with the reason:

> A note is the only thing in this entire dataset written by them rather than
> measured about them, and it will often explain a number you would otherwise
> misread — a bad session with "slept four hours" in the note is not a discipline
> problem. Never ignore one that explains a shortfall you are about to criticise.

### The other three

- **The tape.** Waist, neck, chest, thigh, arm, plus the waist change over time.
  This is the answer to a stalled fortnight — the waist keeps moving when the
  scale does not, and the trainer previously could not say so.
- **Body composition.** The fat-versus-lean split of the last two weeks, which
  `lib/stats.ts` already computed and only SENSE used. Being ahead of the
  corridor is a bad result if the missing kilos came off the wrong tissue.
- **THE WEB, THE TRIAL and ABILITIES.** What is closest to mastery, what today's
  session has locked and why, and the capability milestones.

XP, levels, streaks and challenges stay withheld on purpose: it should coach the
work, not the scoreboard.

### Three wordings that would have embarrassed it

Found by running the new observations rather than by reading them:

- "painful **2 times**" → "painful **twice**".
- A fat share of **125%** is not a rounding error — it means lean mass went *up*
  while fat came down, the best outcome available, and printing it as a
  percentage is nonsense. It now says so in words.
- "**0 clean sessions** from mastered" — the sessions can all be banked and the
  movement still not mastered, because the bar asks for them spread across
  calendar weeks and that is the part you cannot cram. It now says it is waiting
  on the calendar.

### Checking

Twenty new assertions, including that pain leads the briefing even against four
missed patrols and a blown day, that it says to back off rather than push, and
that it never contains "push through". Two of the wording checks were initially
passing vacuously — asserting the absence of a bad string in a paragraph that
never mentioned the subject — and now quiet the louder observations first so
they assert the real sentence.

---

## 1.17.0 — 2026-08-30

MAINTENANCE — the chores, and what skipping them costs.

### No "done" column anywhere

The obvious model is a boolean on each chore, reset at midnight. That reset is a
scheduled job, and it breaks in every interesting case: the container was asleep
at midnight, it ran twice, you crossed a timezone, you brushed your teeth at
00:30. Schema v16 stores *when* something was done instead:

```
chores      id, name, cadence, sort, created_on, archived_on
chore_log   chore_id, date, done_at
```

"Is it done?" is then a lookup — a row for today, or a row since Monday — and
**the reset is free** because a new day simply has no row. Same reasoning as no
stored XP, and it means a rule change fixes history retroactively.

`created_on` and `archived_on` are dates rather than timestamps because the only
question ever asked of them is "did this exist on that day". They are what stops
a chore added today from making last month a retroactive failure.

### The malus forced a change to how XP is computed

`computeGameState` produced category totals across the whole run — "Fuel entries:
28 × 15". Nothing was attributed to a *day*, and "10% less XP tomorrow" needs
exactly that. `dailyGrossXp` now buckets earnings by date, and the line it draws
is the one that matters:

- **Reduced:** weight logs, sessions, sets, RPE, notes, fuel entries, calorie /
  protein / water target days, SUIT CHECK, measurements
- **Exempt:** achievements, ABILITIES, checkpoints, THE TRIAL, full patrol weeks,
  weekly and monthly challenges

Milestones are records, not daily takings. An achievement earned once in twelve
months should not quietly be worth 10% less because the washing-up waited. Decay
is exempt for a blunter reason: it is negative, and reducing a penalty by 20%
would turn missing your chores into a reward.

The result is one new ledger row rather than a shave off every category:

```
Maintenance malus   −132 XP
```

Existing rows are untouched, so the progress screen shows what you earned and
what the chores cost as two numbers instead of one blurred one. Verified: three
days of 220 XP each, two dailies missed → exactly −132, with THE TRIAL's 1,500
and the decay both unchanged.

### The rules, and the four defaults

Daily 10%, weekly 20%, additive, **capped at 50%**. The cap is not tidiness:
without it every chore you add raises the maximum punishment, so tracking more of
your life makes the app harsher — exactly backwards — and an uncapped malus is a
death spiral where the day you are least likely to engage is the day engaging is
worth least.

```
2 dailies + 2 weeklies missed → 60% uncapped → 50% applied
```

Three protections against the malus being unfair or gameable:

- **Nothing can be missed before it existed.** A chore added today is never a
  miss for yesterday.
- **Retiring stops the count without erasing history**, and does *not* wipe a
  penalty already earned. Otherwise retiring a chore would be an undo button for
  a malus, and the one thing a penalty must not have is an undo button.
- **A weekly chore added mid-week is tickable this week but cannot be missed for
  it.** The two tests are deliberately different: `standingsFor` asks "does this
  exist today" so the list is usable immediately, `malusFor` asks "did it exist
  on Monday" so you are not penalised for a week you had no chance at.

### The screens

`/maintenance` has today's list, this week's list, what the malus is costing and
why, and a folded-away editor for adding, renaming, reordering and retiring. HQ
gets a card showing only what is still outstanding, tickable in place — it is a
several-times-a-day interaction and should never cost a navigation — collapsing
to a single line once everything is clear.

The trainer gets chores as a fifth source, with a malus observation ranked just
under a skipped patrol, and is told explicitly not to read the list back every
morning.

### One thing found in the building

Purely recency-based rotation in the offline briefing was demoting a missed
patrol and a 600 kcal overshoot *below* a notice that this is a LOW PROFILE
WEEK, because both had been mentioned yesterday and the deload notice had not.
The top slot now goes to the highest severity undemoted, and only the other two
rotate: a problem does not stop being the biggest problem because you were told
about it once.

### Checking

Twenty-one new assertions covering the arithmetic, the cap, clearing yesterday
lifting the penalty, a weekly ticked on any day counting, chores that cannot
punish retroactively, mid-week weeklies, archiving semantics both ways, and the
ledger — that the malus arrives as its own row, that THE TRIAL is never reduced,
and that decay is never turned into a reward.

---

## 1.16.0 — 2026-08-27

The trainer remembers what it already told you.

Reported as: *"it tends to repeat itself, covering the same things as if it has
never mentioned them before"* — with the qualifier that repeating a point should
be possible, just not the default.

The trainer had no memory at all. Each morning it was handed the same shape of
data and asked for a paragraph, with nothing to tell it that yesterday's
paragraph existed. On a stable week the same observation is the most important
one every day, so it got written every day.

### It now reads its own last fortnight

`recentBriefings(date, 14)` returns the previous fourteen days, newest first,
excluding the day being written so a regeneration cannot read itself. They go
into the user turn under a heading that says what they are:

```
WHAT YOU ALREADY TOLD THEM — your last 14 briefings, newest first.
Do not repeat these points as though they were new. Find something you have not
said, or say it differently and say what has changed.

[2026-08-26] …
```

The system prompt gained two sections. **DO NOT REPEAT YOURSELF** makes finding
something new the default, bans re-using an opening from the last few days, and
says a point made two days ago should lose to one never made at all.
**WHEN REPEATING IS RIGHT** is the other half, because a coach who can only say
a thing once is no better than one who says it every day — repeat deliberately
when it is getting worse, when it has been said and changed nothing and naming
that pattern *is* the point, or when it is genuinely the only thing that matters
today. In those cases it must be explicit that this is not the first time. The
problem was amnesia, not emphasis.

### The offline version got its own memory

The fallback picks the three sharpest observations from a ranked list, which on
unchanging data is the same three every morning. Each observation now carries a
topic, and `recentTopics` dates each topic by how many mornings ago it was last
raised. The penalty decays with age:

```
yesterday −35   two days −25   three days −15   four days −8
```

Graded rather than flat, and that mattered. A flat penalty saturates: after two
mornings every topic has been said, all of them are docked the same, the order
collapses back to raw severity, and the loop returns. Four consecutive mornings
on identical data now produce three distinct paragraphs, and the worst thing in
the data still appears in all of them — demotion is never enough to silence a
missed patrol.

### A bug found in the building

The closing line names the day's protein target every single day — "2,300 kcal
and 160 g of protein". The first topic detector matched a bare `/protein/`, so
every briefing ever written looked like it had already covered protein, and the
protein observation was permanently suppressed. The signatures now match the
composer's own observation phrasings (`protein is averaging`, `protein hit on`)
rather than the word.

### An unrelated flake, fixed

`two concurrent writes leave one row` had been passing on the clock. It runs
`ensureBriefing` with yesterday's row already present, so before 08:00 nothing
is due, both writers correctly do nothing, and the check fails — the app
behaving and the test wrong. It clears the table first now.

### Checking

Seventeen new assertions: that the lookback is exactly fourteen days, newest
first, never including today; that the texts reach the model labelled and with
the instruction; that a first-ever briefing carries no such section; that the
closing line's protein target is not mistaken for a protein observation; that
topics are dated by age; and that four mornings of identical data do not produce
four identical paragraphs while the worst thing still survives the rotation.

---

## 1.15.1 — 2026-08-24

Wall slides removed.

Reported as: *"I just don't have any smooth walls to do this on, only very rough
ones."*

Removed from all four places it lived:

- **Tuesday, MOBILITY & FLOW** (Phase 1 onward). Tuesday is now seven movements.
- **The Phase 0 baseline sweep**, so it is not measured either.
- **The catalogue**, so it cannot be prescribed, substituted in, or appear on
  THE WEB.
- **The lateral-raise substitute**, which is the one that mattered.

### The substitute was wrong anyway

`gateExercise` swapped lateral raises for wall slides when you owned nothing to
lift:

```ts
{ match: /lateral raise/i, needsAny: LOAD,
  substitute: { name: "Wall slides", dose: "15",
                note: "Substituted — nothing to raise. Keeps the shoulder work." } }
```

It did not keep the shoulder work. A lateral raise is a light weight held away
from the body — a strength movement for the side deltoid. A wall slide is a
range-of-motion drill. Swapping one for the other and saying nothing is how a
programme quietly stops training the thing it says it trains, and this one was
doing it in the plan's own priority muscle.

There is no bodyweight version of a lateral raise: the arm alone is the load and
it is not enough. So it now locks with a reason, exactly as the dead hang does
since v1.12.0:

```
owns dumbbells  → allowed
owns nothing    → locked: needs one of: dumbbells, heavier dumbbells,
                  kettlebell, resistance bands, gym membership, weighted vest
```

### History is untouched

It was `track: "groundwork"` — never a ladder rung, never mastered, gating
nothing — so removing it breaks no strand. Sets logged against it during the
baseline fortnight stay exactly where they are. Every reader was run against a
database holding orphaned wall-slide logs:

```
findMovement('Wall slides') → null
ok   standings()                      ok   loadGameState()
ok   movementRecords()                ok   buildWeb()
ok   exerciseHistory('wall slides')   ok   baselinePrescription(1,'tue')
ok   getHqStats()                     ok   gatherFacts() / localBriefing()
```

`exerciseHistory` still returns the sets. The movement is gone from the plan,
not from the record.

### What covers the gap

Tuesday keeps Thread the Needle for shoulder range, and Monday's warm-up still
carries shoulder circles with a towel, arm circles and scapula push-ups. The
overhead work does not leave with it.

---

## 1.15.0 — 2026-08-24

The trainer is allowed to tell you off.

Reported as: *"I don't want it to be just positive for the sake of it. If I ate
more than my calorie deficit allows, it should point that out and give guidance
on what has been too much from the stuff I ate."*

The instruction was easy; the data was the problem. v1.14.0 gave the trainer
daily **totals** — 2,610 kcal against a 2,300 target — so it could say you went
over and could not possibly say on what. And it saw sessions only as done or
not done, so a session where everything collapsed looked identical to a good one.

### What it can see now

**The actual food.** `fuel.overTargetDays` carries each day that went over
together with `worstItems`, the biggest entries by calories, so the sentence has
something in it:

```
Saturday finished 310 kcal over at 2,610, and 1240 of that was the pizza.
```

`fuel.topSnacks7` comes too — the week's most expensive snacking, which is
usually the same short list repeating.

**How each movement went.** `findShortfalls` reads the stored prescription for
every session in the window and compares it against `exercise_logs`: the best
rep or hold against the target, the sets finished against the sets planned, and
the best against the best before it. Read from the *stored prescription* rather
than from the plan, because that is what was on the screen — already placed on
the ladder, gated on equipment, and adjusted for the last session. Judging a set
against a number that was never shown would be marking a paper you did not sit.

Each shortfall arrives with the catalogue's `watch` and `cues` for that
movement, which is the part that makes the advice real:

```
Incline inverted row: 1 set of 3 and 6 against 10. Finish the sets — the last
one is the one doing the work. Blades together, chest to the edge, straight from
heel to head.
```

Those cues are `lib/movements.ts`'s own words. The model is told to use them
rather than invent technique advice, and the offline version quotes them
directly.

**Skipped patrols.** `patrol.skipped` is every training day in the window that
produced nothing completed, with `started` distinguishing a session opened and
abandoned from one that never happened — a different failure, worth a different
sentence.

### The prompt

Rewritten around one rule, under a heading that says so: **honest, not nice.**

- No praise for the sake of it, and none without the number that justifies it.
- Over the target? Name the item.
- A movement short? Say by how much, then give one concrete correction from the
  data's own coaching notes.
- Skipped a patrol? Say so plainly, without softening it, and do not pretend it
  was a rest day. Two or more deserves a sharper sentence than one.
- A number went backwards? Say it went backwards.
- Do not open with reassurance before the problem, and do not take it back at
  the end.

And a section on where the line is, because a coach who is merely harsh is not
better than one who is merely nice: blunt about the work, never about them as a
person. No shaming, no moralising about food, nothing called a cheat, and never
a suggestion to train it off or eat below the plan's target. Earned praise is
still praise and still allowed.

### The offline version got the same teeth

It used to concatenate every true observation, which by a bad week ran to 157
words and buried the worst thing in the middle. It now scores each observation
and speaks the three sharpest plus what today is — skipped patrols above a
blown calorie day, above a movement shortfall, above a protein average, above
the scale. Roughly eighty words:

```
2 patrols missed this week — Wednesday and Thursday. That is not a slow week,
it is most of one gone. Turning up is the whole of Phase 1. Saturday finished
310 kcal over at 2,610, and 1240 of that was the pizza. Incline inverted row
came in at 6 against 10. Blades together, chest to the edge, straight from heel
to head. Today is Push & Core — 3 rounds. 2,300 kcal and 160 g of protein.
```

The correction quotes the **cues** rather than the `watch` note, which often
opens with setup — the inverted row's begins "check the table takes your weight
before you get under it", sound advice and not the reason you managed six
instead of ten.

### Checking

Twenty new assertions, including the one that matters in both directions: a
deliberately bad week must produce a briefing naming the pizza, the movement,
the numbers and a real correction — and a clean week must not have criticism
invented for it. Plus the prompt still carrying its licence to criticise and its
limits.

---

## 1.14.0 — 2026-08-24

A trainer who has read the whole week.

### Why a paragraph and not another number

Every screen reports one thing. PATROL knows about sessions, FUEL about food,
VITALS about the scale, JOURNEY about the year. Nothing read across them, and
that is where the observations worth having live — protein short on exactly the
days you train hardest, the weekend snacking that quietly undoes a good week, a
strand that has been one clean session from mastery for a fortnight.

`lib/briefing.ts` gathers the last eight days of all four into one structured
object — weight trend against the corridor, calories and protein against the
day's targets, sessions with their RPE and notes, sets logged, water, phase,
week, whether it is a LOW PROFILE or REFUEL week, today's session and its
movements, and the next three days — and asks the model for 90 to 150 words of
prose.

### Written once, at 08:00

Stored in a new `briefings` table (schema v15), one row per day, unique on the
date. This is the app's one deliberate exception to deriving everything on read,
and it earns it twice: the paragraph costs a model call, and one that rewrote
itself on every page load would be one you stop reading. What it says at 08:00
it says at 22:00.

A poll inside the server writes it rather than a cron:

```
[arachne] briefing schedule armed — due from 8:00, checked every 5 min
```

A `setTimeout` aimed at a wall-clock hour is wrong across a suspend, a
daylight-saving change, or a container that was asleep at 08:00 — all ordinary
here. Asking "is one due and missing?" every five minutes is right in all of
them, and the question is one indexed row.

It is armed from the root layout rather than `instrumentation.ts`, which is
where it belongs and cannot go: the app ships middleware, so Next compiles
instrumentation for the edge runtime too, and better-sqlite3 cannot be bundled
for a runtime with no `fs`. The `NEXT_RUNTIME` guard does not help — webpack has
already had to resolve the import by then.

Three paths reach the same place, and all of them are idempotent because the
write upserts on the date:

- the poll, at 08:00 on a server that has been up
- the poll's immediate first tick, for a restart that happened at 09:00
- the HQ screen itself, if it renders and finds none

The first briefing of a run does not wait for 08:00. An empty panel on the first
morning reads as a broken feature rather than as a thing that arrives later.

### It cannot show you a failure

Every way the model can let you down ends in a paragraph:

```
an empty answer   → local, 275 chars  ✓ fell back
a refusal         → local, 275 chars  ✓ fell back
a wall of text    → local, 275 chars  ✓ fell back
an HTTP 500       → local, 275 chars  ✓ fell back
malformed JSON    → local, 275 chars  ✓ fell back
a dead network    → local, 275 chars  ✓ fell back
a good answer     → ai, 82 chars
```

The fallback is not an apology — it is the same observations composed from the
same numbers by hand. Worse prose, never an empty panel, which is the right
trade at 08:00 with no internet. It is stored marked `source: "local"` so a load
more than thirty minutes later can quietly replace it with the real thing;
sooner than that and a flat network would turn into a request per refresh.

Working, against a seeded week with no API key present:

> Average is down 0.4 kg on last week, inside the corridor. Protein is averaging
> 116 g against a target of 160 g — that gap is the one that costs muscle in a
> deficit. Today is Push & Core — 3 rounds. Target 2,300 kcal and 160 g of
> protein.

### The prompt

Speaks the app's own vocabulary — PATROL, FUEL, VITALS, THE WEB, LOW PROFILE
WEEK, REFUEL WEEK, OFF-DUTY — and is told plainly never to invent a figure, to
lead with what matters today, to name at least one specific thing from the data,
to say a problem once rather than scold, to give no medical advice and never to
suggest eating below the plan's target. Markdown is asked for not to appear and
stripped if it does: a stray `**` in the middle of a paragraph is the one thing
that makes it look machine-written.

The model is the configured one, never hardcoded, and the key stays in the
Authorization header and out of the body — both now checked.

### Checking

Thirty-six new assertions: the 08:00 gate from both sides, the first-run
exception, that a past date is never due, that the model's own briefing is never
rewritten while a stale local one may be, that two concurrent writes leave one
row, that the fallback names the day's targets and carries no markdown, that
each of six model failures still leaves a briefing, and that the request goes to
Nano-GPT with the configured model and no key in the payload.

---

## 1.13.0 — 2026-08-17

The sports-science pass. The previous release checked that the app implements
the plan faithfully; this one asks whether the plan itself is good exercise
science, and closes the four gaps where it was not.

### REFUEL WEEK — the diet gets planned breaks

The plan ran a continuous deficit for roughly fifty weeks with only a *reactive*
rule in Phase 4 ("if weight stalls three weeks, take one week at maintenance").
That was its one real physiological gap. Byrne's MATADOR trial ran intermittent
maintenance blocks against a continuous cut: the intermittent arm lost **more**
fat and showed less suppression of resting metabolic rate. Adherence over twelve
months is the other half — a break you can see coming is the difference between
a diet you finish and one you abandon in month seven.

Every eighth training week is now a week at maintenance, pinned to every second
`LOW PROFILE WEEK`:

```
low profile: 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49
refuel     : 9, 17, 25, 33, 41, 49        (6 in the year)
```

Pinned rather than given a cadence of its own, because a week of reduced
training and a week of restored calories are the same idea said twice — the
point of both is arriving at the next block recovered. One concept, once every
eight weeks.

Maintenance is not a constant. A 100 kg man and an 80 kg man do not maintain on
the same intake, and the document quietly says so: Phase 0 holds at 2,700 while
the closing fortnight calls 2,400 maintenance. `maintenanceForDayIn` reads it off
the corridor between them, so a refuel week drifts 2,700 → 2,500 → 2,400 across
the year.

### The calorie target now answers to the scale

`kcalTargetForDayIn` was a function of the day index and nothing else, which
makes it a prediction rather than a plan. It lands on 80 kg only if maintenance
really is what the document assumed. Modelled against Mifflin-St Jeor at three
plausible activity levels, the open-loop schedule finished:

```
AF 1.35 → 82.5 kg      AF 1.45 → 76.0 kg      AF 1.55 → 69.8 kg
```

Ten kilos under target is not a happy accident — it is muscle, and nine months of
eating less than you needed to. `kcalAdjustmentIn` now trims the ladder against a
fortnight of rolling averages:

- only once the average is outside the corridor's own tolerance band
- 100 kcal per kilogram past that band, rounded to 50
- capped at ±300 kcal
- never during Phase 0, a refuel week or the closing taper
- never below `KCAL_FLOOR`, whatever the arithmetic wants
- at least four readings in the window, so one bad morning moves nothing

Deliberately a trim, not a controller. A diet that chases the scale week to week
is how people arrive at 1,400 kcal in month eight. Re-run with feedback:

```
AF 1.35  82.5 → 82.4 kg
AF 1.45  76.0 → 78.0 kg
AF 1.55  69.8 → 75.8 kg     spread 12.7 kg → 6.6 kg
```

It is pure and takes only readings on or before the day asked about, so a past
day recomputes to what it was worth at the time rather than to what today knows
— the derived-on-read rule holds.

### Three volume holes

Counted as hard sets per muscle per week, Phase 1 had:

```
side delt    3    hamstrings   3    calves   0
```

Calves had nothing in the entire year. Side delts had three sets, all of them
one exercise, in a plan whose Phase 4 names the V-silhouette as the whole point
of the last quarter. And legs were trained once a week against pushing and
pulling twice — Schoenfeld's 2016 meta-analysis found two exposures beat one at
matched volume.

- **Calf raises** on Wednesday, Phases 1 and 2 (3 and 4 inherit).
- **A second lateral raise exposure**, also Wednesday.
- **A glute bridge on Monday**, giving the hip hinge two exposures a week.

```
side delt    6    hamstrings   6    calves   3
```

Not a restructure of the split — that would mean upper/lower, which is a bigger
change than is sensible the night before Phase 1 starts.

### Creatine, vitamin D, and a blood panel

Added to the Phase 1 brief, which had nothing on any of them:

- **Creatine monohydrate, 3–5 g/day.** No loading, no cycling. The most
  evidenced supplement there is, and it does more in a deficit than out of one
  because it holds onto strength while calories are low.
- **Vitamin D testing.** At ~51°N cutaneous synthesis is effectively zero from
  October to March. It moves muscle function and mood, and mood is a performance
  variable across twelve months.
- **Blood pressure, lipids, HbA1c.** Partly to catch anything that changes how
  training should go, partly because repeating them at month twelve gives a
  result the mirror cannot show.

### Making it visible

A scheduled break nobody can see is a bug. SENSE gains a refuel insight at the
top of the FUEL ranking while one is running, and a one-week warning before it
starts. FUEL shows a banner on a refuel day, and a second banner whenever the
adjustment is non-zero, naming the ladder's own figure and why today's differs.

### Checking

`npm run check` gains sixteen assertions: that every refuel week is also a
deload and lands every eighth training week, that none falls in the baseline
fortnight, that a refuel day eats above the phase figure, that maintenance falls
as the corridor does, and that the adjustment is inert without readings, inert
inside the band, correctly signed outside it, capped both ways, and unable to
push any day of the year below the floor.

---

## 1.12.0 — 2026-08-17

A full audit of the plan before Phase 1 begins. Four defects, all of them
things the app was doing quietly rather than visibly.

### The hinge strand was being deleted by a regex

The gate that keeps tumbling off a bare floor read:

```ts
match: /shoulder roll|rock-?backs?|kip-?up|cartwheel|roundoff|bridge|kong vault/i,
needsAny: ["mat", "gym"],
substitute: null,
```

`bridge` meant the **back bridge** — a spine-family shape you arch into and can
land badly out of. It also matched the **glute bridge**, which is lying on your
back lifting your hips, and needs a floor and nothing else. Three of the five
movements it caught were the wrong ones:

```
CAUGHT  Glute bridge              family=hinge
CAUGHT  Single-leg glute bridge   family=hinge
CAUGHT  Glute bridge march        family=hinge
CAUGHT  Back bridge               family=spine   ← the intended one
CAUGHT  Wall walk-down to bridge  family=spine   ← the intended one
```

Those three are the bottom rungs of the entire hinge strand, so a beginner
without a mat had the plan's Romanian deadlift placed onto a glute bridge and
the glute bridge then deleted. **Wednesday — the only leg day of the week — had
no hip hinge in it at all**, which for a 100 kg beginner is the pattern that
matters most and the one that protects the lower back. Anchored to the actual
tumbling shapes now (`back bridge`, `walk-down to bridge`, `bridge push-up`).

### Protein was coached 40 g/day below the plan's own figure

The phases state a protein target — 160 g through Phases 1 and 2, then 165, then
170 — and nothing read it except one line of the stats page. The FUEL screen, the
weekly challenge and the XP ledger all computed:

```ts
PROTEIN_PER_MEAL_G * 3   // 40 × 3 = 120 g
```

That is the document's rule for a *meal*, multiplied by three of them. The phase
figure is four meals' worth. So through a 20 kg cut the app was setting a daily
protein goal of 120 g — 1.2 g/kg at the start weight — when the plan asks for
160 g, which is 1.6 g/kg now and 2.0 g/kg at goal. In a deficit that gap is the
difference between losing fat and losing fat plus muscle.

`proteinTargetForDayIn(config, day)` is now the single source, and FUEL shows the
target beside the number rather than only accenting when it is met.

### A movement dropped for want of kit said nothing

`baselinePrescription` handled a gate with no substitute by `continue` — no
entry in `locked`, no message. A run with no pull-up bar therefore lost its
Wednesday dead hangs, one of the four things Phase 1 explicitly lists as its
own, and the session simply appeared one movement shorter than the plan it
claims to be following. Fifteen movements can vanish this way on a bare install.

They now come back as locked work, which the screen already knows how to show:

```
LOCKED: Dead hang — Needs one of: pull-up bar, gymnastic rings, gym membership,
outdoor bars or playground, and there is no version of this worth doing without
one. Mark it owned in SETTINGS and it comes straight back.
```

### The first deload landed in week 2 of Phase 1

`isLowProfileWeek` counted from day 0, so with the baseline fortnight occupying
weeks 0–1 the first low-profile week fell on week 3 — one real training week
into the phase:

```
before:  week 2 (P1) 3 rounds │ week 3 (P1) 2 rounds ← LOW PROFILE
after:   week 2 (P1) 3 rounds │ … │ week 5 (P1) 2 rounds ← LOW PROFILE
```

The baseline fortnight is already a deload in all but name — the sweep is run at
the bottom of every range, stopping two or three reps short, because it measures
rather than trains. Deloading straight after it is a week off from the two weeks
designed not to need one. They count training weeks now, so the first falls after
four real ones and the every-fourth-week cadence is unchanged thereafter.

### What the audit found and did not change

The calorie ladder is internally sound. Simulated against Mifflin-St Jeor with
the plan's own numbers, the intake schedule implies a maintenance of **2,755
kcal at 100 kg** and the document's stated Phase 0 maintenance is **2,700** —
agreement within 2%, which is better than most published plans manage. Every
phase sits under the plan's own 1%-of-bodyweight-per-week ceiling:

```
FOUNDATION   78d  100→93 kg  0.63 kg/wk  0.63% BW/wk  @2300 kcal
BUILD        91d   93→88 kg  0.38 kg/wk  0.41% BW/wk  @2200 kcal
ATHLETIC     91d   88→84 kg  0.31 kg/wk  0.35% BW/wk  @2150 kcal
SUIT-READY   92d   84→80 kg  0.30 kg/wk  0.36% BW/wk  @2100 kcal
```

The ladder is open-loop, though — `kcalTargetForDayIn` is a function of the day
index and nothing else, so it never responds to the scale. At an activity factor
of 1.45 rather than 1.39 the same schedule finishes 4 kg under target; at 1.55 it
finishes 10 kg under. SENSE warns about corridor drift but nothing acts on it.
Left as-is deliberately: closing that loop is a design decision, not a bug fix.

### Checking

`npm run check` gains a section proving that a movement needing only a floor is
never gated on equipment, that every no-substitute gate can name the kit it
wants, that each phase's protein target is the phase's own figure, and that no
low-profile week falls inside the baseline fortnight.

---

## 1.11.1 — 2026-08-17

Mondays counted towards nothing.

Reported as: *"Things I do on Monday don't seem to track. Only from Tuesday on.
I believe this could be because I started on a Tuesday."*

That diagnosis was exactly right, and the fault is two functions disagreeing
about what a week is.

`weekIndex` counts **calendar** weeks, from the Monday of the week the run
started in — deliberately, because a week that runs Tuesday to Monday is not a
week anyone reads. The challenge window did not:

```ts
function weekRange(startDate: string, wk: number) {
  const from = addDays(startDate, wk * 7);   // ← from the start date
  return { from, to: addDays(from, 6) };
}
```

With a Tuesday start the two run a day apart, and they disagree in the direction
that **loses** work rather than misfiling it. On a Monday the index has already
turned over to the new week, while the window that index produces does not open
until the Tuesday:

```
start 2026-08-04 (tue)

date        dow  wk   window (before)        in?   window (after)
2026-08-09  sun  0    2026-08-04→2026-08-10  ok    2026-08-03→2026-08-09
2026-08-10  mon  1    2026-08-11→2026-08-17  LOST  2026-08-10→2026-08-16
2026-08-11  tue  1    2026-08-11→2026-08-17  ok    2026-08-10→2026-08-16
```

Monday sits between the week that has ended and the window that has not begun.
Every Monday, not only the first.

### It was worse than one lost day

"Full Patrol" asks for `TRAINING_DAYS.length` — five — and the window it counted
against could only ever contain four of them. A perfect Monday-to-Friday week:

```
before:  4/5  Full Patrol   done=false
after:   5/5  Full Patrol   done=true
```

That challenge was **unclearable for the entire run**, and the same one-day skew
generalises: a run started on day N lost Monday through day N-1 of every week,
so a Saturday start would have thrown away five days in seven.

### The fix

`weekRange` anchors on the Monday, via the `weekStartDate` helper the rest of
the app already used. Weeks are Monday→Sunday everywhere.

Nothing is stored — standings, XP and challenge progress are recomputed from the
logs on every read — so **every Monday already trained is credited as soon as
this is running, retroactively.** No schema change and nothing to migrate; XP
goes up on its own.

### The consequence that came with it

Anchoring on Monday gives a mid-week start a first week shorter than seven days,
and a challenge asking for six days inside a two-day week is the same defect
wearing different clothes. So targets now fit the window:

- `Full Patrol` / `Low Profile` ask for the training days the week actually
  holds — four for a Tuesday start's week 0 — and are withheld entirely from a
  week with none.
- `On the Scale`, `Nothing Unlogged`, `Under the Line`, `Protein Wall`,
  `Field Notes`, `Rate the Effort` and `Dig In` clamp to the days available.
- `Don't Skip Tuesday` is not offered by a week containing no Tuesday.
- `Clean Weeks` counts a week against its own training days rather than a flat
  five.
- `fullPatrolWeeks` no longer fails week 0 on a Monday that fell before the run
  began — a day with nothing to turn up for.

### Checking

New suite, `scripts/check-game.ts`, wired into `npm run check`. It asks the real
scorer rather than the date helpers: one day's work and nothing else, for every
day of four weeks, from all seven possible start days — if that day is inside a
week, something must move off zero. Against the old code it reproduces the
report precisely:

```
FAIL  a tue start loses no day in four weeks — 4 lost: 2026-08-10 (mon),
      2026-08-17 (mon), 2026-08-24 (mon), 2026-08-31 (mon)
FAIL  a sun start loses no day in four weeks — 24 lost
FAIL  a tue start clears Full Patrol in every full week — wk1 4/5, wk3 4/5, …
11 check(s) failed.
```

It also proves every challenge a short week 0 offers can be cleared by doing
everything on the days that exist, from all seven start days.

Verified against a real database seeded to the reported shape — Tuesday start,
work logged on a Monday — read through the app on HQ: `0/6` → `1/6` on the
scale, `0/2` → `1/2` on notes.

---

## 1.11.0 — 2026-08-14

Photograph a meal without keeping it.

Reported as: *"I can only upload photos from my gallery when tracking food.
Otherwise my entire gallery app will be full of food."*

That was never a decision anybody made. A file input written as

```html
<input type="file" accept="image/*" />
```

leaves the choice to the browser, and on a phone the browser chooses the photo
library. So the only way to log a meal was to photograph it in the camera app,
keep it, and then pick it — and a year of that is a gallery full of dinner.

The obvious fix is the attribute that opens the camera:

```html
<input type="file" accept="image/*" capture="environment" />
```

and it breaks the other half. `capture` is an attribute of the **element**, not
of the click. An input that carries it opens the camera and offers no way to
reach a photo you already have; an input without it does the reverse. One
element cannot be both, and the platform gives no way to ask at the moment of
tapping.

So there are two inputs, and the choice picks between them. `components/PhotoSource.tsx`
owns the pair and nothing else in FUEL owns a file input at all:

- **The hero is now `Take a photo`**, opening the camera, saving the instant the
  shutter closes exactly as before.
- **`Choose from gallery`** sits directly under it, unchanged behaviour for a
  meal already photographed.
- **Everywhere else that asks for a picture** — `+ nutrition label`,
  `+ recipe or menu`, `+ the food`, and the same three on an entry already
  saved — reads one remembered setting instead of asking six times. The toggle
  sits above those chips, and the choice is stored in `localStorage` under
  `arachne.photoSource`.

One consequence worth stating: `capture` also suppresses `multiple`. The camera
takes one photo at a time and the library still takes as many as you like, which
is the right way round — a batch is something you assemble from a roll, not
something you shoot.

Verified in a phone-sized browser, both sheets: the pair of inputs exists with
the right attributes, the hero routes to the camera and the gallery button to
the library, the toggle routes the label chips to whichever is selected, and the
setting survives a reload.

```
file inputs on /fuel: [{"capture":"environment","multiple":false},
                       {"capture":null,"multiple":true}]
hero → camera        ·  gallery button → library
'+ label' default    → camera
'+ label' after flip → library      stored: library
after reload         → Gallery pressed, '+ label' → library
entry sheet          → same toggle, same routing
```

No schema change — the setting is a client preference, not data.

`npm run check` gains a section that fails a FUEL surface owning its own file
input, a camera input that claims `multiple`, or a photo entry point that offers
no choice. That is the shape of the regression: a new place to add a picture,
written the obvious way, silently gallery-only again.

**SUIT CHECK is deliberately untouched.** It has always used
`capture="environment"`, so it never had the reported problem — it takes a photo
and does not fill anything. It also cannot use an existing one, which is the
mirror-image limitation; left alone because the request was about food, and it
is a one-line change if it turns out to matter.

---

## 1.10.1 — 2026-08-06

Every photographed meal was filed under the same name.

Reported as: the review says "Coffee with oat milk" for everything, while the
FUEL page itself is correct on every day. That is exactly the shape of the
fault, and it is one line.

A food entry carries `norm_key` — the description, lowercased and stripped —
and it is what everything groups by. A photographed meal is saved the instant
the shutter closes, before anything is known about it, so it is created as
"Analysing…" with the key `analysing`. When the model answers, the row is
renamed.

**The rename never rewrote the key.** So every meal ever logged from a photo
kept the key `analysing`, and anything that groups by it saw one enormous food.
The FUEL page lists rows one by one and looked perfect; the review groups them
and reported four different snacks as four of whichever one it happened to
label the group with. Reproduced exactly:

```
description="Coffee with oat milk"           norm_key="analysing"
description="Handful of almonds"             norm_key="analysing"
description="Two squares of dark chocolate"  norm_key="analysing"
description="Banana"                         norm_key="analysing"

what the stats screen shows:   Banana ×4  430 kcal
```

Two more things were wrong for the same reason and had not been noticed yet:

- **The "Again" row would repeat the wrong meal.** It groups by the same key and
  logs the most recent entry carrying it, so tapping a chip labelled "Coffee
  with oat milk" would have logged whatever you last photographed.
- **Starring a second photographed food overwrote the first favourite.**
  `norm_key` is uniquely indexed on that table, so the second star collided with
  the first and took its numbers.

### The fix, and the repair

The analysis route writes the key alongside the description now, in the same
statement, on both the success and the failure path.

**Schema v14 repairs what is already stored.** Every entry's key is recomputed
from its description; an entry still reading "Analysing…" is left alone, because
that key is honestly what it is. Favourites are recomputed from their labels,
and if two would collide the older one — the one with the longer history —
survives. Your existing numbers do not change; the grouping does, which is the
point.

There is now one definition of that normalisation, in `lib/meal`, imported by
every writer. `npm run check` fails a `.set()` that writes a description without
a key, fails a file that reinvents the regex, and migrates a database seeded
with the broken shape to prove the repair actually runs.

---

## 1.10.0 — 2026-08-06

A meal you forgot to photograph gets estimated too.

The text field under LOG FUEL has been there since the first release, and all it
ever did was write the name down. No calories, no macros — a row on the list and
"no numbers" beside it, which is most of the way to not having logged it at all.
The description is evidence as much as a photograph is; the model was simply
never asked to read it.

Type it and press Add, and it is estimated exactly like a photo: saved first, so
a slow or failed call can never cost you the entry, then worked out. The only
difference is that the description is already yours, so there is no "Analysing…"
placeholder — the row reads correctly the moment you press the button.

### It is asked differently, on purpose

Half the photo prompt is instructions about reading a plate: weigh the packaging
against what is visible, a half-eaten pack is a half portion, read the German
label. A model given those rules and then given nothing to look at hedges, and a
hedged estimate is the one that comes back as a confident 400 kcal for anything.

So there are two prompts over one shared brief. The German grocery context, the
portion rules and the fields are identical — a Nährwerttabelle is per 100 g
whether you photographed it or typed it out. What differs is the framing: the
text prompt says outright that there is no photograph, that the words are all
there is, that it must not refuse for want of an image, and that where no size
is given it should assume the ordinary German portion, say which one it assumed,
and set its confidence low rather than pretending.

`npm run check` holds the two apart: the text prompt must not mention plates,
menus or what is visible; the photo prompt must still do all three; both must
keep the German context, the portion rules and the same JSON.

### Two things found while building it

- **A failed text entry had no way back.** The Analyse button was shown only on
  entries with photos, so a meal typed on an evening the model was unreachable
  would have sat at "no numbers" permanently. It appears on anything with a
  description now, and says what it will work from.
- **A first analysis was told its estimate had been wrong.** The same button
  reads "Analyse this photo" before there are numbers and "Re-analyse" after,
  and sends the same request — so an entry that had never been estimated was
  handed a prompt opening "This meal has been estimated before and the estimate
  was wrong." A small lie, and free to stop telling.

No schema change.

---

## 1.9.0 — 2026-08-06

The explanation moved to where the work happens.

THE WEB has carried a proper write-up of every movement since v1.2.0 — how to
set up, how to do the rep, what goes wrong on it, the cues, what it trains. It
lived on a screen you had to leave the session to reach, which is to say it was
three taps away at exactly the moment it was worth reading. Standing over a mat
trying to remember which shoulder the roll goes over is not when anyone
navigates to a reference page.

Every movement in a session now has an **ⓘ** next to its name. It opens the same
write-up, from the same catalogue entry, rendered by the same component — THE
WEB and the session share it, so there is no second copy of the words to drift.
Warm-ups and the dumbbell accessories have one too; they are explained just as
fully and simply have nothing to master.

### And where the movement sits

Both sheets gained a section that neither had: **where this rung is in the
tree.**

- What it is **built on** — the rung underneath it.
- What it **becomes** — the rung above.
- What **mastering it opens somewhere else**.

That last one is the half of the tree that was never visible. A strand's own
next rung is obvious from the list; that the shoulder roll from a crouch is what
*both* the cartwheel and the safety vault are waiting on is not, and it is the
best possible reason to do a boring rung properly. The wall handstand opens the
feet-elevated pike push-up and the cartwheel. The plank opens nine things.

A gate is credited to the *lowest* rung that satisfies it, never to every rung
above — otherwise the archer push-up would claim to unlock the burpee, which
the plain push-up opened months earlier.

Two new invariants, one of which corrected itself while being written:

- At most one rung of a strand may claim to open any given movement.
- A numeric gate must be within reach — no more than three times the best bar in
  the strand that answers it. The first version of this check demanded that some
  rung's bar *satisfy* every gate, and it failed on the three 60-second handstand
  gates. Those are correct: a gate reads the best number you have ever logged, so
  "60 s off a rung whose bar is 30" means keep holding it longer, which is the
  document's own way of writing a checkpoint. The check was wrong, not the tree.

No schema change.

---

## 1.8.0 — 2026-08-06

Weight counts towards mastery, and the session says what a set has to be.

Two halves to this, and the first one was already true.

### Reps were always the bar

"I can do the incline inverted row, but only 2 reps — that is far from
mastering." It is, and it already counted for nothing. Every rung has carried a
rep or second bar since THE WEB shipped, and a set short of it has never banked
anything:

```
Incline inverted row → 2×12 reps, 3 times across 2 weeks
   a set of  2 reps counts: false
   a set of 11 reps counts: false
   a set of 12 reps counts: true
```

What was missing was any sign of that **on the screen where you do the work**.
THE WEB said "12 reps"; the session said nothing, so logging two looked exactly
like logging twelve. Each movement now carries a line under its sets — *0/2 sets
at 12 reps · that is what banks a session* — and a set that came up short is
marked with a dot rather than a tick.

### Weight was not the bar, and should have been

Three rungs are done holding something, and their bars counted only the reps.
Fifteen goblet squats with a 2 kg dumbbell and fifteen with the plan's own pair
are the same number and not the same movement — and the light one unlocked the
split squat, the Bulgarian split squat and the whole road to a pistol.

The mastery bar takes kilograms now, as a floor the set must carry as well as
the reps:

| Rung | Bar | Where the number comes from |
|---|---|---|
| Goblet squat | 3×15 at **16 kg** | EXTRAPOLATED — the plan's own starting pair is "around 8 kg", held at the chest, and both of them is 16 |
| Romanian deadlift | 3×12 at **16 kg** | EXTRAPOLATED — the same pair. Deliberately not heavier: the rung above is the *single-leg* version, a balance problem rather than a load one |
| Jefferson curl | 3×8 at **4 kg** | The document names it outright, and here more is explicitly wrong |

Always the **total** you are holding: two 8 kg dumbbells is 16, not 8. Each of
those movements says so in its own instructions, because a bar in an undefined
unit is worse than no bar. Heavier still counts — the load is a floor, not a
target. The reps still have to be there: a heavy set of four is not a clean set
of fifteen.

**This is retroactive.** Goblet squats, Romanian deadlifts and Jefferson curls
logged without a weight, or with a light one, stop counting towards mastering
those three movements — the tree is derived from the logs on every read, so a
strand may step back a rung. Nothing is deleted and no other movement is
affected; log the weight from here and it climbs again.

Three new invariants in `npm run check`: a rung done with weights must state how
much and one done without must not; the load must be one the plan's own
equipment can actually produce; and the set row's copy of the rule is compared
against the catalogue's across every combination of reps, seconds and
kilograms, because two copies of a rule is two chances to be wrong.

No schema change.

---

## 1.7.2 — 2026-08-05

FUEL opens any day, so an entry you want gone can actually be reached.

The report was "the statistics count things I deleted". Measured, the counts
themselves were right: `deleteEntry` really does remove the row, and every
figure on the review — including "14× morning coffee" — is derived from the
rows that are still there.

The actual fault was one line up. **FUEL only ever showed today.** There was no
way to open yesterday, or last Tuesday, so a test entry logged on any earlier
day could never be corrected and never be deleted — while the review went on
counting it for the next ninety days. Every number on the screen was reachable
and none of the entries behind them were.

FUEL now has a day above the log: arrows either side, "back to today" when you
have stepped away, and `?date=` in the address if you would rather type it. Any
past day can be read, added to, corrected and deleted from. Tomorrow cannot —
the forward arrow stops on today and a future date in the URL clamps to it,
because there is no such thing as a meal you have not eaten yet.

Everything on the page follows the day you are on rather than the clock: the
entries, the water, the totals, and the calorie target, which now comes from
that day's phase instead of the current one.

One real bug did turn up next to it. **The favourites row was ordered by a
counter that only ever went up.** `uses` is incremented on every quick-log and
nothing has ever decremented it, so a coffee tapped forty times during an
evening of testing kept its place at the front of the row even after every one
of those entries was deleted — and starring something you had eaten fifty times
started it at zero. The order is counted from the entries themselves now, which
is the same answer without either failure.

`npm run check` grew the case: fourteen coffees, twelve deleted, and every
surface has to agree that two are left — the review's count, and the order of
the favourites row, while the old stored counter still reads forty.

No schema change.

---

## 1.7.1 — 2026-08-05

The hold timer got a voice, and a longer run-up.

**Five seconds of lead-in, not three.** Three is enough to put a phone down. It
is not enough to put a phone down and get into a wall handstand, which is the
case that decides the number.

**It beeps when the clock actually starts.** A rising pair of notes on zero, so
you are not guessing whether the countdown has finished while you are already
upside down. The five counting you in each get a small tick of their own.

**It chimes when the target is up, so you know when to release.** Three notes
rising, longer and louder than anything else it plays — the one sound that has
to be heard through a shaking plank and a heartbeat in your ears. Nothing else
in the app sounds like it. Past the target it keeps counting rather than
stopping, because going past is how a hold progresses, and a short tick every
thirty seconds tells you roughly where you are.

Stopping plays a falling pair, so it can never be mistaken for the start.

The tones are synthesised rather than shipped as audio files: three beeps as
assets would be more bytes than the code that makes them, and one more thing to
cache for an app expected to work with no network. They are triangle waves — a
sine at 900 Hz disappears under breathing and room noise, and a square is
unpleasant at the volume this needs.

Two browser details worth knowing about:

- The audio is unlocked by the tap that opens the timer, because that is the
  only moment a browser will allow it. Resuming it any later leaves it silent on
  iOS with no error to notice.
- **iPhones route this through the ringer channel**, so a phone with the side
  switch on silent will play none of it. Nothing on the web can override that.
  The vibration is still there, and on Android it is there regardless.

There is a speaker toggle in the timer's header if you would rather it were
quiet. The choice is remembered.

No schema change.

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
