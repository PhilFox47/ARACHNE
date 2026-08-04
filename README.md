# ARACHNE

Private 12-month transformation console. Single user, self-hosted, never public.

Plan source: `spiderman-transformation-12-monate.md`
Extraction and derivations: `docs/PLAN-EXTRACT.md`
Identity and architecture: `docs/DESIGN.md`

---

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind 4 · SQLite via better-sqlite3 + Drizzle · Recharts · PWA

All plan data — phases, calorie targets, sessions, checkpoints, trial targets, ranks — lives in
`lib/plan.ts`. Nothing else hardcodes a fitness number.

---

## Run

```bash
cp .env.example .env          # set APP_PASSWORD and SESSION_SECRET
docker compose up -d --build
```

`http://<server>:3000`

### Update

```bash
git pull
docker compose up -d --build
```

Volumes survive rebuilds.

### Logs / status

```bash
docker compose logs -f arachne
docker compose ps                       # health comes from /api/health
curl localhost:3000/api/health
```

---

## Backup

The app backs itself up. Once a day it writes a dated directory into its own volume holding a
consistent snapshot of the database and every image; **31 are kept**, and writing the 32nd drops the
oldest. Nothing to schedule and nothing to install.

```
/data/backups/
  2026-08-04/  arachne.db  uploads/  manifest.json
  2026-08-03/  ...
```

The snapshot uses `VACUUM INTO` rather than copying the file — SQLite runs in WAL mode, so a plain
`cp` of a running database can be torn. Images are hard-linked to the previous day wherever the file
already exists, which is almost always: uploads are written once under a random name and never
edited. A month of daily backups therefore costs about one day of disk. Measured on 8 MB of photos:
nine backups, 360 image entries, 40 inodes, 9 MB used instead of 76 MB.

`SETTINGS → Backups` lists them with sizes and row counts, and offers **Back up now**, **Download**
and **Restore**. Restoring is guarded the same way a reset is — pick a date, read what it holds, type
`RESTORE`.

| Variable | Default | |
|---|---|---|
| `BACKUP_DIR` | `/data/backups` | Point it at a NAS mount to get backups off the machine |
| `BACKUP_KEEP` | `31` | How many days to hold. `0` disables backups entirely |
| `BACKUP_DISABLED` | — | `1` to switch the schedule off without changing the count |
| `TZ` | `Europe/Berlin` | Decides which calendar day a backup belongs to |

Timing is an hourly check for "is there a backup for today yet?", not a timer set for midnight. Same
result on a machine that stays up, and a better one on a machine that doesn't: a container restarted
at 23:58 loses nothing, and one that was off for a week backs up within the hour of coming back.

### From the command line

```bash
npm run backup                # write today's now
npm run backup -- --force     # replace today's
npm run restore               # list what's available
npm run restore -- 2026-08-04 # restore that day
npm run restore -- ./some.db  # restore any ARACHNE database file
```

### Importing somewhere else

Every backup downloads as a plain SQLite file. **Import a database file** on the settings screen
takes one back — including one from a different machine. Older files are migrated forward before a
row is written; a file from a newer build is refused rather than half-applied. Images aren't part of
a database file, so an import leaves the ones already present alone.

### Off the machine

The rolling set protects against losing the *data*. It does not protect against losing the *host* —
for that, `scripts/backup.sh` pulls a timestamped archive out of the container to wherever you point
it:

```bash
./scripts/backup.sh                     # → ./backups/arachne-YYYYmmdd-HHMMSS.tar.gz
./scripts/backup.sh /mnt/nas/arachne    # elsewhere
```

Cron it — daily at 04:00:

```
0 4 * * * cd /srv/arachne && ./scripts/backup.sh >> /var/log/arachne-backup.log 2>&1
```

Restoring one of those archives, with the container down:

```bash
docker compose down
tar -xzf backups/arachne-20260803-040000.tar.gz -C /tmp/restore

docker run --rm -v arachne_arachne-db:/db -v /tmp/restore:/in alpine \
  sh -c 'rm -f /db/arachne.db*; cp /in/arachne.db /db/arachne.db'
docker run --rm -v arachne_arachne-uploads:/up -v /tmp/restore:/in alpine \
  sh -c 'rm -rf /up/*; cp -r /in/uploads/. /up/'

docker compose up -d
```

Removing `arachne.db*` clears stale `-wal` and `-shm` sidecars — leaving them can shadow the
restored file. Check the volume names against `docker volume ls` first; Compose prefixes them with
the project directory name.

---

## Versions and data compatibility

The running version is shown in `SETTINGS → Version`, with the release notes behind it, and tracked
in [CHANGELOG.md](CHANGELOG.md). `MAJOR.MINOR.PATCH`: small changes move the last number, larger
ones the middle, a fundamental change the first.

