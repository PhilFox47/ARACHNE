import { asc } from "drizzle-orm";
import { db } from "./db";
import { abilities, foodEntries, measurements, photos, sessions, trials, weights } from "./db/schema";
import { todayISO } from "./dates";
import { getSettings } from "./settings";
import { computeGameState, type GameInput, type GameState } from "./game";

/**
 * Reads every table the progression engine cares about. Tables that Phase 2–4
 * haven't started filling yet come back empty, and the engine handles that —
 * so the level, streaks and challenges are live from day one and simply gain
 * more sources as the app grows.
 */
export function loadGameState(): GameState {
  const s = getSettings();

  const input: GameInput = {
    startDate: s.startDate,
    today: todayISO(),
    weights: db
      .select({ date: weights.date, weightKg: weights.weightKg })
      .from(weights)
      .orderBy(asc(weights.date))
      .all(),
    sessions: db
      .select({
        date: sessions.date,
        dayKey: sessions.dayKey,
        completed: sessions.completed,
        rpe: sessions.rpe,
        note: sessions.note,
      })
      .from(sessions)
      .orderBy(asc(sessions.date))
      .all(),
    food: db
      .select({
        date: foodEntries.date,
        loggedAt: foodEntries.loggedAt,
        kcal: foodEntries.kcal,
        proteinG: foodEntries.proteinG,
        mealType: foodEntries.mealType,
      })
      .from(foodEntries)
      .orderBy(asc(foodEntries.date))
      .all(),
    trials: db
      .select({
        date: trials.date,
        monthIndex: trials.monthIndex,
        score: trials.score,
        pullupsReps: trials.pullupsReps,
      })
      .from(trials)
      .orderBy(asc(trials.date))
      .all(),
    photos: db
      .select({ date: photos.date, weekIndex: photos.weekIndex, angle: photos.angle })
      .from(photos)
      .orderBy(asc(photos.date))
      .all(),
    measurements: db.select({ date: measurements.date }).from(measurements).all(),
    abilities: db
      .select({ abilityKey: abilities.abilityKey, achieved: abilities.achieved })
      .from(abilities)
      .all(),
  };

  return computeGameState(input);
}
