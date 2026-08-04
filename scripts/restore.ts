/**
 * Restores a backup from the command line.
 *
 *   npm run restore                    # list what's available
 *   npm run restore -- 2026-08-04      # restore that day
 *   npm run restore -- ./some.db       # restore any ARACHNE database file
 *
 * Overwrites every row in the live database, and — when restoring a dated
 * backup rather than a bare file — every image on the volume. Asks first.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { BACKUP_DIR, listBackups, restoreBackup, restoreFrom } from "../lib/backup";

// Wrapped rather than top-level: tsx compiles this directory as CJS, which has
// no top-level await.
async function main() {
  const arg = process.argv[2];
  const backups = listBackups();

  if (!arg) {
    if (backups.length === 0) {
      console.log(`No backups in ${BACKUP_DIR}.`);
      return;
    }
    console.log(`Backups in ${BACKUP_DIR}:\n`);
    for (const b of backups) {
      const rows = Object.values(b.counts).reduce((a, n) => a + n, 0);
      console.log(
        `  ${b.date}  ${(b.dbBytes / 1024 / 1024).toFixed(2).padStart(7)} MB  ` +
          `${String(rows).padStart(6)} rows  ${String(b.imageCount).padStart(4)} images` +
          (b.partial ? "  (manifest missing)" : ""),
      );
    }
    console.log(`\nRestore one with:  npm run restore -- ${backups[0].date}`);
    return;
  }

  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(arg);
  if (!isDate && !fs.existsSync(arg)) {
    console.error(`No backup for "${arg}", and no file at that path.`);
    process.exitCode = 1;
    return;
  }

  const label = isDate ? `the ${arg} backup` : path.resolve(arg);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `This replaces every row in the live database with ${label}.\n` +
      (isDate ? "Every image on the volume is replaced too.\n" : "") +
      `There is no undo. Type RESTORE to continue: `,
  );
  rl.close();

  if (answer.trim() !== "RESTORE") {
    console.log("Cancelled.");
    return;
  }

  const res = isDate ? restoreBackup(arg) : restoreFrom(path.resolve(arg), null);

  if (!res.ok) {
    console.error(res.error);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Restored ${res.rows} rows across ${res.tables} tables${res.images ? `, ${res.images} images` : ""}.`,
  );
}

void main();
