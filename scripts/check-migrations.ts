/**
 * Proves that a database written by any shipped version still opens.
 *
 *   npm run check
 *
 * For every historical schema version it builds a database frozen at that
 * version, fills every table with a row using only the columns that existed
 * then, opens it through the app's normal opener, and checks that the schema
 * arrived at the current version with the rows intact.
 *
 * This is the standing promise made concrete: the app is being built while it
 * is being used, so a change that cannot carry an existing database forward is
 * a change that cannot ship. Run it before every release.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS, SCHEMA_VERSION, openAt } from "../lib/db";
import { LADDERS, familyOf, rungOf, type MovementFamily } from "../lib/plan";

const CURRENT = MIGRATIONS.length;
let failures = 0;

const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) failures++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
};

interface Column {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

function tablesOf(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .sort();
}

/**
 * A plausible row for whatever shape a table had at the version under test.
 *
 * Generated from PRAGMA rather than from fixtures, so a table added in a future
 * migration is covered the day it lands without anyone remembering to add it
 * here. Values are chosen to satisfy the app's own readers — dates look like
 * dates, enums take a real member — because a migration that rewrites rows will
 * parse them.
 */
function sampleRow(db: Database.Database, table: string): Record<string, unknown> {
  const cols = db.pragma(`table_info("${table}")`) as Column[];
  const row: Record<string, unknown> = {};

  for (const c of cols) {
    if (c.pk === 1 && /INTEGER/i.test(c.type)) continue;
    if (c.notnull === 0 && c.dflt_value === null) continue;
    if (c.dflt_value !== null) continue;

    const name = c.name;
    if (name === "key") row[name] = `sample_${table}`;
    else if (name === "value") row[name] = "sample";
    else if (name.endsWith("date") || name === "date") row[name] = "2026-06-03";
    else if (name === "angle") row[name] = "front";
    else if (name === "meal_type") row[name] = "meal";
    else if (name === "day_key") row[name] = "mon";
    else if (name === "source") row[name] = "manual";
    else if (name === "payload") row[name] = "[]";
    else if (/INTEGER|REAL/i.test(c.type)) row[name] = 1;
    else row[name] = `sample-${name}`;
  }
  return row;
}

function seed(db: Database.Database): Record<string, number> {
  // start_date first: three migrations read it, and one of them decides whether
  // the run has been onboarded from its presence.
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('start_date', '2026-06-03')").run();

  const counts: Record<string, number> = {};
  for (const t of tablesOf(db)) {
    const row = sampleRow(db, t);
    const names = Object.keys(row);
    if (names.length === 0) continue;
    const sql = `INSERT OR IGNORE INTO "${t}" (${names.map((n) => `"${n}"`).join(", ")}) VALUES (${names
      .map(() => "?")
      .join(", ")})`;
    try {
      db.prepare(sql).run(...names.map((n) => row[n]));
    } catch (err) {
      console.log(`      (could not seed ${t}: ${err instanceof Error ? err.message : err})`);
    }
    counts[t] = (db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }).n;
  }
  return counts;
}

function buildAt(version: number, file: string): Record<string, number> {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  for (let v = 0; v < version; v++) MIGRATIONS[v](db);
  db.pragma(`user_version = ${version}`);
  const counts = seed(db);
  db.close();
  return counts;
}

console.log(`ARACHNE schema is at version ${CURRENT}. Checking every upgrade path into it.\n`);
ok("SCHEMA_VERSION matches the migration count", SCHEMA_VERSION === CURRENT);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "arachne-migrations-"));

for (let from = 1; from <= CURRENT; from++) {
  console.log(`v${from} → v${CURRENT}`);
  const file = path.join(root, `v${from}.db`);
  const before = buildAt(from, file);

  let db: Database.Database;
  try {
    db = openAt(file);
  } catch (err) {
    ok(`opens`, false, err instanceof Error ? err.message : String(err));
    continue;
  }

  ok("reaches the current version", (db.pragma("user_version", { simple: true }) as number) === CURRENT);
  ok("passes integrity_check", (db.pragma("integrity_check", { simple: true }) as string) === "ok");

  // Every table that held a row before must still hold one. Photos are the one
  // exception the schema allows: v10 collapses two weeks into one slot and
  // drops the loser, which cannot happen with a single seeded row.
  const lost: string[] = [];
  for (const [table, n] of Object.entries(before)) {
    if (n === 0) continue;
    if (!tablesOf(db).includes(table)) {
      lost.push(`${table} (table gone)`);
      continue;
    }
    const now = (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
    if (now < n) lost.push(`${table} ${n}→${now}`);
  }
  ok("keeps every seeded row", lost.length === 0, lost.join(", "));

  // Re-opening must be a no-op. A migration that is not idempotent breaks the
  // moment two processes start at once, which is every `next build`.
  const secondPass = openAt(file);
  ok("re-opening changes nothing", (secondPass.pragma("user_version", { simple: true }) as number) === CURRENT);
  secondPass.close();
  db.close();
  console.log("");
}

// A fresh volume must land in exactly the same shape as an upgraded one.
console.log("fresh install vs upgraded from v1");
const freshFile = path.join(root, "fresh.db");
const fresh = openAt(freshFile);
const upgraded = openAt(path.join(root, "v1.db"));

const shapeOf = (db: Database.Database) =>
  tablesOf(db)
    .map(
      (t) =>
        `${t}(${(db.pragma(`table_info("${t}")`) as Column[])
          .map((c) => `${c.name}:${c.type}`)
          .join(",")})`,
    )
    .join("\n");

const a = shapeOf(fresh);
const b = shapeOf(upgraded);
ok("identical schema", a === b);
if (a !== b) {
  const al = a.split("\n");
  const bl = b.split("\n");
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) console.log(`      fresh:    ${al[i] ?? "(missing)"}\n      upgraded: ${bl[i] ?? "(missing)"}`);
  }
}
fresh.close();
upgraded.close();

fs.rmSync(root, { recursive: true, force: true });

// ── Ladder invariants ──
// Every rung has to be findable from its own name. A rung whose pattern misses
// its own label can never be read back out of the logs, so the family silently
// never advances — which looks exactly like the athlete not progressing.
console.log("\nladder self-consistency");
for (const [family, rungs] of Object.entries(LADDERS) as [MovementFamily, typeof LADDERS[MovementFamily]][]) {
  if (!rungs) continue;
  rungs.forEach((rung, i) => {
    const fam = familyOf(rung.name);
    ok(`${family}[${i}] "${rung.name}" resolves to its family`, fam === family, `got ${fam}`);
    const back = fam === family ? rungOf(family, rung.name) : null;
    ok(`${family}[${i}] "${rung.name}" resolves to rung ${i}`, back === i, `got ${back}`);
  });
}

console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
