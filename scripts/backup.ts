/**
 * Writes a backup now, from the command line.
 *
 *   npm run backup            # today's, refused if it already exists
 *   npm run backup -- --force # replace today's
 *
 * The same rolling set the server writes on its own each day. Useful before a
 * risky change, or from a cron on the host if you would rather not rely on the
 * app being up.
 */
import fs from "node:fs";
import path from "node:path";
import { BACKUP_DIR, KEEP_BACKUPS, createBackup, listBackups } from "../lib/backup";
import { todayISO } from "../lib/dates";

const force = process.argv.includes("--force");
const date = todayISO();

if (force) fs.rmSync(path.join(BACKUP_DIR, date), { recursive: true, force: true });

const res = createBackup(date);

if (!res.ok) {
  console.error(res.error);
  process.exit(1);
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(`Wrote ${path.join(BACKUP_DIR, date)}`);
console.log(`  database  ${mb(res.info.dbBytes)}`);
console.log(`  images    ${res.info.imageCount} (${mb(res.info.imageBytes)}, ${res.linked} hard-linked)`);
console.log(
  `  rows      ${Object.entries(res.info.counts)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ")}`,
);
if (res.pruned.length > 0) console.log(`  pruned    ${res.pruned.join(", ")}`);
console.log(`\n${listBackups().length} of ${KEEP_BACKUPS} backups held.`);
