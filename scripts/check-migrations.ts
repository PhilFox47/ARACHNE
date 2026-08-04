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
import { BASELINE_PATROLS, PHASES, sessionFor, type DayKey } from "../lib/plan";
import {
  LADDER_FAMILIES,
  MOVEMENTS,
  findMovement,
  ladder,
  masteryLabel,
  masterySessions,
  masterySets,
  movementKey,
} from "../lib/movements";

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

// ── Movement catalogue invariants ──
// Identity is the key, and the key is derived from the name. A movement that
// cannot be found by its own name can never be read back out of the logs, so its
// strand silently never advances — which looks exactly like the athlete not
// progressing.
console.log("\nmovement catalogue");

const keys = new Set<string>();
for (const m of MOVEMENTS) {
  const k = movementKey(m.name);
  ok(`"${m.name}" has a unique key`, !keys.has(k), k);
  keys.add(k);
  ok(`"${m.name}" resolves to itself`, findMovement(m.name)?.name === m.name);
  for (const alias of m.aliases ?? []) {
    ok(`alias "${alias}" resolves to ${m.name}`, findMovement(alias)?.name === m.name);
  }
  ok(`"${m.name}" states a mastery bar`, m.masterAt.reps !== undefined || m.masterAt.seconds !== undefined);
  ok(
    `"${m.name}" measures its bar in the unit it is dosed in`,
    m.metric === "time" ? m.masterAt.seconds !== undefined : m.masterAt.reps !== undefined,
    `${m.metric} vs ${m.masterAt.reps !== undefined ? "reps" : "seconds"}`,
  );
  // A bar of one set on one day is the thing the session rule exists to prevent:
  // a single good set is a good day, not a level.
  ok(
    `"${m.name}" asks for more than one clean reading`,
    masterySets(m) >= 1 && masterySessions(m) >= 2,
    `${masterySets(m)}×, ${masterySessions(m)} sessions`,
  );
  // The sweep is what has to be able to clear it, and the fortnight prescribes
  // two sets per probe on two rounds. A bar above that can never be met by the
  // baseline, so no strand would ever leave rung 0.
  ok(
    `"${m.name}" is reachable inside the baseline fortnight`,
    masterySets(m) <= 2 && masterySessions(m) <= 2,
    masteryLabel(m),
  );
  ok(
    `"${m.name}" is explained`,
    m.summary.length > 20 && m.setup.length > 0 && m.execution.length > 0 && m.watch.length > 20 && m.cues.length > 0 && m.trains.length > 0,
  );
}

// A strand has to be a strand: tiers dense from zero, no gaps, no duplicates.
for (const family of LADDER_FAMILIES) {
  const strand = ladder(family);
  ok(`${family} strand is not empty`, strand.length > 0);
  ok(
    `${family} tiers run 0..${strand.length - 1} without gaps`,
    strand.every((m, i) => m.tier === i),
    strand.map((m) => m.tier).join(","),
  );
}

// ── Every movement the plan can prescribe is in the catalogue ──
// The invariant this whole file exists to protect, and the one that was
// silently false: the shoulder roll was in Friday's session from day one and
// nowhere in the catalogue, so it had no explanation, no preparation under it
// and nothing the model could be told about it. Adding an exercise to the plan
// without adding it here now fails the build instead of shipping.
//
// Thursday's VR titles are the deliberate exception. They are game sessions
// picked from a list, not movements, and the equipment screen owns them.
console.log("\nplan coverage");

const VR = /beat saber|supernatural|thrill of the fight|les mills|fitxr|pistol whip|synth ?riders/i;
const DAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const prescribed = new Map<string, string>();

const note = (name: string, where: string) => {
  if (VR.test(name)) return;
  if (!prescribed.has(name)) prescribed.set(name, where);
};

