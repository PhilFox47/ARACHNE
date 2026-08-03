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
  migrate(sqlite);
  return drizzle(sqlite, { schema });
}

/**
 * Schema is created inline rather than through drizzle-kit migrations. One user,
 * one container, no rolling deploys — the app should just come up with a correct
 * database on a fresh volume. `drizzle-kit generate` still works for inspection.
 */
function migrate(sqlite: Database.Database) {
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
