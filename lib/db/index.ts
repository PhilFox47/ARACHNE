import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const DB_PATH = process.env.DATABASE_PATH ?? "./data/db/arachne.db";

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  // WAL survives container restarts better and keeps reads from blocking the
  // single writer. This app never has concurrent writers, but it's free.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Wait for a competing writer instead of throwing SQLITE_BUSY. Matters most
  // at startup, when several processes may reach the migration lock at once.
  sqlite.pragma("busy_timeout = 10000");
  migrate(sqlite);
  return drizzle(sqlite, { schema });
}

/**
 * Schema is created and versioned inline rather than through drizzle-kit
 * migrations. One user, one container, no rolling deploys — the app should just
 * come up with a correct database on a fresh volume.
 *
 * Versioned via PRAGMA user_version. Steps run in order and only once, so a
 * fresh volume and a volume that's been running since day one converge on the
 * same schema. `CREATE TABLE IF NOT EXISTS` alone is not enough: it silently
 * skips an existing table whose columns have since changed.
 */
const MIGRATIONS: ((db: Database.Database) => void)[] = [
  // ── v1: base schema ──
  (sqlite) => baseSchema(sqlite),

  // ── v2: SUIT CHECK moved from monthly to weekly ──
  (sqlite) => {
    const cols = sqlite.pragma("table_info(photos)") as { name: string }[];
    if (!cols.some((c) => c.name === "month_index")) return;

    const rows = sqlite.prepare("SELECT id, date, angle, path, created_at FROM photos").all() as {
      id: number;
      date: string;
      angle: string;
      path: string;
      created_at: number;
    }[];

    const startRow = sqlite.prepare("SELECT value FROM settings WHERE key = 'start_date'").get() as
      | { value: string }
      | undefined;

    sqlite.exec(`
      DROP TABLE photos;
      CREATE TABLE photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        week_index INTEGER NOT NULL,
        angle TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE UNIQUE INDEX photos_week_angle_idx ON photos(week_index, angle);
    `);

    // Nothing has written to this table in any shipped build, but recompute
    // rather than discard in case a volume somewhere has rows.
    if (rows.length > 0 && startRow) {
      const start = new Date(`${startRow.value}T00:00:00`).getTime();
      const insert = sqlite.prepare(
        "INSERT OR IGNORE INTO photos (date, week_index, angle, path, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      for (const r of rows) {
        const wk = Math.floor((new Date(`${r.date}T00:00:00`).getTime() - start) / (7 * 86_400_000));
        insert.run(r.date, Math.max(0, wk), r.angle, r.path, r.created_at);
      }
    }
  },

  // ── v3: full EU nutrition declaration on food entries ──
  (sqlite) => {
    const cols = (sqlite.pragma("table_info(food_entries)") as { name: string }[]).map((c) => c.name);
    const add = (name: string, type: string) => {
      if (!cols.includes(name)) sqlite.exec(`ALTER TABLE food_entries ADD COLUMN ${name} ${type}`);
    };
    add("saturated_fat_g", "REAL");
    add("sugar_g", "REAL");
    add("fiber_g", "REAL");
    add("salt_g", "REAL");
    add("portion", "TEXT");
  },

  // ── v4: per-set performance logging and cached prescriptions ──
  (sqlite) => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS exercise_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        exercise_key TEXT NOT NULL,
        exercise_name TEXT NOT NULL,
        set_index INTEGER NOT NULL,
        reps INTEGER,
        weight_kg REAL,
        seconds INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS exlog_key_idx ON exercise_logs(exercise_key);
      CREATE INDEX IF NOT EXISTS exlog_session_idx ON exercise_logs(session_id);

      CREATE TABLE IF NOT EXISTS session_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        day_key TEXT NOT NULL,
        phase INTEGER NOT NULL,
        source TEXT NOT NULL,
        model TEXT,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE UNIQUE INDEX IF NOT EXISTS session_plans_date_idx ON session_plans(date);
    `);
  },

  // ── v5: water logging and the document's 12-minute walk test ──
  (sqlite) => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS water_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        ml INTEGER NOT NULL,
        logged_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS water_date_idx ON water_logs(date);
    `);
    const cols = (sqlite.pragma("table_info(trials)") as { name: string }[]).map((c) => c.name);
    if (!cols.includes("walk_test_12min_m")) {
      sqlite.exec("ALTER TABLE trials ADD COLUMN walk_test_12min_m INTEGER");
    }
  },

  // ── v6: the note the user adds before analysis ──
  (sqlite) => {
    const cols = (sqlite.pragma("table_info(food_entries)") as { name: string }[]).map((c) => c.name);
    if (!cols.includes("user_note")) {
      sqlite.exec("ALTER TABLE food_entries ADD COLUMN user_note TEXT");
    }
  },
];