for (const phase of PHASES) {
  for (const day of DAYS) {
    const s = sessionFor(phase.id, day);
    if (!s) continue;
    for (const e of s.warmup ?? []) note(e.name, `phase ${phase.id} ${day} warm-up`);
    for (const e of s.main ?? []) note(e.name, `phase ${phase.id} ${day}`);
    for (const e of s.cooldown ?? []) note(e.name, `phase ${phase.id} ${day} cooldown`);
  }
}
for (const p of BASELINE_PATROLS) {
  for (const probe of p.probes) note(probe.name, `baseline patrol ${p.index}`);
}

for (const [name, where] of prescribed) {
  ok(`"${name}" is in the catalogue`, findMovement(name) !== null, where);
}

// ── Gates have to be passable ──
// A whole strand may be shut at the bottom — tumbling waits on being able to
// roll, and that is the point of the tree. What must never happen is a gate
// nobody can open: a number the gating strand cannot produce, or a ring of
// strands each waiting on the next.
console.log("\ngates");

// A gate is satisfied by the best number ever logged on the gating strand, so
// asking for more than that strand's mastery bar is fine — the document's own
// checkpoints do it, wanting a 60 s wall handstand off a rung whose bar is 30.
// What is never satisfiable is asking in a unit the strand does not measure:
// no amount of dead hanging produces a rep count, so a reps gate on a
// seconds-only strand locks a movement out of the plan permanently.
for (const m of MOVEMENTS) {
  for (const req of m.requires ?? []) {
    const strand = ladder(req.family);
    const wants = req.reps !== undefined ? "reps" : "time";
    ok(
      `"${m.name}" gate on ${req.family} asks in a unit that strand measures`,
      strand.some((r) => r.metric === wants),
      `wants ${wants}, strand measures ${[...new Set(strand.map((r) => r.metric))].join("/")}`,
    );
  }
}

// No family may depend on itself, however far round. The placement walk would
// never resolve it and every strand in the ring would stay shut forever.
const deps = new Map<string, Set<string>>();
for (const m of MOVEMENTS) {
  const set = deps.get(m.family) ?? new Set<string>();
  for (const req of m.requires ?? []) set.add(req.family);
  deps.set(m.family, set);
}

const state = new Map<string, "open" | "done">();
let cycle: string[] | null = null;
const walk = (family: string, path: string[]) => {
  if (state.get(family) === "done") return;
  if (state.get(family) === "open") {
    cycle ??= [...path.slice(path.indexOf(family)), family];
    return;
  }
  state.set(family, "open");
  for (const next of deps.get(family) ?? []) walk(next, [...path, family]);
  state.set(family, "done");
};
for (const family of LADDER_FAMILIES) walk(family, []);
ok("no strand waits on itself, however far round", cycle === null, (cycle ?? []).join(" → "));

// A gated strand entry is allowed, but only because prescription drops it
// rather than offering something off another ladder. Anything gated at the
// bottom therefore has to be gated by a strand that opens ungated.
for (const family of LADDER_FAMILIES) {
  const strand = ladder(family);
  if (strand.length === 0) continue;
  for (const req of strand[0].requires ?? []) {
    const gating = ladder(req.family);
    ok(
      `${family} is gated by a strand that itself opens`,
      gating.length > 0 && (gating[0].requires ?? []).length === 0,
      req.family,
    );
  }
}

// Prerequisites must point somewhere real, and must not point back into the
// strand they gate — same-family order is already the tier, and a self-reference
// would be a cycle the placement walk could not resolve.
for (const m of MOVEMENTS) {
  for (const req of m.requires ?? []) {
    ok(
      `"${m.name}" requires a strand that exists`,
      ladder(req.family).length > 0,
      req.family,
    );
    ok(`"${m.name}" does not gate on its own strand`, req.family !== m.family, req.family);
    ok(
      `"${m.name}" gate on ${req.family} states a number`,
      req.reps !== undefined || req.seconds !== undefined,
    );
    ok(`"${m.name}" gate on ${req.family} explains itself`, (req.why ?? "").length > 20);
  }
}

console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
