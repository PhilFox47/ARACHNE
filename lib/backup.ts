/**
 * Rolling daily backups.
 *
 * One directory per calendar day, thirty-one of them kept, the oldest dropped
 * when a thirty-second is written. Each holds a consistent snapshot of the
 * database and a mirror of the image volume.
 *
 * Two things make this cheap enough to run unattended:
 *
 *   `VACUUM INTO` takes the snapshot. SQLite in WAL mode keeps committed data
 *   outside the main file, so copying it while the app runs can produce a torn
 *   backup — this is the supported way to snapshot a live database, and it
 *   compacts as it goes.
 *
 *   Images are hard-linked to yesterday's copy where the file already exists.
 *   Uploads are written once under a random name and never modified, so a
 *   matching path is the same bytes. Thirty-one days of photos therefore cost
 *   about one day of disk, and the ones that changed are the only real copies.
 *
 * Deliberately separate from `scripts/backup.sh`, which pulls an archive out of
 * the container onto the host. That protects against losing the machine; this
 * protects against losing the data, which is the more likely of the two.
 */

import fs from "node:fs";
import path from "node:path";
import { DB_PATH, SCHEMA_VERSION, openAt, sqlite } from "./db";
import { UPLOAD_DIR } from "./photos";
import { toISODate } from "./dates";

export const BACKUP_DIR = process.env.BACKUP_DIR ?? "./data/backups";

/**
 * One a day for a month, plus the day you are standing on. Long enough that a
 * problem noticed "some time last month" is still recoverable, short enough
 * that the set stays comprehensible at a glance.
 */
export const KEEP_BACKUPS = Number(process.env.BACKUP_KEEP ?? 31);

const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;
const MANIFEST = "manifest.json";
const DB_FILE = "arachne.db";
const IMAGES = "uploads";

export interface BackupManifest {
  date: string;
  createdAt: number;
  schemaVersion: number;
  dbBytes: number;
  imageCount: number;
  imageBytes: number;
  /** Row counts, so the list screen can show what a backup actually holds. */
  counts: Record<string, number>;
}

export interface BackupInfo extends BackupManifest {
  /** True when the manifest is missing or unreadable — restore is still tried. */
  partial: boolean;
}

// ─────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────

function dirFor(date: string): string {
  return path.join(BACKUP_DIR, date);
}

/** Newest first. */
export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  const out: BackupInfo[] = [];
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    if (!DATE_DIR.test(name)) continue;
    const dir = dirFor(name);
    if (!fs.existsSync(path.join(dir, DB_FILE))) continue;

    try {
      const raw = fs.readFileSync(path.join(dir, MANIFEST), "utf8");
      out.push({ ...(JSON.parse(raw) as BackupManifest), partial: false });
    } catch {
      // A backup whose manifest is gone is still a backup. Report what can be
      // read off the filesystem rather than hiding it from the restore list.
      const stat = fs.statSync(path.join(dir, DB_FILE));
      out.push({
        date: name,
        createdAt: Math.floor(stat.mtimeMs / 1000),
        schemaVersion: 0,
        dbBytes: stat.size,
        imageCount: 0,
        imageBytes: 0,
        counts: {},
        partial: true,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function hasBackupFor(date: string): boolean {
  return fs.existsSync(path.join(dirFor(date), DB_FILE));
}

// ─────────────────────────────────────────────────────────────
// Writing
// ─────────────────────────────────────────────────────────────

function tableNames(db: { prepare: (s: string) => { all: () => unknown[] } }): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  return rows.map((r) => r.name).sort();
}

function rowCounts(file: string): Record<string, number> {
  const src = openAt(file);
  try {
    const out: Record<string, number> = {};
    for (const t of tableNames(src)) {
      const row = src.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number };
      out[t] = row.n;
    }
    return out;
  } finally {
    src.close();
  }
}

interface MirrorResult {
  files: number;
  bytes: number;
  linked: number;
}

/**
 * Copies the image volume, hard-linking anything the previous backup already
 * holds. Falls back to a real copy whenever linking fails — most often because
 * the backup directory sits on a different filesystem from the images, which is
 * a slower backup rather than a broken one.
 */
function mirrorImages(src: string, dest: string, linkFrom: string | null): MirrorResult {
  const result: MirrorResult = { files: 0, bytes: 0, linked: 0 };
  if (!fs.existsSync(src)) return result;

  const walk = (rel: string) => {
    const absSrc = path.join(src, rel);
    for (const entry of fs.readdirSync(absSrc, { withFileTypes: true })) {
      const childRel = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(path.join(dest, childRel), { recursive: true });
        walk(childRel);
        continue;
      }
      if (!entry.isFile()) continue;

      const from = path.join(src, childRel);
      const to = path.join(dest, childRel);
      const stat = fs.statSync(from);
      fs.mkdirSync(path.dirname(to), { recursive: true });

      let linked = false;
      if (linkFrom) {
        const prev = path.join(linkFrom, childRel);
        try {
          // Same path and same size is the same file: uploads are written once
          // under a random name and never edited in place.
          if (fs.statSync(prev).size === stat.size) {
            fs.linkSync(prev, to);
            linked = true;
          }
        } catch {
          linked = false;
        }
      }
      if (!linked) fs.copyFileSync(from, to);

      result.files++;
      result.bytes += stat.size;
      if (linked) result.linked++;
    }
  };

  fs.mkdirSync(dest, { recursive: true });
  walk("");
  return result;
}

