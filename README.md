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

```bash
./scripts/backup.sh                     # → ./backups/arachne-YYYYmmdd-HHMMSS.tar.gz
./scripts/backup.sh /mnt/nas/arachne    # elsewhere
```

Snapshots the live database with `VACUUM INTO` rather than copying the file — SQLite runs in WAL
mode, so a plain `cp` of a running database can be torn. Keeps the newest 30 archives
(`ARACHNE_KEEP=0` to disable pruning).

Cron it — daily at 04:00:

```
0 4 * * * cd /srv/arachne && ./scripts/backup.sh >> /var/log/arachne-backup.log 2>&1
```

### Restore

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
| FUEL — photo capture, nutrition estimates, daily log, quick-log | Done; weekly review pending |
| THE TRIAL, checkpoints, SUIT CHECK | Not started |

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
