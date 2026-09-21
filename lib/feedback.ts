/**
 * How a movement felt, and what the next session should do about it.
 *
 * Pure and database-free: the session screen is a client component, so anything
 * it imports at runtime must not reach `lib/db`, or better-sqlite3 follows it
 * into the browser bundle and the build dies on `Can't resolve 'fs'`.
 *
 * Three answers were not enough. "Controlled" covered both *this was exactly
 * right* and *this was trivial, give me more*, which are opposite instructions
 * wearing the same word — and the app could only ever act on the first reading,
 * so a movement you had outgrown sat at the same weight until the calendar
 * moved it. And "hard" covered both *I finished, barely* and *I could not
 * finish*, which is the difference between the load being right at the edge and
 * the load being wrong.
 *
 * Five answers separate those. Read left to right they are a scale, from too
 * little to too much, with the one that is not about effort at the end.
 */

export const VERDICTS = [
  {
    key: "easy",
    /** Two or three words, for the legend that sits under nine cards. */
    brief: "no effort",
    label: "Easy",
    hint: "Almost no effort — make it harder",
    /** What the next session does. */
    meaning: "Logged as too light. The next session asks for more.",
  },
  {
    key: "clean",
    /** Two or three words, for the legend that sits under nine cards. */
    brief: "right amount",
    label: "Clean",
    hint: "Done as asked, exactly the right amount",
    meaning: "The load is right. The next session adds the usual step.",
  },
  {
    key: "hard",
    /** Two or three words, for the legend that sits under nine cards. */
    brief: "took everything",
    label: "Hard",
    hint: "Finished it, but it took everything",
    meaning: "At the edge and still finished. The next session holds here rather than adding.",
  },
  {
    key: "limit",
    /** Two or three words, for the legend that sits under nine cards. */
    brief: "could not finish",
    label: "Limit",
    hint: "Could not reach the goal — but nothing hurt",
    meaning: "Past what you can absorb today. The next session holds rather than asking again for more.",
  },
  {
    key: "painful",
    /** Two or three words, for the legend that sits under nine cards. */
    brief: "joint, not muscle",
    label: "Painful",
    hint: "A joint, or somewhere that should not hurt",
    meaning: "Not a training signal. The next session drops back, and two of these step the movement down a rung.",
  },
] as const;

export type Verdict = (typeof VERDICTS)[number]["key"];

export const VERDICT_KEYS = VERDICTS.map((v) => v.key) as readonly Verdict[];

export function verdictInfo(v: Verdict): (typeof VERDICTS)[number] {
  return VERDICTS.find((x) => x.key === v)!;
}

/** Whether a string off the database is one of the five. */
export function isVerdict(v: string | null | undefined): v is Verdict {
  return v !== null && v !== undefined && (VERDICT_KEYS as readonly string[]).includes(v);
}

/**
 * Where a verdict sits on the effort scale, for comparing two of them.
 *
 * `painful` deliberately has no place on it. It is not "more effort than
 * limit" — it is a different kind of answer, about a joint rather than a
 * muscle, and averaging it in with the others would turn an injury report into
 * a training intensity.
 */
export function effortRank(v: Verdict): number | null {
  const i = (["easy", "clean", "hard", "limit"] as const).indexOf(v as "easy");
  return i === -1 ? null : i;
}

/** The verdicts that say the load is at or past what can be absorbed. */
export function isOverreach(v: Verdict): boolean {
  return v === "limit" || v === "painful";
}

/**
 * How far the next target moves, given how the last session felt.
 *
 * This is the whole point of asking. Double progression on its own can only see
 * the reps you logged, so it reads "twelve reps" the same way whether they flew
 * up or nearly killed you, and it adds one either way. These steps let the
 * answer you gave change what you are asked for next.
 *
 * Deliberately asymmetric: `easy` doubles the step, everything from `hard`
 * upwards stops it. Adding load to a session that already took everything is
 * how people get hurt, and the cost of holding for one session is one session.
 */
export interface Step {
  /** Extra reps on a rep-based movement. */
  reps: number;
  /** Extra seconds on a hold. */
  seconds: number;
  /** Ask for the bottom of the range again rather than adding to the top. */
  back: boolean;
}

export function stepFor(v: Verdict | null | undefined): Step {
  switch (v) {
    case "easy":
      return { reps: 2, seconds: 10, back: false };
    case "hard":
    case "limit":
      return { reps: 0, seconds: 0, back: false };
    case "painful":
      return { reps: 0, seconds: 0, back: true };
    // `clean`, and anything never answered, keep the ordinary single step. A
    // movement with no feedback must progress exactly as it did before this
    // existed, or a quiet session would silently stall the plan.
    case "clean":
    default:
      return { reps: 1, seconds: 5, back: false };
  }
}
