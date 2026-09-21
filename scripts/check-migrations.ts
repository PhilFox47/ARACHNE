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
import { builtinModules } from "node:module";
import Database from "better-sqlite3";
import { MIGRATIONS, SCHEMA_VERSION, openAt } from "../lib/db";
import { VERDICT_KEYS } from "../lib/feedback";
import {
  ADAPT_MAX_KCAL,
  BASELINE_PATROLS,
  DOCUMENT_COURSE,
  PHASES,
  PROTEIN_PER_MEAL_G,
  corridorTargetIn,
  intakeForDayIn,
  isLowProfileWeek,
  isRefuelWeek,
  kcalFloorFor,
  kcalTargetForDayIn,
  maintenanceForDayIn,
  kcalAdjustmentIn,
  phasesFor,
  proteinTargetForDayIn,
  roundsForWeek,
  sessionFor,
  type DayKey,
  type DayWeight,
} from "../lib/plan";
import {
  EQUIPMENT_CATALOGUE,
  gateExercise,
  missingKitPhrase,
  upgradeExercise,
} from "../lib/equipment";
import {
  LADDER_FAMILIES,
  MASTERY,
  MOVEMENTS,
  findMovement,
  ladder,
  masteryLabel,
  masterySessions,
  masterySets,
  masteryWeeks,
  movementKey,
  opensElsewhere,
  setClears,
} from "../lib/movements";

const CURRENT = MIGRATIONS.length;

const LEVELS = Object.values(MASTERY);

/** Equipment keys that mean "this movement is done holding something". */
const LOAD_KEYS = new Set(["dumbbells", "heavy_dumbbells", "kettlebell", "bands", "weight_vest"]);

/**
 * How many sets a dose actually offers.
 *
 * Mirrors `parseDose` in lib/training: a leading "3×" or "5×" fixes the count,
 * and anything else takes the week's rounds. Re-derived here rather than
 * imported because lib/training opens the database on import, and this file has
 * to be able to run against a temporary one.
 */
function setsInDose(dose: string): number {
  const m = dose.trim().match(/^(\d+)\s*[×x]\s*/i);
  return m ? Number(m[1]) : roundsForWeek(2);
}
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

// ── The norm_key repair carries real data across ──
// A photographed meal is created as "Analysing…" and renamed when the model
// answers. The rename did not rewrite norm_key, so every photo entry ever
// logged kept the key "analysing" and everything that groups by it — the
// review's top snacks, the "Again" row, the favourites count — saw one
// enormous food. Seeding the broken shape and migrating it is the only way to
// know the repair actually runs on a database that already has the fault.
console.log("norm_key follows the description again");
{
  const file = path.join(root, "normkey.db");
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  for (let v = 0; v < 13; v++) MIGRATIONS[v](raw);
  raw.pragma("user_version = 13");

  const insert = raw.prepare(
    "INSERT INTO food_entries (logged_at, date, description, norm_key, kcal, meal_type, source) VALUES (?, ?, ?, 'analysing', ?, 'snack', 'ai')",
  );
  const foods = ["Coffee with oat milk", "Handful of almonds", "Banana"];
  foods.forEach((f, i) => insert.run(1_700_000_000 + i, "2026-06-04", f, 100));

  // A fourth that was never analysed keeps the placeholder, and must be left
  // alone — "Analysing…" is a status, and its key is honestly that.
  insert.run(1_700_000_009, "2026-06-04", "Analysing…", 0);

  // Two favourites that both inherited the broken key cannot coexist under the
  // unique index, which is itself part of the bug — so one, plus a sound one.
  raw
    .prepare("INSERT INTO favourites (norm_key, label, meal_type) VALUES ('analysing', 'Coffee with oat milk', 'snack')")
    .run();
  raw
    .prepare("INSERT INTO favourites (norm_key, label, meal_type) VALUES ('handful of almonds', 'Handful of almonds', 'snack')")
    .run();
  raw.close();

  const fixed = openAt(file);
  const rows = fixed
    .prepare("SELECT description, norm_key FROM food_entries ORDER BY logged_at")
    .all() as { description: string; norm_key: string }[];

  const normOf = (t: string) =>
    t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

  ok(
    "every renamed entry got its own key back",
    foods.every((f, i) => rows[i].norm_key === normOf(f)),
    rows.map((r) => `${r.description}=${r.norm_key}`).join(", "),
  );
  ok(
    "three foods are now three keys, not one",
    new Set(rows.slice(0, 3).map((r) => r.norm_key)).size === 3,
  );
  ok(
    "an entry still being analysed is left alone",
    rows[3].norm_key === normOf("Analysing…"),
    rows[3].norm_key,
  );

  const favs = fixed.prepare("SELECT label, norm_key FROM favourites ORDER BY id").all() as {
    label: string;
    norm_key: string;
  }[];
  ok(
    "a favourite's key is recomputed from its label",
    favs.every((f) => f.norm_key === normOf(f.label)),
    favs.map((f) => `${f.label}=${f.norm_key}`).join(", "),
  );
  ok("and no favourite was lost to it", favs.length === 2, `${favs.length} left`);

  const again = openAt(file);
  ok(
    "running it twice changes nothing",
    (again.prepare("SELECT COUNT(*) AS n FROM favourites").get() as { n: number }).n === 2,
  );
  again.close();
  fixed.close();
  console.log("");
}