export type BackupResult =
  | { ok: true; info: BackupInfo; pruned: string[]; linked: number }
  | { ok: false; error: string };

/**
 * Writes the backup for a date. Refuses if one already exists, so the hourly
 * check can call it blindly and the day's backup is written exactly once.
 */
export function createBackup(date = toISODate(new Date())): BackupResult {
  if (!DATE_DIR.test(date)) return { ok: false, error: "Not a valid date." };

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dir = dirFor(date);

  try {
    // Non-recursive on purpose: creating the directory *is* the claim, so two
    // processes reaching this line together produce one backup, not two halves
    // of one.
    fs.mkdirSync(dir);
  } catch {
    return { ok: false, error: `A backup for ${date} already exists.` };
  }

  try {
    const dbTarget = path.join(dir, DB_FILE);
    // Single-quoted SQL literal, and `date` is already regex-checked above, so
    // the path cannot carry anything to escape it.
    sqlite.exec(`VACUUM INTO '${dbTarget.replace(/'/g, "''")}'`);

    const previous = listBackups().find((b) => b.date !== date);
    const images = mirrorImages(
      UPLOAD_DIR,
      path.join(dir, IMAGES),
      previous ? path.join(dirFor(previous.date), IMAGES) : null,
    );

    const manifest: BackupManifest = {
      date,
      createdAt: Math.floor(Date.now() / 1000),
      schemaVersion: SCHEMA_VERSION,
      dbBytes: fs.statSync(dbTarget).size,
      imageCount: images.files,
      imageBytes: images.bytes,
      counts: rowCounts(dbTarget),
    };
    fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2));

    return { ok: true, info: { ...manifest, partial: false }, pruned: prune(), linked: images.linked };
  } catch (err) {
    // A half-written backup is worse than none — it would sit in the list
    // looking restorable.
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: false, error: err instanceof Error ? err.message : "Backup failed." };
  }
}

/**
 * Drops the oldest until the set is back to the limit. Called after a write, so
 * the thirty-second backup is what removes the first — never a schedule of its
 * own that could delete the last copy on a day nothing was written.
 */
export function prune(keep = KEEP_BACKUPS): string[] {
  if (keep <= 0) return [];
  const all = listBackups();
  const doomed = all.slice(keep);
  for (const b of doomed) fs.rmSync(dirFor(b.date), { recursive: true, force: true });
  return doomed.map((b) => b.date);
}

/** The daily check. Idempotent, so it can run as often as it likes. */
export function ensureTodaysBackup(): BackupResult | null {
  const today = toISODate(new Date());
  if (hasBackupFor(today)) return null;
  return createBackup(today);
}

// ─────────────────────────────────────────────────────────────
// Restoring
// ─────────────────────────────────────────────────────────────

export type RestoreResult =
  | { ok: true; tables: number; rows: number; images: number }
  | { ok: false; error: string };

/**
 * Copies a backup back over the live database, table by table, inside one
 * transaction.
 *
 * Rows rather than files, deliberately. Swapping the file underneath a running
 * server means closing the connection every module in the app is holding a
 * reference to; moving rows through ATTACH keeps that connection valid and
 * makes the whole restore atomic — it either lands or it doesn't.
 *
 * The backup is opened through the normal opener first, so an older one is
 * migrated up to the current schema before a single row moves.
 */
