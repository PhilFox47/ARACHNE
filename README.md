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

| Phase | |
|---|---|
| **1 — Foundation, Docker, VITALS core** | Done |
| 2 — PATROL | Sessions render read-only; logging, streak and heatmap pending |
| 3 — FUEL | Targets only |
| 4 — THE TRIAL, checkpoints, SUIT CHECK | Not started |

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