// ── Three answers become five, without losing what was already said ──
// The scale gained "easy" and "limit", and two of the old names were wrong for
// the new scale: "controlled" meant *exactly right*, which the five call
// "clean", and "pain" is "painful". Every answer already given has to survive
// that as the same answer — a rating is a memory of how a session felt, and
// there is no way to go back and ask again.
//
// Seeded against a real v16 database rather than asserted about the SQL,
// because what matters is what happens to rows that already exist.
console.log("the feedback scale gains two answers and loses none");
{
  const file = path.join(root, "verdicts.db");
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  for (let v = 0; v < 16; v++) MIGRATIONS[v](raw);
  raw.pragma("user_version = 16");

  const add = raw.prepare(
    "INSERT INTO movement_feedback (date, exercise_key, verdict) VALUES (?, ?, ?)",
  );
  const seeded: [string, string, string][] = [
    ["2026-09-01", "goblet squat", "controlled"],
    ["2026-09-02", "goblet squat", "hard"],
    ["2026-09-03", "goblet squat", "pain"],
    ["2026-09-01", "incline inverted row", "controlled"],
    ["2026-09-02", "incline inverted row", "pain"],
  ];
  for (const [d, k, v] of seeded) add.run(d, k, v);
  raw.close();

  const up = openAt(file);
  const rows = up
    .prepare("SELECT date, exercise_key, verdict FROM movement_feedback ORDER BY exercise_key, date")
    .all() as { date: string; exercise_key: string; verdict: string }[];

  ok("every answer is still there", rows.length === seeded.length, `${rows.length} of ${seeded.length}`);
  ok(
    "and every one is on the new scale",
    rows.every((r) => VERDICT_KEYS.includes(r.verdict as never)),
    rows.map((r) => r.verdict).join(", "),
  );
  ok("none of the old names survive", !rows.some((r) => r.verdict === "controlled" || r.verdict === "pain"));

  const verdictOn = (key: string, date: string) =>
    rows.find((r) => r.exercise_key === key && r.date === date)?.verdict;
  ok("\"controlled\" is what the new scale calls \"clean\"", verdictOn("goblet squat", "2026-09-01") === "clean");
  ok("\"hard\" keeps its name and its meaning", verdictOn("goblet squat", "2026-09-02") === "hard");
  ok("\"pain\" is \"painful\"", verdictOn("goblet squat", "2026-09-03") === "painful");

  // The step-down depends on this one. A painful day that stopped counting as
  // painful would quietly hand back the rung it was meant to close.
  ok(
    "both painful days are still painful",
    rows.filter((r) => r.verdict === "painful").length === 2,
  );
  // Nothing may be invented: nobody ever gave these answers.
  ok(
    "nothing was back-filled as easy or limit",
    !rows.some((r) => r.verdict === "easy" || r.verdict === "limit"),
  );

  const twice = openAt(file);
  ok(
    "running it twice changes nothing",
    (twice.prepare("SELECT COUNT(*) AS n FROM movement_feedback WHERE verdict = 'clean'").get() as { n: number })
      .n === 2,
  );
  twice.close();
  up.close();
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
  // A bar the session cannot physically offer is a rung nobody ever leaves.
  // The dose decides: a leading "2×" caps the session at two sets however many
  // the bar asks for, and an ordinary training week is three rounds.
  ok(
    `"${m.name}" asks for no more sets than its dose prescribes`,
    masterySets(m) <= setsInDose(m.dose),
    `bar ${masterySets(m)}×, dose "${m.dose}" gives ${setsInDose(m.dose)}`,
  );
  // A rung that needs weights must say how many. Reps alone are meaningless on
  // a loaded movement: fifteen goblet squats with a 2 kg dumbbell and fifteen
  // with the plan's own pair are the same number and not the same movement, and
  // the light one used to unlock the entire road to a pistol squat.
  const needsLoad =
    m.loaded === true || (m.needs ?? []).some((k) => LOAD_KEYS.has(k));
  if (m.track !== "groundwork") {
    ok(
      `"${m.name}" states a load if it is done with weights`,
      !needsLoad || m.masterAt.kg !== undefined,
      needsLoad ? `loaded, bar is ${masteryLabel(m)}` : "bodyweight",
    );
    ok(
      `"${m.name}" does not state a load it is not done with`,
      needsLoad || m.masterAt.kg === undefined,
    );
  }
  // Weeks cannot outnumber sessions — one clean session lands in one week — and
  // a bar met inside a single week is a good week rather than a movement owned.
  ok(
    `"${m.name}" spreads across at least two weeks`,
    masteryWeeks(m) >= 2 && masteryWeeks(m) <= masterySessions(m),
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

  // The sweep is what has to be able to move you off the bottom, and the
  // fortnight prescribes two sets per probe. A bar above that on the entry rung
  // would leave every strand stuck at rung 0 no matter how the fortnight went —
  // which is the opposite of what the fortnight is for. Only the entry rung is
  // held to it; everything above is trained in ordinary three-round weeks.
  ok(
    `${family} opens on a rung the baseline sweep can clear`,
    masterySets(strand[0]) <= 2,
    `${strand[0].name}: ${masteryLabel(strand[0])}`,
  );

  // Climbing has to cost more, not less. A strand whose harder rungs are cheaper
  // than its easier ones is a strand you fall up, and the whole point of the bars
  // is that nothing complicated arrives while the simple version is still a fight.
  for (let i = 1; i < strand.length; i++) {
    ok(
      `${family} rung ${i} is not cheaper than the one below`,
      masterySessions(strand[i]) >= masterySessions(strand[i - 1]) &&
        masteryWeeks(strand[i]) >= masteryWeeks(strand[i - 1]),
      `${strand[i - 1].name} ${masteryLabel(strand[i - 1])} → ${strand[i].name} ${masteryLabel(strand[i])}`,
    );
  }

  // Every rung names one of the shared levels rather than inventing numbers, so
  // the whole catalogue stays comparable and a quietly cheap strand is visible.
  for (const m of strand) {
    ok(
      `"${m.name}" uses a named mastery level`,
      LEVELS.some(
        (l) => l.sets === masterySets(m) && l.sessions === masterySessions(m) && l.weeks === masteryWeeks(m),
      ),
      `${masterySets(m)}×, ${masterySessions(m)} sessions, ${masteryWeeks(m)} weeks`,
    );
  }
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

// ── The baseline sweep must open every strand at the bottom ──
// A probe that names a movement partway up its strand, without `ladder: true`,
// is logged verbatim — so the fortnight puts a beginner on that rung and the
// tree believes they earned it. The Control patrol's "Shoulder roll" did
// exactly this: it parked week one at the roll from a walk, which is the top of
// the falling strand and the thing the whole strand exists to prepare for.
console.log("\nbaseline probes");

for (const p of BASELINE_PATROLS) {
  for (const probe of p.probes) {
    const m = findMovement(probe.name);
    if (!m || m.track === "groundwork") continue;
    ok(
      `patrol ${p.index} probe "${probe.name}" sweeps its strand rather than naming a rung`,
      probe.ladder === true || m.tier === 0,
      `${m.family} tier ${m.tier}`,
    );
    if (probe.ladder) {
      ok(
        `patrol ${p.index} probe "${probe.name}" names the strand it belongs to`,
        probe.family === m.family,
        `probe says ${probe.family}, catalogue says ${m.family}`,
      );
    }
  }
}

// ── Equipment may change how a movement is loaded, never which one it is ──
// A substitution drops you onto a different movement when the kit is missing,
// so that movement has to exist — otherwise the session logs sets against a
// name the tree has never heard of and the strand silently stops advancing.
console.log("\nequipment");

const owned = new Set(EQUIPMENT_CATALOGUE.map((e) => e.key));
const none = new Set<string>();
for (const m of MOVEMENTS) {
  const sub = gateExercise(m.name, none).substitute;
  if (sub) {
    ok(`the substitute for "${m.name}" is in the catalogue`, findMovement(sub.name) !== null, sub.name);
  }
  // An upgrade is advice about kit. If it ever renames the movement again it
  // can move you down a rung — "Ring rows" is the plain inverted row — or off
  // the ladder entirely, and both stall the strand without saying anything.
  const up = upgradeExercise(m.name, owned) as unknown as Record<string, unknown> | null;
  ok(
    `the ${m.name.toLowerCase()} upgrade does not rename the movement`,
    up === null || (up.name === undefined && up.dose === undefined),
    JSON.stringify(up),
  );
}

// ── Equipment gates only ever gate on equipment ──
// The tumbling gate used to list `bridge` among its alternatives, meaning the
// back bridge — and it matched the glute bridge, which is lying on the floor
// lifting your hips. So a run without a mat lost the bottom three rungs of the
// hinge strand, and Wednesday, the only leg day, had no hip hinge in it at all.
//
// A gate that needs kit must therefore only ever catch movements that need
// kit. The floor is not equipment.
const FLOOR_ONLY = [
  "Glute bridge",
  "Single-leg glute bridge",
  "Glute bridge march",
  "Dead bug",
  "Plank",
  "Hollow hold",
  "Wall sit",
  "Reverse lunge",
  "Bodyweight squat",
];
for (const name of FLOOR_ONLY) {
  const m = findMovement(name);
  if (!m) continue;
  const g = gateExercise(m.name, none);
  ok(`"${m.name}" needs nothing but a floor`, g.allowed, g.allowed ? "" : `gated on ${g.missing.join("/")}`);
}

// And nothing may be dropped without a reason to show. `substitute: null` is
// legitimate — a dead hang has no bar-free version — but the session has to be
// able to say so, which means the missing kit must name itself.
for (const m of MOVEMENTS) {
  const g = gateExercise(m.name, none);
  if (g.allowed || g.substitute !== null) continue;
  ok(
    `"${m.name}" can explain why it is missing`,
    g.missing.length > 0 && missingKitPhrase(g.missing).length > 0,
    missingKitPhrase(g.missing),
  );
}

// ── The plan's own figures are the ones the app uses ──
// Every screen and every challenge used to multiply the document's per-meal
// rule by three and call the result the day's protein target. The phases state
// the real figure and nothing read it, so the app coached 120 g through a phase
// that asks for 160 — 40 g a day of the macro that decides how much of 20 kg
// comes off as muscle.
console.log("\nthe plan's own numbers");

for (const p of phasesFor(DOCUMENT_COURSE).slice(1)) {
  const mid = Math.floor((p.startDay + p.endDay) / 2);
  ok(
    `${p.codename} asks for its own ${p.proteinG} g of protein`,
    proteinTargetForDayIn(DOCUMENT_COURSE, mid) === p.proteinG,
    `got ${proteinTargetForDayIn(DOCUMENT_COURSE, mid)}`,
  );
}
ok(
  "Phase 0 states no protein target and falls back to the per-meal rule",
  proteinTargetForDayIn(DOCUMENT_COURSE, 3) === PROTEIN_PER_MEAL_G * 3,
);
ok(
  "and the fallback is never what a deficit phase gets",
  phasesFor(DOCUMENT_COURSE).slice(1).every((p) => p.proteinG !== PROTEIN_PER_MEAL_G * 3),
);

// ── Deloads count training weeks, not calendar weeks ──
// The baseline fortnight is already a deload in all but name — run at the
// bottom of every range, stopping short, because it measures rather than
// trains. Counting it put the first low-profile week in week 2 of Phase 1:
// one real week of work and then a week off it.
const lowProfileWeeks = Array.from({ length: 20 }, (_, w) => w).filter(isLowProfileWeek);
ok("no low-profile week during the baseline fortnight", !lowProfileWeeks.some((w) => w < 2), lowProfileWeeks.join(", "));
ok("the first one lands after four training weeks", lowProfileWeeks[0] === 5, `week ${lowProfileWeeks[0]}`);
ok(
  "and they stay every fourth week after that",
  lowProfileWeeks.slice(0, 4).every((w, i) => w === 5 + i * 4),
  lowProfileWeeks.slice(0, 4).join(", "),
);
ok("a low-profile week is two rounds, not three", roundsForWeek(5) === 2 && roundsForWeek(6) === 3);

// ── Refuel weeks ──
// A planned week at maintenance every second deload. Pinned to the deload so
// that reduced training and restored calories are the same week rather than two
// competing ideas.
const refuelWeeks = Array.from({ length: 60 }, (_, w) => w).filter(isRefuelWeek);
ok("every refuel week is also a low-profile week", refuelWeeks.every(isLowProfileWeek));
ok("they land every eighth training week", refuelWeeks.slice(0, 5).every((w, i) => w === 9 + i * 8), refuelWeeks.slice(0, 5).join(", "));
ok("none of them falls in the baseline fortnight", !refuelWeeks.some((w) => w < 2));
ok(
  "a refuel day eats at maintenance, not at the phase figure",
  kcalTargetForDayIn(DOCUMENT_COURSE, 9 * 7).refuel &&
    kcalTargetForDayIn(DOCUMENT_COURSE, 9 * 7).kcal > phasesFor(DOCUMENT_COURSE)[1].kcal,
  `${kcalTargetForDayIn(DOCUMENT_COURSE, 9 * 7).kcal} kcal`,
);
ok(
  "maintenance falls as the corridor does",
  maintenanceForDayIn(DOCUMENT_COURSE, 20) > maintenanceForDayIn(DOCUMENT_COURSE, 350),
  `${maintenanceForDayIn(DOCUMENT_COURSE, 20)} → ${maintenanceForDayIn(DOCUMENT_COURSE, 350)}`,
);

// ── The intake answers to the scale, within limits ──
// A diet that chases the scale week to week ends at 1,400 kcal in month eight,
// so the correction is bounded on both sides and floored absolutely.
console.log("\nadaptive intake");

const heavy = (day: number, over: number): DayWeight[] =>
  Array.from({ length: 14 }, (_, i) => ({
    day: day - i,
    kg: corridorTargetIn(DOCUMENT_COURSE, day - i) + over,
  }));

ok("no readings, no adjustment", kcalAdjustmentIn(DOCUMENT_COURSE, 60, []) === 0);
ok(
  "one reading is not enough to move it",
  kcalAdjustmentIn(DOCUMENT_COURSE, 60, [{ day: 60, kg: 110 }]) === 0,
);
ok("inside the corridor band nothing moves", kcalAdjustmentIn(DOCUMENT_COURSE, 60, heavy(60, 1)) === 0);
ok(
  "heavier than the corridor eats less",
  kcalAdjustmentIn(DOCUMENT_COURSE, 60, heavy(60, 4)) < 0,
  `${kcalAdjustmentIn(DOCUMENT_COURSE, 60, heavy(60, 4))} kcal`,
);
ok(
  "lighter than the corridor eats more",
  kcalAdjustmentIn(DOCUMENT_COURSE, 60, heavy(60, -4)) > 0,
  `${kcalAdjustmentIn(DOCUMENT_COURSE, 60, heavy(60, -4))} kcal`,
);
ok(
  "the correction is capped both ways",
  Math.abs(kcalAdjustmentIn(DOCUMENT_COURSE, 60, heavy(60, 40))) <= ADAPT_MAX_KCAL &&
    Math.abs(kcalAdjustmentIn(DOCUMENT_COURSE, 60, heavy(60, -40))) <= ADAPT_MAX_KCAL,
);
ok("the baseline fortnight is never adjusted", kcalAdjustmentIn(DOCUMENT_COURSE, 7, heavy(7, 5)) === 0);
ok(
  "a refuel week is never adjusted",
  kcalAdjustmentIn(DOCUMENT_COURSE, 9 * 7 + 2, heavy(9 * 7 + 2, 5)) === 0,
);

// The floor is absolute — it is the document's own rule and the adjustment must
// not be able to argue with it.
const floor = kcalFloorFor(DOCUMENT_COURSE);
let lowest = Infinity;
for (let day = 0; day <= DOCUMENT_COURSE.totalDays; day++) {
  lowest = Math.min(lowest, intakeForDayIn(DOCUMENT_COURSE, day, heavy(day, 40)).kcal);
}
ok("no day can be pushed below the floor", lowest >= floor, `lowest ${lowest}, floor ${floor}`);

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
    if (req.reps !== undefined || req.seconds !== undefined) {
      const wants = req.reps !== undefined ? "reps" : "time";
      ok(
        `"${m.name}" gate on ${req.family} asks in a unit that strand measures`,
        strand.some((r) => r.metric === wants),
        `wants ${wants}, strand measures ${[...new Set(strand.map((r) => r.metric))].join("/")}`,
      );
    }
    // A tier gate names a rung. Naming one the strand does not have locks the
    // movement out permanently, and silently.
    if (req.tier !== undefined) {
      ok(
        `"${m.name}" gate on ${req.family} names a rung that exists`,
        req.tier >= 0 && req.tier < strand.length,
        `tier ${req.tier} of ${strand.length}`,
      );
    }
  }
}