**Every database written by every earlier version must still open.** The app is being used while it
is being built, so this is not aspirational — a change that cannot carry an existing database
forward is a change that does not ship.

The schema is versioned inline via `PRAGMA user_version`. Each migration in `lib/db/index.ts` is
frozen at the shape it had the day it was written and runs exactly once, so a fresh volume and a
volume that has been running since day one converge on the same schema.

```bash
npm run check
```

Builds a database at every historical schema version, seeds every table, migrates it forward, and
verifies the version, the integrity check, that no row was lost, that re-opening is a no-op, and
that a fresh install ends up structurally identical to one upgraded from v1. It also checks that
every progression-ladder rung can be read back out of the logs. Run it before every release.

### Adding a migration

1. Change `lib/db/schema.ts`.
2. Append a step to `MIGRATIONS`. Never edit an existing one — someone's volume already ran it.
3. Make it idempotent: `IF NOT EXISTS`, or check `table_info` before `ALTER`.
4. Don't import from `lib/` inside a migration. It has to keep behaving the way it did the day it
   was written, and the rest of the codebase is free to change underneath it.
5. `npm run check`.
6. Bump the version in `lib/version.ts`, `package.json` and `CHANGELOG.md`.

---

## Development

```bash
npm install
npm run dev                             # DATABASE_PATH defaults to ./data/db/arachne.db
npm run db:seed                         # ~10 weeks of synthetic readings
npm run db:reset -- --yes               # wipe everything, pin day 0 to today
npm run typecheck
```

Run `db:reset -- --yes` once before starting for real.

### Icons

```bash
node scripts/gen-icons.mjs              # public/icons/icon.svg → PNG set
```

---

## Configuration

All via environment. See `.env.example`.

| Variable | |
|---|---|
| `APP_PASSWORD` | The only credential. No registration, no user table. |
| `SESSION_SECRET` | Signs the session cookie. Changing it logs you out. |
| `COOKIE_SECURE` | `true` only behind TLS. A Secure cookie over plain HTTP is dropped and you cannot log in. |
| `NANOGPT_API_KEY` | FUEL photo analysis (Phase 3). Server-side only — never reaches the client. |
| `NANOGPT_VISION_MODEL` | Which vision model. Not hardcoded anywhere. |
| `DATABASE_PATH` · `UPLOAD_DIR` | Set by Compose to the two volumes. |
| `TZ` | Dates are stored in local time; this is what defines local. |

### Choosing a vision model

```bash
NANOGPT_API_KEY=sk-... node scripts/list-vision-models.mjs
```

Lists every vision-capable model on your account, cheapest first, with estimated cost per 1,000
meal photos. Set the winner as `NANOGPT_VISION_MODEL`.

---

## Build status

| Area | |
|---|---|
| Foundation, Docker, VITALS core | Done |
| Progression — XP, levels, disciplines, challenges, achievements | Done |
| PATROL — week view, per-set logging, check-off, AI progression | Done; eight-week heatmap pending |
| JOURNEY — phase overview, checkpoints, what's behind and ahead | Done |
| FUEL — capture, nutrition estimates, daily log, quick-log, water | Done |
| FUEL statistics — intake, snack split, water and timing over 7/30/90 days | Done |
| SUIT CHECK — weekly photos, four angles, comparison wipe | Done |
| THE TRIAL and checkpoints | Not started |

### Progression

Level and ARACHNE Score are deliberately separate. Score says how capable you are and only moves at
THE TRIAL; level says how much work you've put in and moves every day. Capability plateaus for weeks
at a time while effort keeps paying out — that gap is where people quit.

Everything is derived from the database on read. There is no stored XP to drift out of sync, and
changing a rule retroactively fixes history. Tune the values at the top of `lib/game.ts`.

Weekly and monthly challenges are generated from a seed derived from the period key, so the set is
stable within a period and different the next. Nothing rerolls on refresh.

### PATROL and progression

`lib/plan.ts` owns **structure** — which day is which session, which phase you're in, which movements
belong to it, and every target read from the plan document. A model never writes to it.

`lib/training.ts` owns **prescription** — sets, reps, load, and when to progress. It reads your
logged history and asks the model to adjust today's numbers. The movement list is not negotiable:
anything the model invents is dropped on merge, anything it omits keeps the plan's numbers, and set
counts are clamped to ±1 of the plan even if the instruction is ignored. A model can tell you to add
2.5 kg to a goblet squat; it cannot decide Wednesday is now a push day.

Prescriptions are cached per date. Regenerating on every load would mean the target moved while you
were mid-session. `Re-suggest` forces a fresh one.

