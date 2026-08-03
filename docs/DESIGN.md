# ARACHNE — design sign-off

Pre-implementation spec. Nothing here is application code yet.

> **Blocked:** `spiderman-transformation-12-monate.md` is not in this repository, and
> `nano-gpt.com` is blocked by this environment's egress policy. See
> [Open blockers](#open-blockers). Everything below is the part that does not depend
> on either.

---

## 1. Visual identity

### The mark

Two SVGs in `design/`, hand-built (no traced assets, no character art):

- `arachne-mark.svg` — full mark, 24px and up
- `arachne-mark-compact.svg` — inner ring dropped, strokes thickened, for ≤48px

Geometry: a real orb web is **straight chords between radial spokes**, not concentric
circles. That's the whole idea — it gives a hard, technical, surveyed look rather than a
decorative spiral, and it's what separates this from a costume pattern.

- 8 spokes on an octagonal lattice, 3 chord rings
- A **crimson tripod** (up, down-right, down-left) carries the visual load over a thin
  cobalt lattice. Three heavy lines, not eight — asymmetry keeps it from reading as a
  compass rose or a snowflake.
- The outer ring is **deliberately snapped** in one sector, with node caps on the broken
  ends. Tension, and a silhouette you can recognise at a glance.
- Core is a crimson diamond with the base colour knocked out of the centre.

Colours are `var(--mark-crimson)` / `var(--mark-cobalt)` / `var(--mark-base)` with
literal fallbacks, so the same file works as favicon, PWA icon, nav glyph, and
watermark without forking it.

### Palette

| Token | Hex | Use |
|---|---|---|
| `--base` | `#0A0D16` | Page ground |
| `--panel` | `#141A2B` | Cards, sheets |
| `--edge` | `#243050` | Panel strokes — hard corners, visible stroke, no soft shadow |
| `--crimson` | `#D42A3F` | Effort, achievement, warnings, primary action |
| `--cobalt` | `#2B5CB8` | Data, history, calm states |
| `--text` | `#EDEBE8` | Primary |
| `--muted` | `#8A92A6` | Labels |

Red/blue is a **semantic split, not decoration**: a chart line is cobalt; the moment it
crosses a target it goes crimson. Rolling average cobalt, corridor band cobalt at low
alpha, out-of-corridor fill crimson.

### Type

- **Display / numbers:** Archivo Black — condensed, uppercase, tight tracking
- **Body:** Inter
- Self-hosted via `next/font/local`. No Google Fonts request at runtime; the PWA has to
  work offline and a font CDN is a network dependency I don't want.
- **Numbers are the heroes.** HQ weight is ~72px. Its label is 11px, uppercase,
  `--muted`, letter-spaced. That ratio is the house style everywhere.

### Texture

1. **Web lattice** — one tiling SVG at 8–12% opacity, `position: fixed`, `pointer-events: none`, behind everything. Fixed rather than scrolling, so it reads as an etched surface rather than wallpaper moving under the data.
2. **Halftone** — CSS `radial-gradient` dot grid, hero surfaces only.
3. **Tensioned dividers** — a rule with a node dot at each end and one off-centre, instead of `<hr>`.

### Motion

| Element | Behaviour |
|---|---|
| Loading | Web-lines draw node → node. No spinners. |
| Numbers | Count up on mount, ~400ms, ease-out. Once per mount, never on re-render. |
| Cards | Swing in on a slight arc — `transform-origin` top centre, small rotate → 0. |
| Session complete | Impact lines radiate from the tap point, scale snap, `navigator.vibrate(...)`. |

Restraint rules, enforced in code rather than by intention:

- Everything ≤400ms. Nothing blocks input.
- `prefers-reduced-motion` kills all of it.
- The completion burst is the **only** celebratory animation in the app. If it fires
  everywhere it stops meaning anything by week three.

### Rank progression

You suggested ROOKIE → NEIGHBORHOOD → CITYWIDE → LEGEND. I'd change two things.

Five tiers, not four — twelve monthly trials across four ranks means long dead stretches
where the number moves and nothing happens. And I'd drop LEGEND: it's an endpoint, and
month 12 isn't one.

| Rank | Feel |
|---|---|
| **UNTESTED** | Before trial #1. Not a rank you earn — a state you leave. |
| **ROOKIE** | |
| **NEIGHBORHOOD** | |
| **CITYWIDE** | |
| **NO CEILING** | Above the month-12 target across the board. |

**Thresholds are deliberately unset** — they have to be derived from the plan document's
month-12 targets (600 points = every station at target, since each station normalises to
100). Picking them now would mean inventing the numbers you told me not to invent.

---

## 2. Data model

SQLite + Drizzle. No users table — single user, stateless signed cookie. Dates are
`TEXT` ISO `YYYY-MM-DD` in local time; timestamps are Unix integers.

| Table | Columns | Notes |
|---|---|---|
| `weights` | `id`, `date` **unique**, `weight_kg`, `created_at` | Daily. One field, two taps. |
| `measurements` | `id`, `date`, `weight_kg`, `waist_cm`, `neck_cm`, `chest_cm`, `thigh_cm`, `upper_arm_cm`, `bodyfat_pct`, `trial_id?`, `created_at` | `bodyfat_pct` **stored**, not computed on read — height could change the formula's output retroactively and I want the historical number frozen. |
| `sessions` | `id`, `date` **unique**, `day_key`, `phase`, `completed`, `rpe?`, `note?`, `created_at` | PATROL log. `day_key` ∈ mon…fri. |
| `food_entries` | `id`, `logged_at`, `date`, `description`, `norm_key`, `kcal?`, `protein_g?`, `carbs_g?`, `fat_g?`, `meal_type`, `photo_path?`, `source`, `ai_confidence?`, `edited`, `created_at` | All macros **nullable** — a failed AI call still saves the entry. `source` ∈ ai\|manual\|quick. |
| `trials` | `id`, `date`, `month_index`, `is_checkpoint`, `pushups_reps`, `pullups_reps`, `deadhang_sec`, `plank_sec`, `squat_hold_sec`, `burpees_3min_reps`, `sit_reach_cm`, `circuit_total_sec`, `score`, `station_scores`, `notes?` | `score` and `station_scores` **stored**, not recomputed — if a target is ever corrected, past scores must not silently shift. |
| `abilities` | `id`, `trial_id`, `ability_key`, `achieved`, `value?`, `note?` | Keys defined in `lib/plan.ts`. |
| `photos` | `id`, `date`, `month_index`, `angle`, `path`, `created_at` | SUIT CHECK. `angle` ∈ front\|side\|back\|side_flexed. |
| `settings` | `key` **PK**, `value` | K/V JSON. `photo_correction_pct`, `start_date`, `start_weight_kg`, `target_weight_kg`, `height_cm`. |
| `sense_dismissals` | `id`, `insight_key`, `dismissed_at` | So SENSE stops nagging once acknowledged. |

**No `quick_items` table.** Quick-log candidates are a `GROUP BY norm_key HAVING count >= 3`
over `food_entries`. A second table would need dual-writes and would drift out of sync
with edits. Derived is correct here, and at a few thousand rows the query is free.

### Two decisions worth flagging

**Stored derived values** (`bodyfat_pct`, `score`, `station_scores`). Normally I'd
compute on read. Not here: this is a 12-month longitudinal record, and a number that
retroactively changes because a config value moved makes the whole history untrustworthy.

**Everything in FUEL is nullable except `description`.** Enforced at the schema level —
it's the only thing that structurally guarantees "an entry without numbers beats no entry."

---

## 3. Routes

**Server Actions for all mutations.** API routes only where something external needs a
URL. Fewer moving parts, no client-side fetch layer, no state library.

### Pages

| Route | |
|---|---|
| `/login` | Password only |
| `/` | **HQ** — header stats, SENSE, trial-due card, today's patrol |
| `/patrol` | Week view, phase-correct exercises, 8-week heatmap |
| `/fuel` | Today — camera button first |
| `/fuel/week` | Weekly review, snack-vs-meal chart |
| `/vitals` | Weight chart, corridor, measurements |
| `/trial` | History, score chart, radar |
| `/trial/run` | **Full-screen guided flow.** No nav, no chrome. |
| `/trial/[id]` | Result + checkpoint comparison |
| `/suit-check` | Grid by month |
| `/suit-check/compare` | Two months, swipe slider |
| `/settings` | Correction factor, export, reset |

### API

| Route | |
|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` | |
| `GET /api/health` | Compose healthcheck. Pings the DB, not just the process. |
| `POST /api/analyze-meal` | **The only path to the API key.** |
| `GET /api/export?format=json\|csv` | |
| `GET /api/photo/[...path]` | Auth-gated image serving off the volume |

Bottom nav is four items — **HQ · PATROL · FUEL · VITALS**. THE TRIAL is an HQ card when
due. SUIT CHECK and settings hang off HQ and TRIAL.

### `/api/analyze-meal` contract

Non-negotiable: **it never returns an error that blocks the entry.**

1. Client compresses to 1200px max edge, posts a data URL
2. Server calls Nano-GPT via the `openai` SDK with `baseURL` overridden, 20s timeout
3. Response is stripped of ``` fences, then `JSON.parse` in a try/catch, then field-by-field coerced — anything unparseable becomes `null`, never an exception
4. On timeout / 5xx / garbage → `200` with `{ description: <user's text>, kcal: null, ... }`

The entry is written client-side **before** the call returns. The AI result patches it.
That's what makes the three-interaction budget survive a slow network — a spinner between
tap and saved is exactly the friction that kills this in week three.

---

## 4. Open blockers

### A. The plan document is missing

`spiderman-transformation-12-monate.md` is not in the repository. The repo was empty —
no commits, no branches — and the file is nowhere on this machine.

It is the source for: per-phase calorie targets, the weekly exercise structure and its
phase-by-phase deltas, phase boundaries, all four checkpoint targets, month-12 station
targets (which the ARACHNE Score normalises against), and the ABILITIES list.

You said not to invent fitness numbers, so I haven't. **Please attach or commit it.**

Phase 1 is *nearly* unblocked without it — the corridor is 100→80 kg ±1.5 kg from your
brief, not the document. The one gap is the HQ header's "current phase with its calorie
target." I can build Phase 1 with `lib/plan.ts` stubbed and fill it in when the document
lands, if you'd rather not wait.

### B. Nano-GPT is unreachable from this environment

Both `nano-gpt.com` and `docs.nano-gpt.com` return 403 at the egress proxy — an
organization policy denial, not a transient failure. I can't query
`/models?detailed=true`, so I **cannot give you verified current pricing**, and I won't
print a table of numbers I couldn't check.

Two things instead:

**`scripts/list-vision-models.mjs`** — run it on the server, where the host isn't
blocked. It pulls the live list, filters to vision-capable, normalises the pricing key
spellings across providers, and sorts cheapest-first with an estimated cost per 1,000
meal photos.

```
NANOGPT_API_KEY=sk-... node scripts/list-vision-models.mjs
```

**A recommendation from model classes rather than a price table** — the exact IDs need
confirming against that output:

| Class | Why |
|---|---|
| **Gemini Flash-Lite** ← default | Cheapest per image by a wide margin, fastest, reliable structured JSON |
| **GPT-mini** | Fallback if Flash's estimates skew badly |
| **Claude Haiku** | Best instruction-following; costs more than the task needs |
| **Qwen-VL** | Open-weight, very cheap on aggregators, more variable |

Reasoning for the default: "photo → rough macros" is a low-difficulty vision task, and
you've said outright this is about awareness, not precision. The binding constraints are
latency and cost, not reasoning depth — and the settings correction factor exists
precisely to absorb a model's systematic bias. Paying Haiku prices to sharpen an estimate
you've said you don't need would be the wrong trade.

It's one env var. `.env.example` will carry the alternatives as comments.