// A numeric gate is satisfied by the best number ever logged on the gating
// strand, so asking for more than any rung's mastery bar is legitimate and
// deliberate — the wall handstand push-up wants 60 s upside down off a rung
// whose bar is 30, which means "keep holding it longer", not "master something
// else". What is not legitimate is a number so far past every bar that no
// amount of working the strand produces it. Three times the strand's best bar
// is the line: generous enough for the document's own checkpoints, tight enough
// that a stray zero fails the build.
const GATE_HEADROOM = 3;
for (const m of MOVEMENTS) {
  if (m.track === "groundwork") continue;
  for (const req of m.requires ?? []) {
    const strand = ladder(req.family);
    for (const [unit, want] of [
      ["reps", req.reps],
      ["seconds", req.seconds],
    ] as const) {
      if (want === undefined) continue;
      const best = Math.max(0, ...strand.map((r) => r.masterAt[unit] ?? 0));
      ok(
        `the ${req.family} gate on "${m.name}" is within reach`,
        want <= best * GATE_HEADROOM,
        `wants ${want} ${unit}, the strand's best bar is ${best}`,
      );
    }
  }
}

// The reverse lookup the brief renders must credit exactly one rung per gate —
// the lowest that satisfies it. Crediting several would tell you the archer
// push-up unlocks the burpee, which the plain push-up opened months earlier.
for (const family of LADDER_FAMILIES) {
  for (const m of MOVEMENTS) {
    if (m.track === "groundwork") continue;
    const openers = ladder(family).filter((r) => opensElsewhere(r).some((o) => o.name === m.name));
    ok(
      `at most one ${family} rung claims to open "${m.name}"`,
      openers.length <= 1,
      openers.map((o) => o.name).join(", "),
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
      `"${m.name}" gate on ${req.family} states a condition`,
      req.reps !== undefined || req.seconds !== undefined || req.tier !== undefined,
    );
    ok(`"${m.name}" gate on ${req.family} explains itself`, (req.why ?? "").length > 20);
  }
}

