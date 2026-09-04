/**
 * What a session actually asks of you, read off a stored prescription.
 *
 * Pure and database-free on purpose. The session screen is a client component,
 * so anything it imports at runtime must not reach `lib/db` — a value imported
 * from `lib/training` drags better-sqlite3 into the browser bundle and the build
 * fails on `Can't resolve 'fs'`.
 *
 * Three places have to agree on what a target is: the progression that advances
 * it, the trainer that judges a session against it, and the screen you log on.
 * When they each kept their own idea, the trainer called ten reps of an 8–12 set
 * two reps short. One definition, imported by all three, is the fix.
 */

export interface WorkingRange {
  /** What the set has to clear. Anything from here up is a set done right. */
  floor: number;
  /** The far end. Reaching it is what earns more weight, not what is required. */
  top: number;
}

/**
 * The working range behind a display string like "8–12" or "30–45 s".
 *
 * Read back out of `repRange` rather than carried separately, because that
 * string is already on every stored prescription and adding a field would mean
 * every session saved before this release had none.
 *
 * A prescription with a single number ("10") gives a range of one, so callers
 * do not have to special-case it.
 */
export function workingRange(repRange: string | null, fallback: number | null): WorkingRange | null {
  const m = repRange?.match(/(\d+)(?:\s*[–-]\s*(\d+))?/);
  if (m) return { floor: Number(m[1]), top: Number(m[2] ?? m[1]) };
  return fallback === null ? null : { floor: fallback, top: fallback };
}

/** The working range in words, for a screen: "12–15 reps", "30–45 s". */
export function rangeLabel(range: WorkingRange | null, metric: "reps" | "time"): string | null {
  if (!range) return null;
  const unit = metric === "time" ? "s" : "reps";
  return range.top > range.floor ? `${range.floor}–${range.top} ${unit}` : `${range.floor} ${unit}`;
}

/**
 * How one logged set stands against what was asked of it.
 *
 * Three tiers rather than two, because there are genuinely two goals on the
 * screen and showing only the harder one was misleading: a set of thirteen
 * against a 12–15 prescription is a set done exactly right, and it was marked
 * with the same grey dot as a set of six because thirteen is short of the
 * fifteen that THE WEB wants.
 *
 *   short     below the bottom of today's range — the only actual miss
 *   met       inside today's range, which is the whole ask
 *   mastered  also clears the movement's mastery bar, which is a further,
 *             slower goal and not what today is marked on
 */
export type SetStanding = "empty" | "short" | "met" | "mastered";

export function setStanding(
  value: number | null,
  range: WorkingRange | null,
  clearsBar: boolean,
): SetStanding {
  if (value === null || value <= 0) return "empty";
  if (clearsBar) return "mastered";
  if (range && value < range.floor) return "short";
  return "met";
}