Every failure path falls back to the plan's own numbers with your last logged performance applied —
no key, no model, a timeout or garbage JSON all produce a usable session rather than an error.

### Phase 0 — the baseline fortnight

The first two weeks are measurement, not training. The document is blunt about why: *start at 70%;
if you're flat on your back with soreness in week 1, you don't train in week 2.*

So in Phase 0 the prescription takes the **low end** of every range, two rounds instead of three, and
every movement carries "stop well short". The model is not consulted at all — progressing a number
you haven't established yet is exactly the mistake the fortnight exists to prevent. What you log
becomes the starting point Phase 1 builds on.

`/baseline` captures the document's day 1 measurements and day 2 six-test fitness baseline (including
the 12-minute walk, which is not part of THE TRIAL and is deliberately not scored).

Water is logged in 250 ml taps against a configurable target — 2 L by default, the document asks for
3. The point in Phase 0 is finding out whether the target is a change or already normal.

### SUIT CHECK

Weekly rather than monthly — 52 frames of time-lapse instead of 12. Four angles, each its own camera
button so a set can be built across the day. One shot per angle per week; re-shooting replaces the
file and deletes the old one, so a year doesn't accumulate orphans.

Comparison overlays two weeks with a draggable wipe rather than placing them side by side. At phone
width a side-by-side pair gives you two 180px images and tells you nothing; a full-width wipe is the
only treatment where a few centimetres off a waist is actually visible. The clip is done with
`clip-path`, so both sides are always the identical crop.

`npx tsx scripts/seed-suit.ts` fills three weeks with placeholder frames for development.

### Equipment

`lib/equipment.ts` drives what actually gets prescribed, in two directions.

**Gating** swaps a movement you can't perform for a named substitute, in code, every time — one rule
per movement rather than per equipment type, chosen to keep the training effect. No bar swaps
vertical pulling for inverted rows; no load turns a goblet squat into slow-tempo bodyweight squats
and a shoulder press into pike push-ups. A dead hang with no bar is dropped outright, because there
is no honest bar-free version.

**Upgrades** go the other way: own rings and dips become ring dips, rows become ring rows, the dead
hang becomes a ring hang; own parallettes and push-ups gain depth and the L-sit becomes learnable.
Every upgrade stays inside the movement pattern the plan prescribed — a ring dip is still a dip.
Equipment changes how a movement is loaded, never which movement the day is for.

Substitutions that collide with something already prescribed are dropped rather than duplicated,
since sets are keyed by movement and duplicates would overwrite each other's logs.

Thursday's pick-one list is built from the VR games you own, managed in Settings alongside the
equipment. With no headset it falls back to the plan's own outdoor sprint intervals, plus jump rope
or a rower if you have them, so the session still happens rather than listing software you can't run.

Changing either list clears cached prescriptions so they regenerate.

### FUEL

Photos are compressed to a 1200px max edge in the browser, then the entry is **saved before the
model is called**. A slow or failed analysis can never cost you the log — the row keeps its
description with null macros. `/api/analyze-meal` returns 200 even on failure for exactly this
reason.

Estimates cover the full EU mandatory nutrition declaration — energy, fat, saturates, carbs, sugars,
fibre, protein, salt — because that is what German packaging prints, so the model is working in a
format it has seen a great deal of. The prompt states German portions and packaging explicitly
(500 ml cans, 250 g Magerquark, Brötchen at ~60 g); portion inference is where photo estimates go
wrong, and a model defaulting to US sizes is off by 40% before it considers the food.

`/fuel/stats` reviews intake over 7, 30 or 90 days: calories with a 7-day mean against the phase
target, the snack-versus-meal split, water, hour-of-day distribution, per-weekday snack load, the
snacks driving the most energy, and a week-by-week table.

Averages count only days you actually logged. Treating an untracked day as a zero-calorie day would
quietly flatter every number on the screen.

Intake tracking is live from day one. Phase 0 prescribes no deficit, so FUEL frames those two weeks
as calibration: track honestly and find out how close the estimates really are.

---

## Notes

**Auth** is a signed httpOnly cookie with a one-year lifetime. `middleware.ts` only checks that a
cookie exists — real verification happens in `isAuthed()` on every page and `guard()` in every
server action, because the edge runtime can't use `node:crypto`.

**Derived values are stored, not recomputed.** Body fat and trial scores are written at capture
time. Over a 12-month record, a number that retroactively shifts because a config value moved makes
the whole history untrustworthy.

**Image optimization is off** (`images: { unoptimized: true }`). Photos are compressed client-side
before upload and served straight off the volume, so Next's optimizer adds nothing — and sharp,
which carries open libvips CVEs with no fixed release, is never invoked. `npm audit` also flags
postcss inside Next's build toolchain; both are transitive, build-time only, and have no upstream
fix available.