// ── One rule for what counts as a clean set ──
// `setClears` lives in lib/movements and decides mastery. The set row draws the
// same conclusion on the client, from the bar carried on the prescription,
// because the catalogue is a server module it cannot import. Two copies of a
// rule is two chances to be wrong, so they are compared here on every case that
// distinguishes them.
console.log("\nthe clean-set rule");

/** The client's copy, lifted verbatim from components/SessionLogger.tsx. */
function clientCounts(
  bar: { reps?: number; seconds?: number; kg?: number } | undefined,
  s: { reps: number | null; seconds: number | null; weightKg: number | null } | null,
): boolean {
  if (!bar || !s) return false;
  if (bar.kg !== undefined && (s.weightKg ?? 0) < bar.kg) return false;
  if (bar.reps !== undefined) return (s.reps ?? 0) >= bar.reps;
  if (bar.seconds !== undefined) return (s.seconds ?? 0) >= bar.seconds;
  return false;
}

let disagreements = 0;
for (const m of MOVEMENTS) {
  if (m.track === "groundwork") continue;
  const bar = { reps: m.masterAt.reps, seconds: m.masterAt.seconds, kg: m.masterAt.kg };
  for (const reps of [null, 0, 1, 2, 7, 11, 12, 15, 30, 60]) {
    for (const seconds of [null, 0, 10, 20, 30, 45, 60, 90]) {
      for (const weightKg of [null, 0, 2, 4, 8, 16, 24]) {
        const server = setClears(m, reps, seconds, weightKg);
        const client = clientCounts(bar, { reps, seconds, weightKg });
        if (server !== client) disagreements++;
      }
    }
  }
}
ok("the set row and the catalogue agree on every case", disagreements === 0, `${disagreements} differ`);