/**
 * Runs pending migrations under an exclusive write lock.
 *
 * `.immediate()` takes the lock at BEGIN rather than at the first write, so the
 * version check and the migrations it authorises are one atomic step. Without
 * it, two processes opening the same file both read user_version = 0 and both
 * replay the same steps — the second one then fails, because the first has
 * already changed the schema out from under it. That is not hypothetical: it
 * happens every time `next build` fans out across workers, and it would happen
 * on any overlapping restart in production too.
 */
function migrate(sqlite: Database.Database) {
  const run = sqlite.transaction(() => {
    const current = (sqlite.pragma("user_version", { simple: true }) as number) ?? 0;
    for (let v = current; v < MIGRATIONS.length; v++) {
      MIGRATIONS[v](sqlite);
      sqlite.pragma(`user_version = ${v + 1}`);
    }
  });
  run.immediate();
}

function baseSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS weights_date_idx ON weights(date);

    CREATE TABLE IF NOT EXISTS measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight_kg REAL, waist_cm REAL, neck_cm REAL, chest_cm REAL,
      thigh_cm REAL, upper_arm_cm REAL, bodyfat_pct REAL,
      trial_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS measurements_date_idx ON measurements(date);

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      day_key TEXT NOT NULL,
      phase INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 1,
      rpe INTEGER,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_date_idx ON sessions(date);

    CREATE TABLE IF NOT EXISTS food_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logged_at INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      norm_key TEXT NOT NULL,
      kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL,
      meal_type TEXT NOT NULL,
      photo_path TEXT,
      source TEXT NOT NULL,
      ai_confidence TEXT,
      edited INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS food_date_idx ON food_entries(date);
    CREATE INDEX IF NOT EXISTS food_norm_idx ON food_entries(norm_key);

    CREATE TABLE IF NOT EXISTS trials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      month_index INTEGER NOT NULL,
      is_checkpoint INTEGER NOT NULL DEFAULT 0,
      pushups_reps INTEGER, pullups_reps INTEGER, deadhang_sec INTEGER,
      plank_sec INTEGER, squat_hold_sec INTEGER, burpees_3min_reps INTEGER,
      sit_reach_cm REAL, circuit_total_sec INTEGER,
      score INTEGER, station_scores TEXT, notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS trials_date_idx ON trials(date);

    CREATE TABLE IF NOT EXISTS abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trial_id INTEGER NOT NULL,
      ability_key TEXT NOT NULL,
      achieved INTEGER NOT NULL DEFAULT 0,
      value REAL, note TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS abilities_trial_key_idx ON abilities(trial_id, ability_key);

    -- Frozen at its v1 shape on purpose. Migration steps are historical
    -- records, not a mirror of the current schema: if this created the
    -- week_index index, it would fail on any database still holding the old
    -- photos table, before the v2 step ever got a chance to convert it.
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      month_index INTEGER NOT NULL,
      angle TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS photos_month_angle_idx ON photos(month_index, angle);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sense_dismissals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      insight_key TEXT NOT NULL,
      dismissed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

// Next's dev server re-evaluates modules on every change; without a global the
// process leaks a file handle per reload until SQLite refuses to open more.
const g = globalThis as unknown as { __arachneDb?: ReturnType<typeof open> };
export const db = g.__arachneDb ?? open();
if (process.env.NODE_ENV !== "production") g.__arachneDb = db;

export { schema };
