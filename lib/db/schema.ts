import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Dates are ISO `YYYY-MM-DD` in local time — this app has exactly one user in
 * one timezone, and storing local dates means "what did I eat on Tuesday" never
 * needs a timezone conversion. Timestamps are Unix seconds.
 */

const now = sql`(unixepoch())`;

// ── VITALS ───────────────────────────────────────────────────

export const weights = sqliteTable(
  "weights",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    weightKg: real("weight_kg").notNull(),
    /**
     * Bioimpedance reading straight off the scale. Kept here rather than in
     * `measurements` because it arrives daily with the weight, while the
     * measurements table is the monthly tape-and-formula record — the two
     * disagree by several points and conflating them would hide that.
     */
    bodyfatPct: real("bodyfat_pct"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("weights_date_idx").on(t.date)],
);

export const measurements = sqliteTable(
  "measurements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    weightKg: real("weight_kg"),
    waistCm: real("waist_cm"),
    neckCm: real("neck_cm"),
    chestCm: real("chest_cm"),
    thighCm: real("thigh_cm"),
    upperArmCm: real("upper_arm_cm"),
    /** Stored, not derived: a later height change must not rewrite history. */
    bodyfatPct: real("bodyfat_pct"),
    trialId: integer("trial_id"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("measurements_date_idx").on(t.date)],
);

// ── PATROL ───────────────────────────────────────────────────

export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    dayKey: text("day_key").notNull(),
    phase: integer("phase").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(true),
    rpe: integer("rpe"),
    note: text("note"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("sessions_date_idx").on(t.date)],
);

/**
 * Actual performance, one row per set. This is what turns the plan from a
 * prescription into a record — progressive overload needs to know what you
 * lifted last week, not what the document suggested you might.
 */
export const exerciseLogs = sqliteTable(
  "exercise_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").notNull(),
    date: text("date").notNull(),
    /** Normalised name, so a movement tracks across phases and renamings. */
    exerciseKey: text("exercise_key").notNull(),
    exerciseName: text("exercise_name").notNull(),
    setIndex: integer("set_index").notNull(),
    reps: integer("reps"),
    weightKg: real("weight_kg"),
    /** Holds and carries measure time, not reps. */
    seconds: integer("seconds"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("exlog_key_idx").on(t.exerciseKey),
    index("exlog_session_idx").on(t.sessionId),
  ],
);

/**
 * The prescription actually issued for a given day, cached so it is stable.
 * Regenerating on every page load would mean the target moved while you were
 * mid-session, and a plan that changes under you is not a plan.
 */
export const sessionPlans = sqliteTable(
  "session_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    dayKey: text("day_key").notNull(),
    phase: integer("phase").notNull(),
    source: text("source", { enum: ["ai", "plan"] }).notNull(),
    model: text("model"),
    /** JSON: PrescribedExercise[] */
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("session_plans_date_idx").on(t.date)],
);

// ── FUEL ─────────────────────────────────────────────────────

export const foodEntries = sqliteTable(
  "food_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    loggedAt: integer("logged_at").notNull(),
    date: text("date").notNull(),
    description: text("description").notNull(),
    /** Lowercased, punctuation-stripped. Groups repeats into quick-log offers. */
    normKey: text("norm_key").notNull(),
    /**
     * Every macro is nullable by design. This is the schema-level guarantee
     * that a failed or slow AI call still leaves a saved entry behind.
     */
    kcal: real("kcal"),
    proteinG: real("protein_g"),
    carbsG: real("carbs_g"),
    fatG: real("fat_g"),
    /**
     * The rest of the EU mandatory nutrition declaration — the exact set
     * printed on every German package, so the model is estimating against a
     * format it has seen a great deal of. Salt, not sodium, for the same reason.
     */
    saturatedFatG: real("saturated_fat_g"),
    sugarG: real("sugar_g"),
    fiberG: real("fiber_g"),
    saltG: real("salt_g"),
    /** Free-text portion the model inferred, e.g. "500 ml can". */
    portion: text("portion"),
    /**
     * What you told the model before it looked. Kept separately from
     * `description`, which the model overwrites — otherwise the context you
     * supplied disappears the moment the estimate lands.
     */
    userNote: text("user_note"),
    mealType: text("meal_type", { enum: ["meal", "snack"] }).notNull(),
    photoPath: text("photo_path"),
    source: text("source", { enum: ["ai", "manual", "quick"] }).notNull(),
    aiConfidence: text("ai_confidence", { enum: ["low", "medium", "high"] }),
    edited: integer("edited", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("food_date_idx").on(t.date), index("food_norm_idx").on(t.normKey)],
);