// The bar has to be reachable from the dose. A rung whose prescription never
// puts enough weight in your hands to clear its own load is a rung nobody
// leaves — the same failure the set count invariant catches, in kilograms.
for (const m of MOVEMENTS) {
  if (m.masterAt.kg === undefined) continue;
  ok(
    `"${m.name}" asks for a load the plan actually puts in your hands`,
    m.masterAt.kg <= 24,
    `${m.masterAt.kg} kg — the equipment list assumes a pair around 8 kg`,
  );
}

// ── Nothing is imported that package.json does not declare ──
// The rule this exists for: `scripts/seed-suit.ts` statically imported `sharp`,
// which is not a dependency of this project and never was. It resolved only
// because Next pulls sharp in as an *optional* dependency for image
// optimisation the app does not use — and the production image install sets
// `build_from_source`, sharp's install script cannot satisfy that without
// libvips, and npm drops an optional package whose script fails without a word.
// `next build` type-checked the seed script and stopped the release.
//
// A static import is a promise that the package is there. Only package.json can
// make that promise. A guarded `createRequire` at the point of use is the
// honest way to reach for something optional, and is deliberately not caught
// here — seed-suit does exactly that now.
console.log("\nimports");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
  ...builtinModules,
]);

const sources: string[] = [];
const collect = (dir: string) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (/\.tsx?$/.test(entry.name)) sources.push(full);
  }
};
for (const dir of ["app", "components", "lib", "scripts"]) collect(dir);