export function restoreFrom(dbFile: string, imagesDir: string | null): RestoreResult {
  if (!fs.existsSync(dbFile)) return { ok: false, error: "No database in that backup." };

  let source;
  try {
    source = openAt(dbFile);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not open that file." };
  }

  try {
    const version = source.pragma("user_version", { simple: true }) as number;
    if (version > SCHEMA_VERSION) {
      return {
        ok: false,
        error: `That backup was written by a newer version of ARACHNE (schema ${version}, this build knows ${SCHEMA_VERSION}). Update first.`,
      };
    }

    const check = source.pragma("integrity_check", { simple: true }) as string;
    if (check !== "ok") return { ok: false, error: `That file is corrupt: ${check}` };

    const live = new Set(tableNames(sqlite));
    const shared = tableNames(source).filter((t) => live.has(t));
    if (shared.length === 0) return { ok: false, error: "That file holds no ARACHNE tables." };

    source.close();

    let rows = 0;
    const escaped = dbFile.replace(/'/g, "''");
    sqlite.exec(`ATTACH DATABASE '${escaped}' AS restore_src`);

    // Outside the transaction: SQLite silently ignores a foreign_keys change
    // made inside one, and the copy runs alphabetically rather than in
    // dependency order, so the constraint has to be down for the whole thing.
    sqlite.pragma("foreign_keys = OFF");

    try {
      // Column lists are intersected rather than assumed. Both files are at the
      // current schema by now, but `SELECT *` would make that assumption
      // load-bearing, and a restore is the worst place to find it was wrong.
      const columnsOf = (schemaName: string, table: string) =>
        (sqlite.pragma(`${schemaName}.table_info("${table}")`) as { name: string }[]).map(
          (c) => c.name,
        );

      const run = sqlite.transaction(() => {
        for (const t of shared) {
          const incoming = new Set(columnsOf("restore_src", t));
          const cols = columnsOf("main", t).filter((c) => incoming.has(c));
          if (cols.length === 0) continue;
          const list = cols.map((c) => `"${c}"`).join(", ");
          sqlite.prepare(`DELETE FROM main."${t}"`).run();
          const res = sqlite
            .prepare(`INSERT INTO main."${t}" (${list}) SELECT ${list} FROM restore_src."${t}"`)
            .run();
          rows += res.changes;
        }
      });
      run.immediate();
    } finally {
      sqlite.pragma("foreign_keys = ON");
      sqlite.exec("DETACH DATABASE restore_src");
    }

    const images = imagesDir ? restoreImages(imagesDir) : 0;
    return { ok: true, tables: shared.length, rows, images };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Restore failed." };
  } finally {
    try {
      source.close();
    } catch {
      // Already closed on the happy path.
    }
  }
}

/**
 * Mirrors the backup's images back onto the volume, including removing photos
 * taken after the backup. A restore that left later files behind would leave
 * SUIT CHECK holding images no row points at.
 */
function restoreImages(from: string): number {
  if (!fs.existsSync(from)) return 0;
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  let n = 0;
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(from, rel), { withFileTypes: true })) {
      const childRel = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(path.join(UPLOAD_DIR, childRel), { recursive: true });
        walk(childRel);
      } else if (entry.isFile()) {
        fs.copyFileSync(path.join(from, childRel), path.join(UPLOAD_DIR, childRel));
        n++;
      }
    }
  };
  walk("");
  return n;
}

/** Restores one of the rolling daily backups by date. */
export function restoreBackup(date: string): RestoreResult {
  if (!DATE_DIR.test(date)) return { ok: false, error: "Not a valid backup." };
  const dir = dirFor(date);
  if (!fs.existsSync(dir)) return { ok: false, error: `No backup for ${date}.` };
  return restoreFrom(path.join(dir, DB_FILE), path.join(dir, IMAGES));
}

/** Absolute path of a backup's database file, for the download route. */
export function backupDbPath(date: string): string | null {
  if (!DATE_DIR.test(date)) return null;
  const file = path.join(dirFor(date), DB_FILE);
  return fs.existsSync(file) ? file : null;
}

export function backupDbName(): string {
  return DB_FILE;
}

/** Where the live database lives, so the CLI scripts can report it. */
export { DB_PATH };
