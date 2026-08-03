# Plan extraction — what goes into `lib/plan.ts`

Everything below is read out of `spiderman-transformation-12-monate.md`. Where the
document states a value, it is used verbatim. Where a complete session had to be
**derived** from a delta list, the derivation is shown and marked. Where the document is
**silent** on something the brief requires, it is marked `GAP` and listed in §7.

---

## 1. Phases

| Phase | Months | Weight | kcal | Protein |
|---|---|---|---|---|
| **0 — Setup** | Weeks 1–2 | — (no deficit) | 2,700 | — |
| **1 — Foundation** | 1–3 | 100 → 93 kg | 2,300 | 160 g |
| **2 — Build** | 4–6 | 93 → 88 kg | 2,200 | 160 g |
| **3 — Athletic** | 7–9 | 88 → 84 kg | 2,150 | 165 g |
| **4 — Suit-Ready** | 10–12 | 84 → 80 kg | 2,100 | 170 g |

Two documented overrides on the calorie target:

- **Final 2 weeks of Phase 4** → back to maintenance ~2,400 kcal
- **Stall rule** (Phase 4, 3+ weeks flat) → one week at 2,400 kcal, then back into deficit.
  Hard floor: **never below 2,000 kcal**.

Phase 1 also fixes macros beyond protein: **~70 g fat, remainder carbs**.

## 2. Week structure

| Day | Session |
|---|---|
| Mon | Push & Core |
| Tue | Mobility & Flow |
| Wed | Pull & Legs |
| Thu | Conditioning (VR) |
| Fri | Skills & Explosive |
| Sat/Sun | OFF-DUTY — optional 45 min walk |

Every session: **4 min warm-up → 22 min work → 4 min cooldown**.
**Every 4th week is a LOW PROFILE WEEK:** 2 rounds instead of 3, no training to failure.

Non-session target the app should surface: **8,000–10,000 steps/day**. The document calls
this "the invisible half" and says it burns more than the training does.

---

## 3. Derived sessions

Phase 1 is stated in full. Phases 2–4 are delta lists, so each session below is Phase 1
plus the stated changes. **`REPLACE` vs `ADD` is my reading** — the document uses `+`
prefixes only on Tuesday, so everywhere else the distinction is inferred from whether the
new movement is a harder version of an existing slot.

### Monday — Push & Core

**Warm-up** Arm circles 20 · Scapula push-ups 10 · Cat-cow 10 · Towel shoulder circles 10
**Cooldown** Doorway chest stretch 45 s/side · Child's pose 60 s

| Slot | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| Push | Elevated push-ups 8–12 | `REPLACE` Floor → diamond → archer 8–12 | `REPLACE` Clap push-ups 5–8 + Archer push-ups 8–10/side | = P3 |
| Vertical | — | `ADD` Pike push-ups 8–12 | `REPLACE` Pike push-ups **elevated** 8–12 | = P3 |
| Press | DB shoulder press 10–12 | = | = | = |
| Triceps | Chair-edge dips 8–12 | `REPLACE` Dips between two chairs 8–12 | = | = |
| Delts | Lateral raises 12–15 | = | = | **+1 volume set** (4×) |
| Core | Dead bug 10/side · Plank 30–45 s | = | = | `REPLACE` daily 5-min core: hollow hold · dragon flag negatives · hanging knee raises |

> Progression rule (P1): the flatter the hands, the harder. Table → chair → sofa edge →
> floor. Only advance at a clean 3×12.

### Tuesday — Mobility & Flow

| Phase 1 | Dose |
|---|---|
| Deep squat hold, heels down | 3× 45 s |
| Spiderman lunge with rotation | 8/side |
| 90/90 hip switches | 10/side |
| Cossack squat | 8/side |
| Open book (T-spine) | 10/side |
| Couch stretch | 60 s/side |
| Wall slides | 15 |
| Thread the needle | 8/side |

- **Phase 2** `ADD` Jefferson curl (light, 4 kg) · Pancake progression · Bridge
- **Phase 3** `REPLACE` with active versions: pancake (active) · bridge **push-up** · active hip rotations
- **Phase 4** unchanged

> Never stretch into pain. Pulling yes, stabbing no. Mobility happens on the exhale.

### Wednesday — Pull & Legs

**Warm-up** Hip circles · Leg swings 10/side · Bodyweight squats 15 · Glute bridges 15
**Every Wednesday, additionally:** 3× dead hang to just short of letting go.

| Slot | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| Squat | Goblet squat 12–15 | = | `ADD` Pistol squat progression (to chair) | = |
| Row | Single-arm DB row 10–12/side | = | `REPLACE` Archer rows | = |
| Hinge | Romanian deadlift 12 | = | = | = |
| Horiz. pull | Inverted rows 8–12 | = | = | = |
| Vert. pull | — | `ADD` **Negative pull-ups 5× 5 s** → first real pull-ups | `REPLACE` Explosive pull-ups | **+1 volume set** |
| Lunge | Reverse lunges 10/side | `REPLACE` Bulgarian split squats | = | = |
| Hamstring | — | `ADD` Nordic curl negatives on sofa | = | = |
| Iso | Wall sit 30–45 s | = | = | = |
| Power | — | — | `ADD` Broad jumps | = |