// `from "x"` and `import "x"` only. Relative paths, the `@/` alias and the
// `node:` scheme are all resolved without package.json's help.
const IMPORT = /\bfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
// Comments first, or a doc comment that quotes an import — this file has one —
// reads as an import of a package called "x".
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const undeclared = new Map<string, string>();
for (const file of sources) {
  const text = stripComments(fs.readFileSync(file, "utf8"));
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    if (!spec || spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("node:")) continue;
    const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    if (!declared.has(name) && !undeclared.has(name)) undeclared.set(name, file);
  }
}
ok(
  "every imported package is declared in package.json",
  undeclared.size === 0,
  [...undeclared].map(([name, file]) => `${name} (${file})`).join(", "),
);

// The app's own type-check must not reach into the dev tooling. `next build`
// runs it, so anything in `scripts/` could stop a production image being built.
const appTsconfig = fs.readFileSync("tsconfig.json", "utf8");
ok(
  "the app's tsconfig excludes the dev scripts",
  /"exclude"\s*:\s*\[[^\]]*"scripts"/.test(appTsconfig),
);
ok("but a tsconfig that covers them exists", fs.existsSync("tsconfig.scripts.json"));

// ── The Docker dependency layer ──
// Two things kept this stage honest, and both are invisible until you are
// watching a build bar:
//
//   The base image must not be Alpine. better-sqlite3 ships no musl prebuild,
//   so on Alpine `npm ci` compiles SQLite from source — minutes, against 12
//   seconds to download a binary on glibc.
//
//   The layer must be keyed on package-lock.json alone, so the version bump
//   that happens on every release does not reinstall everything.
console.log("\ndocker build cache");