/**
 * Things you eat often enough to name. A snapshot, not a pointer: a favourite
 * has to survive deleting the meal it was created from, and must not drift when
 * some old entry is edited months later. "My morning coffee" is one fixed thing
 * whatever happened to the entry that first described it.
 *
 * Distinct from the quick-log offers, which are derived by counting repeats.
 * That catches what you happen to eat a lot; this catches what you decided
 * mattered — and the two disagree often enough to be worth keeping apart.
 */
export const favourites = sqliteTable(
  "favourites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Shared with food_entries, so starring the same thing twice updates it. */
    normKey: text("norm_key").notNull(),
    /** Yours to rename — the model's description is a starting point, not a name. */
    label: text("label").notNull(),
    portion: text("portion"),
    kcal: real("kcal"),
    proteinG: real("protein_g"),
    carbsG: real("carbs_g"),
    fatG: real("fat_g"),
    saturatedFatG: real("saturated_fat_g"),
    sugarG: real("sugar_g"),
    fiberG: real("fiber_g"),
    saltG: real("salt_g"),
    /** Stored rather than inferred from the clock: a coffee is a snack at 09:00. */
    mealType: text("meal_type", { enum: ["meal", "snack"] }).notNull(),
    uses: integer("uses").notNull().default(0),
    lastUsedAt: integer("last_used_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("favourites_norm_idx").on(t.normKey)],
);

/**
 * Water, logged in increments rather than as a daily total. An append-only log
 * means "undo the last glass" is a delete, not arithmetic, and the timestamps
 * show whether you drink steadily or panic-hydrate at 22:00.
 */
export const waterLogs = sqliteTable(
  "water_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    ml: integer("ml").notNull(),
    loggedAt: integer("logged_at").notNull(),
  },
  (t) => [index("water_date_idx").on(t.date)],
);

// ── THE TRIAL ────────────────────────────────────────────────

export const trials = sqliteTable(
  "trials",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    monthIndex: integer("month_index").notNull(),
    isCheckpoint: integer("is_checkpoint", { mode: "boolean" }).notNull().default(false),

    pushupsReps: integer("pushups_reps"),
    pullupsReps: integer("pullups_reps"),
    deadhangSec: integer("deadhang_sec"),
    plankSec: integer("plank_sec"),
    squatHoldSec: integer("squat_hold_sec"),
    burpees3minReps: integer("burpees_3min_reps"),
    sitReachCm: real("sit_reach_cm"),
    circuitTotalSec: integer("circuit_total_sec"),
    /** Document's day-2 baseline test only; not part of the ARACHNE Score. */
    walkTest12MinM: integer("walk_test_12min_m"),

    /** Stored, not recomputed — a corrected target must not shift past scores. */
    score: integer("score"),
    stationScores: text("station_scores"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("trials_date_idx").on(t.date)],
);

export const abilities = sqliteTable(
  "abilities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    trialId: integer("trial_id").notNull(),
    abilityKey: text("ability_key").notNull(),
    achieved: integer("achieved", { mode: "boolean" }).notNull().default(false),
    value: real("value"),
    note: text("note"),
  },
  (t) => [uniqueIndex("abilities_trial_key_idx").on(t.trialId, t.abilityKey)],
);

// ── SUIT CHECK ───────────────────────────────────────────────

/**
 * SUIT CHECK is weekly, not monthly. Weekly is a superset — the month-boundary
 * comparisons still work, they just read off whichever week the checkpoint
 * lands in, and a weekly cadence gives 52 frames of time-lapse instead of 12.
 */
export const photos = sqliteTable(
  "photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    /** 0-based week since start date. */
    weekIndex: integer("week_index").notNull(),
    angle: text("angle", { enum: ["front", "side", "back", "side_flexed"] }).notNull(),
    path: text("path").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("photos_week_angle_idx").on(t.weekIndex, t.angle)],
);

// ── System ───────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const senseDismissals = sqliteTable("sense_dismissals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  insightKey: text("insight_key").notNull(),
  dismissedAt: integer("dismissed_at").notNull().default(now),
});

export type Favourite = typeof favourites.$inferSelect;
export type Weight = typeof weights.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type TrainingSession = typeof sessions.$inferSelect;
export type FoodEntry = typeof foodEntries.$inferSelect;
export type Trial = typeof trials.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type WaterLog = typeof waterLogs.$inferSelect;