> **Pull-up protocol (P2, the phase's key progression):** Wed + Fri, 5 sets of negatives.
> Jump up, lower as slowly as possible — target 5 s. At 5×5 s, attempt a real pull-up.
> From the first rep onward: greasing the groove — 1–2 pull-ups in passing through the
> day, never to failure.

### Thursday — Conditioning (VR)

25 minutes continuous, heart rate high. Pick one: **Supernatural** (Flow/Boxing,
"Intense") · **Beat Saber** (7–8 songs on Expert, full-body — not just wrists) · **Thrill
of the Fight** (3× 3-min rounds) · **Les Mills Bodycombat** / **FitXR**.

- **Phase 2** intervals: 2 min all-out / 1 min easy × 8
- **Phase 3** every 2nd week, replace with outdoor sprints: 8× 30 s sprint / 90 s walk
- **Phase 4** unchanged

> The rule: the goal is being out of breath, not the high score. Not sweating after 25 min
> means it was too easy.

### Friday — Skills & Explosive

| Phase 1 | Dose |
|---|---|
| Bear crawl fwd/back | 3× 30 s |
| Spider crawl (low, belly near floor) | 3× 20 s |
| Wall handstand (belly to wall, walk up) | 3× 20–30 s |
| Shoulder roll | 10/side |
| Squat jumps | 3× 8 |
| Hollow hold | 3× 20 s |
| Burpees | 3× 8 |

- **Phase 2** `ADD` Cartwheel · Kip-up progression · L-sit tuck · Freestanding handstand attempts
- **Phase 3** `ADD` Roundoff · Muscle-up progression (explosive pull-ups + dips) · Precision jumps · Wall run
- **Phase 4** skills combine into **flows**: roll → kip-up → jump → landing in the Spidey crouch

> **Daily handstand protocol (from P2):** 5 min every day, rest days included. Wall
> handstand → kick-up to wall, back to wall → brief releases. A daily habit, not a
> training block.

---

## 4. Checkpoints

| Metric | Start | M3 | M6 | M9 | M12 |
|---|---|---|---|---|---|
| Weight | 100 kg | **93** | **88** | **84** | **80** |
| Waist | ~110 cm | **~103** | **~97** | **~92** | **~85–88** |
| Push-ups | ~5 | **12–15** | **25** | **35** | **45** |
| Pull-ups | 0 | **1–2 negatives** | **3–5** | **8** | **12** |
| Plank | ~45 s | **90 s** | **2 min** | `GAP` | **3 min** |
| Dead hang | ~20 s | **45 s** | **60 s** | `GAP` | `GAP` |
| Deep squat hold | ~20 s | **60 s** | **2 min** | `GAP` | `GAP` |
| Sit-and-reach | ? | `GAP` | `GAP` | `GAP` | **+15 cm** |
| Free handstand | — | — | first seconds | **10 s** | **15 s** |
| Pistol squat | — | — | — | **chair, both sides** | **both sides** |

## 5. ABILITIES per checkpoint

- **M3** — clean shoulder roll both sides · wall handstand 30 s · deep squat without heel lift
- **M6** — cartwheel both sides · wall handstand 60 s · L-sit tuck 15 s · first free handstand seconds
- **M9** — roundoff · free L-sit 10 s · kip-up to crouch · wall run
- **M12** — freestanding handstand 15 s · kip-up to stand · clean roundoff · pistol squat both sides · L-sit 15 s · muscle-up *(stretch)* or 12 clean pull-ups · wall run + Spidey-crouch landing

## 6. Baseline test (document, day 2)

Push-ups max · Plank max · Dead hang · Deep squat hold · Sit-and-reach · **12-min walk test**

Note the mismatch with THE TRIAL as specified in the brief: the document's baseline has a
**12-minute walk test** and no pull-ups; the brief's trial has **pull-ups** and **burpees
in 3 minutes** and no walk test. See §7.

---

## 7. Gaps and conflicts

Numbered for reply.

**G1 — The corridor is not linear in the document.** The brief specifies a straight
100 → 80 kg interpolation. The document's phase targets are front-loaded: 7 kg in the
first quarter, then 5, 4, 4 — and it says outright that *"the last 5 kg take twice as long
as the first 5."* At month 3, linear says 95 kg and the document says **93 kg**. That 2 kg
gap is wider than the ±1.5 kg band, so on a linear corridor you would read as "ahead of
target" for most of the first quarter while actually being exactly on the document's plan.

**G2 — Photo correction default.** The brief says default 0 %. The document says
*"add +20 % to photo estimates,"* citing the NIDDK/NUTRITION 2026 analysis that found
photo apps underestimate by 250–345 kcal per meal.

**G3 — Phase 0 is missing from the brief.** The document opens with a 2-week setup phase:
no deficit, ~2,700 kcal, track only, baseline measurements on day 1 and the fitness test on
day 2. *"Start the deficit in week 3, once tracking and training are already habit."*

**G4 — Three trial stations have no month-12 target,** so the ARACHNE Score can't normalise
them:

| Station | Documented | Missing |
|---|---|---|
| Deep squat hold | M3 60 s, M6 2 min | **M12 target** |
| Burpees in 3 min | *nothing, anywhere* | **all targets** |
| Timed circuit | *nothing, anywhere* | **all targets** |
| Dead hang *(fallback for station 2)* | M3 45 s, M6 60 s | **M12 target** |

Push-ups (45), pull-ups (12), plank (180 s) and sit-and-reach (+15 cm) are all documented
and normalise cleanly.

**G5 — Waist is a documented target at every checkpoint** (110 → 103 → 97 → 92 → 85–88 cm).
The brief says waist should carry more visual weight than the scale, and the document
agrees emphatically: *"80 kg is a number, not a goal… waist circumference and photos beat
the scale."* Worth treating the waist corridor as a first-class chart next to weight, not
a secondary readout.

**G6 — Neck measurement.** Needed for the US Navy body-fat formula, but the document's
measurement list is weight / waist / chest / thigh / upper arm. No conflict — just noting
that neck comes from the brief, not the plan.