const dockerfile = fs.readFileSync("Dockerfile", "utf8");
const depsStage = dockerfile.slice(
  dockerfile.indexOf("AS deps"),
  dockerfile.indexOf("AS build"),
);

// musl has no better-sqlite3 prebuild, so every build would compile it.
// The `# syntax=` directive names a tag, so BuildKit resolves it against Docker
// Hub on every build — an auth.docker.io round-trip before the file is even
// parsed, and the first thing to fail on a flaky connection. Docker's built-in
// frontend covers everything used here. See docs/DOCKER-TROUBLESHOOTING.md.
ok("no syntax directive forces a Docker Hub round-trip", !/^#\s*syntax=/m.test(dockerfile));

ok("the base image is not Alpine", !/^(FROM|ARG NODE_IMAGE=)[^\n]*alpine/m.test(dockerfile));

// The runtime image installs nothing, so anything the healthcheck or entrypoint
// reaches for has to be in the base. node always is; wget and tini are not.
const compose = fs.readFileSync("docker-compose.yml", "utf8");
ok("the healthcheck does not depend on wget or curl", !/test:[\s\S]{0,200}?(wget|curl)/.test(compose));
ok("an init process reaps zombies", /^\s*init:\s*true\s*$/m.test(compose));

// A version bump would otherwise recompile better-sqlite3 on every release.
ok(
  "the deps stage does not copy package.json",
  !/^COPY\s+[^\n]*\bpackage\.json\b/m.test(depsStage),
);
ok("the deps stage copies the lockfile", /^COPY\s+package-lock\.json/m.test(depsStage));
ok("the npm cache is mounted", depsStage.includes("type=cache,target=/root/.npm"));
ok("the audit round-trip is skipped", /npm ci[^\n]*--no-audit/.test(depsStage));

// The one that actually hung a build for ten minutes with no output.
// better-sqlite3's install script is `prebuild-install || node-gyp rebuild`,
// and prebuild-install fetches from github.com with simple-get and no timeout
// anywhere. Unreachable GitHub means a call that never returns and never
// errors. Building from source keeps the whole install on hosts that do time
// out. Removing this line reintroduces a silent, unbounded hang.
// npm's default fetch-timeout is five minutes with two retries, so one stalled
// tarball can burn a quarter of an hour before it admits anything is wrong.
// That is what a "hanging" build looks like from outside.
ok("a stalled download gives up in a minute, not five", /npm_config_fetch_timeout=60000/.test(depsStage));

ok(
  "better-sqlite3 builds from source rather than fetching from GitHub",
  /npm_config_build_from_source=true/.test(depsStage),
);
ok(
  "a compiler is present for it to use",
  /apt-get install[^\n]*g\+\+/.test(depsStage),
);

// The generated package.json must ask for exactly what the real one does. npm
// would catch a mismatch during the build; catching it here is the difference
// between a failed deploy and a failed `npm run check`.
const realPkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const lockRoot = (
  JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as {
    packages: Record<string, { dependencies?: object; devDependencies?: object }>;
  }
).packages[""];

for (const field of ["dependencies", "devDependencies"] as const) {
  const matches = JSON.stringify(lockRoot[field] ?? {}) === JSON.stringify(realPkg[field] ?? {});
  ok(
    `the lockfile's ${field} match package.json`,
    matches,
    matches ? "" : "out of sync — run npm install",
  );
}

console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
