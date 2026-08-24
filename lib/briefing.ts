import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { briefings, exerciseLogs, foodEntries, sessionPlans, sessions, waterLogs } from "./db/schema";
import { addDays, dayKeyOf, daysBetween, todayISO, weekIndex } from "./dates";
import { getSettings } from "./settings";
import { TRAINING_DAYS, isLowProfileWeek, roundsForWeek, sessionFor, type DayKey } from "./plan";
import { intakeForDay, isRefuelWeek, phaseForDay, proteinTargetForDay } from "./course";
import { getHqStats, loadWeights, rollingAverage } from "./stats";
import { findMovement } from "./movements";
import { apiKey, baseUrl } from "./nanogpt";
import { activeVisionModel } from "./settings";

/**
 * The trainer's morning paragraph.
 *
 * Every other screen reports one thing: PATROL knows about sessions, FUEL about
 * food, VITALS about the scale. Nobody was reading across them, and that is
 * where the useful observations live — protein short on exactly the days you
 * train hardest, the weekend snacking that undoes a good week, a strand that
 * has been one clean session from mastery for a fortnight.
 *
 * Written once a day and stored, which is the deliberate exception to this
 * app's derive-everything rule. It costs a model call, and a paragraph that
 * rewrites itself on every page load is a paragraph you stop reading. What it
 * says at 08:00 it says all day.
 */

/** Not before this hour. The briefing is a morning thing; it reads the day. */
export const BRIEFING_HOUR = 8;

/**
 * How long a locally-composed briefing waits before the model may replace it.
 *
 * The fallback exists so the screen is never empty, not so the day is settled
 * by whichever minute the network was down. It is upgradeable — but not on
 * every page load, or a flat network turns into a request per refresh.
 */
const LOCAL_RETRY_MINUTES = 30;

export interface BriefingRow {
  date: string;
  body: string;
  source: "ai" | "local";
  model: string | null;
  createdAt: number;
}

export function storedBriefing(date: string): BriefingRow | null {
  const row = db.select().from(briefings).where(eq(briefings.date, date)).get();
  return row
    ? { date: row.date, body: row.body, source: row.source, model: row.model, createdAt: row.createdAt }
    : null;
}

/**
 * Whether a briefing should exist for this date yet.
 *
 * Due from 08:00, so the morning's weight and breakfast are in it. The one
 * exception is a run that has never had one: an empty panel on the first
 * morning reads as a broken feature rather than as a thing that arrives later,
 * so the first is written whenever the app is first opened.
 */
export function briefingDue(date: string, now = new Date()): boolean {
  if (date !== todayISO()) return false;
  if (now.getHours() >= BRIEFING_HOUR) return true;
  return db.select({ n: sql<number>`COUNT(*)` }).from(briefings).get()?.n === 0;
}

/** A stored local briefing the model may now have another go at. */
export function upgradable(row: BriefingRow, now = new Date()): boolean {
  if (row.source !== "local") return false;
  return now.getTime() / 1000 - row.createdAt > LOCAL_RETRY_MINUTES * 60;
}

// ─────────────────────────────────────────────────────────────
// The facts
// ─────────────────────────────────────────────────────────────

export interface BriefingFacts {
  today: string;
  dayKey: DayKey;
  day: number;
  totalDays: number;
  phase: { id: number; name: string; focus: string };
  week: { index: number; lowProfile: boolean; refuel: boolean; rounds: number };
  vitals: {
    latestKg: number | null;
    avg7: number | null;
    avg7LastWeek: number | null;
    corridorKg: number;
    corridorState: string;
    deltaFromStartKg: number | null;
    targetKg: number;
    daysSinceWeighIn: number | null;
    bodyfatPct: number | null;
  };
  fuel: {
    kcalTargetToday: number;
    plannedKcal: number;
    adjustment: number;
    proteinTargetG: number;
    last7: { date: string; kcal: number; proteinG: number; waterMl: number; snackPct: number; entries: number }[];
    daysLogged7: number;
    avgKcal7: number | null;
    avgProtein7: number | null;
    proteinDaysMet7: number;
    /**
     * Days over the target, and what actually put them there.
     *
     * Totals alone let a trainer say "you were over"; only the items let it say
     * which thing to drop. The second is the useful sentence, so the entries
     * that did the damage travel with the number.
     */
    overTargetDays: {
      date: string;
      kcal: number;
      target: number;
      overBy: number;
      worstItems: { description: string; kcal: number; mealType: string }[];
    }[];
    /** The week's most expensive snacks, which is usually the same short list. */
    topSnacks7: { description: string; kcal: number; times: number }[];
  };
  patrol: {
    last7: { date: string; dayKey: string; title: string | null; completed: boolean; rpe: number | null; note: string | null; sets: number }[];
    doneThisWeek: number;
    dueThisWeek: number;
    todaysSession: { title: string; movements: string[] } | null;
    nextThreeDays: { date: string; dayKey: string; title: string | null }[];
    lastSessionDaysAgo: number | null;
    /**
     * Training days that came and went with nothing completed.
     *
     * A missing row and a row marked incomplete mean the same thing to the
     * person reading the briefing, and neither is visible from a list of the
     * sessions that did happen.
     */
    skipped: { date: string; dayKey: string; title: string | null; started: boolean }[];
    /**
     * Movements that came in under what was prescribed, with the catalogue's
     * own coaching notes attached.
     *
     * The notes travel with the shortfall on purpose. "Your rows dropped to six"
     * is an observation; "your rows dropped to six — hips stay up, a sagging
     * middle turns this into an arm exercise" is the reason it happened, and it
     * is already written down in the catalogue rather than something a model
     * should be inventing.
     */
    shortfalls: {
      date: string;
      name: string;
      metric: string;
      target: number | null;
      best: number | null;
      previousBest: number | null;
      setsDone: number;
      setsPlanned: number;
      watch: string | null;
      cues: string[];
    }[];
  };
}

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

const TRAINING_DAY_KEYS: string[] = [...TRAINING_DAYS];

const DAY_NAMES: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const dayName = (k: string) => DAY_NAMES[k] ?? k;

/** "Monday, Tuesday and Thursday" — not three ands in a row. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The shape stored in `session_plans.payload`, narrowed to what is read here. */
interface PlannedExercise {
  key: string;
  name: string;
  sets: number;
  metric: "reps" | "time";
  targetReps: number | null;
  targetSeconds: number | null;
  targetWeightKg: number | null;
}

/**
 * Movements that came in under what the day actually asked for.
 *
 * Read from the stored prescription rather than from the plan, because the
 * prescription is what was on the screen: it has already been placed on the
 * ladder, gated on equipment and adjusted for how the last session went. Judging
 * a set against a number that was never shown would be a trainer marking you on
 * a paper you did not sit.
 *
 * A set count that fell short counts too. Three prescribed and one logged is a
 * session that was abandoned partway, and that is worth saying out loud —
 * whereas a rep or two under target on the last set is not, which is why the
 * miss has to be more than a rounding error to be reported at all.
 */
function findShortfalls(from: string, to: string): BriefingFacts["patrol"]["shortfalls"] {
  const plans = db
    .select()
    .from(sessionPlans)
    .where(and(gte(sessionPlans.date, from), lte(sessionPlans.date, to)))
    .all();
  if (plans.length === 0) return [];

  const logs = db
    .select()
    .from(exerciseLogs)
    .where(and(gte(exerciseLogs.date, from), lte(exerciseLogs.date, to)))
    .all();

  const out: BriefingFacts["patrol"]["shortfalls"] = [];

  for (const plan of plans) {
    let planned: PlannedExercise[];
    try {
      planned = JSON.parse(plan.payload) as PlannedExercise[];
    } catch {
      continue;
    }
    for (const p of planned) {
      const sets = logs.filter((l) => l.date === plan.date && l.exerciseKey === p.key);
      // Nothing logged at all is not a shortfall on this movement — it is a
      // skipped session, and that is reported separately and only once.
      if (sets.length === 0) continue;

      const isTime = p.metric === "time";
      const best = isTime
        ? Math.max(...sets.map((s) => s.seconds ?? 0))
        : Math.max(...sets.map((s) => s.reps ?? 0));
      const target = isTime ? p.targetSeconds : p.targetReps;

      // The same movement before this date, for "down from" rather than just "under".
      const earlier = db
        .select({ reps: exerciseLogs.reps, seconds: exerciseLogs.seconds })
        .from(exerciseLogs)
        .where(and(eq(exerciseLogs.exerciseKey, p.key), lte(exerciseLogs.date, addDays(plan.date, -1))))
        .orderBy(desc(exerciseLogs.date))
        .limit(12)
        .all();
      const previousBest = earlier.length
        ? Math.max(...earlier.map((e) => (isTime ? (e.seconds ?? 0) : (e.reps ?? 0))))
        : null;

      const missedTarget = target !== null && best > 0 && best < target;
      const missedSets = sets.length < p.sets;
      const wentBackwards = previousBest !== null && previousBest > 0 && best < previousBest;
      if (!missedTarget && !missedSets && !wentBackwards) continue;

      const m = findMovement(p.name);
      out.push({
        date: plan.date,
        name: p.name,
        metric: p.metric,
        target,
        best,
        previousBest,
        setsDone: sets.length,
        setsPlanned: p.sets,
        watch: m?.watch ?? null,
        cues: m?.cues?.slice(0, 3) ?? [],
      });
    }
  }

  // Worst first, newest first, and capped — four specific movements is already
  // more than one paragraph can act on.
  return out
    .sort((a, b) => {
      const gap = (x: (typeof out)[number]) =>
        x.target && x.best !== null ? (x.target - x.best) / x.target : 0;
      return gap(b) - gap(a) || b.date.localeCompare(a.date);
    })
    .slice(0, 4);
}

export function gatherFacts(date = todayISO()): BriefingFacts {
  const settings = getSettings();
  const stats = getHqStats();
  const rows = loadWeights();
  const day = Math.max(0, daysBetween(settings.startDate, date));
  const wk = weekIndex(settings.startDate, date);
  const from = addDays(date, -7);

  // ── VITALS ──
  const avg7 = rollingAverage(rows, date);
  const avg7Prev = rollingAverage(rows, addDays(date, -7));
  const last = rows.length ? rows[rows.length - 1] : null;

  // ── FUEL ──
  const food = db
    .select()
    .from(foodEntries)
    .where(and(gte(foodEntries.date, from), lte(foodEntries.date, date)))
    .all();
  const water = db
    .select({ date: waterLogs.date, ml: sql<number>`SUM(${waterLogs.ml})` })
    .from(waterLogs)
    .where(and(gte(waterLogs.date, from), lte(waterLogs.date, date)))
    .groupBy(waterLogs.date)
    .all();
  const waterByDate = new Map(water.map((w) => [w.date, w.ml]));

  const fuelDays: BriefingFacts["fuel"]["last7"] = [];
  for (let i = 7; i >= 0; i--) {
    const d = addDays(date, -i);
    const rowsForDay = food.filter((f) => f.date === d);
    const kcal = rowsForDay.reduce((s, f) => s + (f.kcal ?? 0), 0);
    const snack = rowsForDay.filter((f) => f.mealType === "snack").reduce((s, f) => s + (f.kcal ?? 0), 0);
    fuelDays.push({
      date: d,
      kcal: Math.round(kcal),
      proteinG: Math.round(rowsForDay.reduce((s, f) => s + (f.proteinG ?? 0), 0)),
      waterMl: waterByDate.get(d) ?? 0,
      snackPct: kcal > 0 ? Math.round((snack / kcal) * 100) : 0,
      entries: rowsForDay.length,
    });
  }
  const logged = fuelDays.filter((d) => d.entries > 0);
  const proteinTarget = proteinTargetForDay(day);

  // ── Which days went over, and on what ──
  const overTargetDays: BriefingFacts["fuel"]["overTargetDays"] = [];
  for (const d of logged) {
    const target = intakeForDay(daysBetween(settings.startDate, d.date)).kcal;
    if (d.kcal <= target) continue;
    overTargetDays.push({
      date: d.date,
      kcal: d.kcal,
      target,
      overBy: d.kcal - target,
      worstItems: food
        .filter((f) => f.date === d.date && (f.kcal ?? 0) > 0)
        .sort((a, b) => (b.kcal ?? 0) - (a.kcal ?? 0))
        .slice(0, 4)
        .map((f) => ({
          description: f.description,
          kcal: Math.round(f.kcal ?? 0),
          mealType: f.mealType,
        })),
    });
  }

  const snackTally = new Map<string, { description: string; kcal: number; times: number }>();
  for (const f of food) {
    if (f.mealType !== "snack" || !f.kcal) continue;
    const cur = snackTally.get(f.normKey) ?? { description: f.description, kcal: 0, times: 0 };
    cur.kcal += f.kcal;
    cur.times += 1;
    snackTally.set(f.normKey, cur);
  }
  const topSnacks7 = [...snackTally.values()]
    .map((s) => ({ ...s, kcal: Math.round(s.kcal) }))
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, 4);

  // ── PATROL ──
  const sess = db
    .select()
    .from(sessions)
    .where(and(gte(sessions.date, from), lte(sessions.date, date)))
    .orderBy(asc(sessions.date))
    .all();
  const setCounts = db
    .select({ date: exerciseLogs.date, n: sql<number>`COUNT(*)` })
    .from(exerciseLogs)
    .where(and(gte(exerciseLogs.date, from), lte(exerciseLogs.date, date)))
    .groupBy(exerciseLogs.date)
    .all();
  const setsByDate = new Map(setCounts.map((s) => [s.date, s.n]));

  const patrolDays = sess.map((s) => ({
    date: s.date,
    dayKey: s.dayKey,
    title: sessionFor(phaseForDay(daysBetween(settings.startDate, s.date)).id, s.dayKey as DayKey)?.title ?? null,
    completed: s.completed,
    rpe: s.rpe,
    note: s.note,
    sets: setsByDate.get(s.date) ?? 0,
  }));

  const lastDone = db
    .select({ date: sessions.date })
    .from(sessions)
    .where(eq(sessions.completed, true))
    .orderBy(desc(sessions.date))
    .get();

  // This week's attendance, Monday to Sunday.
  const monday = addDays(date, -((dayKeyOf(date) === "sun" ? 7 : ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(dayKeyOf(date))) - 1));
  const weekSessions = db
    .select()
    .from(sessions)
    .where(and(gte(sessions.date, monday), lte(sessions.date, addDays(monday, 6))))
    .all();

  // ── Training days that produced nothing ──
  const doneDates = new Set(sess.filter((s) => s.completed).map((s) => s.date));
  const startedDates = new Set(sess.map((s) => s.date));
  const skipped: BriefingFacts["patrol"]["skipped"] = [];
  for (let i = 7; i >= 1; i--) {
    const d = addDays(date, -i);
    if (d < settings.startDate) continue;
    const dk = dayKeyOf(d);
    if (!TRAINING_DAY_KEYS.includes(dk)) continue;
    if (doneDates.has(d)) continue;
    skipped.push({
      date: d,
      dayKey: dk,
      title: sessionFor(phaseForDay(daysBetween(settings.startDate, d)).id, dk)?.title ?? null,
      started: startedDates.has(d),
    });
  }

  // ── Movements that came in short ──
  const shortfalls = findShortfalls(from, date);

  const phase = phaseForDay(day);
  const todaysPlan = sessionFor(phase.id, dayKeyOf(date));
  const intake = intakeForDay(day);

  return {
    today: date,
    dayKey: dayKeyOf(date),
    day,
    totalDays: stats.totalDays,
    phase: { id: phase.id, name: phase.codename, focus: phase.focus },
    week: {
      index: wk,
      lowProfile: isLowProfileWeek(wk),
      refuel: isRefuelWeek(wk),
      rounds: roundsForWeek(wk),
    },
    vitals: {
      latestKg: round1(last?.weightKg ?? null),
      avg7: round1(avg7),
      avg7LastWeek: round1(avg7Prev),
      corridorKg: round1(stats.corridorTarget)!,
      corridorState: stats.corridorState,
      deltaFromStartKg: round1(stats.deltaFromStart),
      targetKg: stats.targetWeightKg,
      daysSinceWeighIn: last ? daysBetween(last.date, date) : null,
      bodyfatPct: stats.latestBodyfat?.pct ?? null,
    },
    fuel: {
      kcalTargetToday: intake.kcal,
      plannedKcal: intake.planned,
      adjustment: intake.adjustment,
      proteinTargetG: proteinTarget,
      last7: fuelDays,
      daysLogged7: logged.length,
      avgKcal7: logged.length ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length) : null,
      avgProtein7: logged.length ? Math.round(logged.reduce((s, d) => s + d.proteinG, 0) / logged.length) : null,
      proteinDaysMet7: logged.filter((d) => d.proteinG >= proteinTarget).length,
      overTargetDays,
      topSnacks7,
    },
    patrol: {
      last7: patrolDays,
      doneThisWeek: weekSessions.filter((s) => s.completed).length,
      dueThisWeek: 5,
      todaysSession: todaysPlan
        ? { title: todaysPlan.title, movements: todaysPlan.main.map((m) => m.name).slice(0, 8) }
        : null,
      nextThreeDays: [1, 2, 3].map((i) => {
        const d = addDays(date, i);
        const p = phaseForDay(daysBetween(settings.startDate, d));
        return { date: d, dayKey: dayKeyOf(d), title: sessionFor(p.id, dayKeyOf(d))?.title ?? null };
      }),
      lastSessionDaysAgo: lastDone ? daysBetween(lastDone.date, date) : null,
      skipped,
      shortfalls,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// The prompt
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the coach for ARACHNE, a twelve-month Spider-Man-inspired fitness programme run by one person from a private app. You write the briefing that sits at the top of their home screen each morning.

WHAT THIS IS
A short, direct paragraph or two — 90 to 150 words, never more. Read across everything: PATROL (training), FUEL (food and water), VITALS (weight), and where they are in the year. Say what went well, say plainly what did not, and give them today.

VOICE
Spoken by a coach who knows them and has seen the numbers. Calm, specific, faintly wry. Never chirpy, never a motivational poster, never a listicle. British English. Address them as "you". Prose only — no headings, no bullet points, no emoji, no markdown.

BE HONEST, NOT NICE
This is the part that matters most. You are a coach, not a cheerleader. They have asked you to push them, and a briefing that congratulates them on a bad week is worse than no briefing.

- Never praise for the sake of it. Say something went well only when the data shows it went well, and say which number says so. No praise without evidence.
- If they went over the calorie target, say so and name the item. "You were 480 over on Thursday, and 620 of that was the pizza" is the sentence. "Watch your intake" is not.
- If a movement came in under what was prescribed, say what it was and by how much, then give one concrete correction. The data hands you the catalogue's own coaching notes for that movement — use them. Do not invent technique advice.
- If they skipped a patrol, say so plainly and without softening it. Skipping one is a fact to state; skipping two or more in a week deserves a sharper sentence than that. Do not pretend it was a rest day.
- If a number went backwards, say it went backwards.
- Do not open with reassurance before getting to the problem, and do not end by taking the criticism back. Say the hard thing once, mean it, then say what to do about it.

WHERE THE LINE IS
Blunt about the work, never about them as a person. Criticise the session, the choice, the week — never their character, their body or their worth. Do not shame, do not moralise about food, do not call anything a cheat or a sin, and never imply they should punish themselves with training or by eating less. Sharp and fair, the way a good coach is. If the week was genuinely good, say that plainly too — earned praise is not flattery.

THE PROGRAMME'S OWN WORDS — use these, they are what the screens say:
PATROL is a training session. FUEL is food. VITALS is the scale. THE WEB is the skill tree. LOW PROFILE WEEK is a deload. REFUEL WEEK is a planned week at maintenance calories. OFF-DUTY is a rest day.

RULES
- Use only the numbers in the data. Never invent a figure, a weight, a calorie count, a food or a session that is not there.
- Lead with what actually matters today. One sharp observation beats four weak ones.
- Always name specifics: the food, the movement, the day, the number. Vagueness is the failure mode.
- Finish on today: what this session is for, or what to watch, or what to eat. One sentence of the days ahead is welcome; today is the focus.
- Do not give medical advice. Never suggest eating below the plan's calorie target, and never suggest training to make up for food.
- If there is barely any data yet — a new run, a quiet week — say something short and useful rather than padding it out.

WHAT THE DATA GIVES YOU
fuel.overTargetDays carries each day that went over, with worstItems — the biggest entries by calories. That is where you find the thing to name.
fuel.topSnacks7 is the week's most expensive snacking, usually the same short list repeating.
patrol.skipped is training days that produced nothing. "started": true means they opened the session and abandoned it, which is a different failure from not turning up and can be said differently.
patrol.shortfalls is movements that came in under the prescription, each with target, best, previousBest, the sets done against the sets planned, and the catalogue's own "watch" and "cues" for that movement. Use those for the correction — they are the programme's own coaching, and they are why you can be specific about technique without guessing.`;

export function buildUserText(f: BriefingFacts): string {
  return [
    "Write today's briefing from this data.",
    "",
    JSON.stringify(f, null, 1),
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// The fallback
// ─────────────────────────────────────────────────────────────

/**
 * What to say when the model cannot be reached.
 *
 * Not an apology and not an error — the same observations, composed from the
 * same facts by hand. It is worse prose and it is never nothing, which is the
 * right trade at 08:00 on a Tuesday with no internet.
 */
export function localBriefing(f: BriefingFacts): string {
  const { vitals, fuel, patrol, week } = f;
  /** Observations, ranked. Only the sharpest few make it into the paragraph. */
  const seen: { p: number; text: string }[] = [];
  const say = (p: number, text: string) => seen.push({ p, text });

  if (week.refuel) {
    say(100, `REFUEL WEEK. Eat at maintenance — ${fuel.kcalTargetToday.toLocaleString("en-GB")} kcal — and take the two-round sessions. Scheduled recovery, not a slip.`);
  } else if (week.lowProfile) {
    say(60, "LOW PROFILE WEEK — two rounds instead of three, and nothing to failure.");
  }

  // ── Skipped patrols. The loudest thing in the data. ──
  if (patrol.skipped.length >= 2) {
    say(98, `${patrol.skipped.length} patrols missed this week — ${listOf(patrol.skipped.map((s) => dayName(s.dayKey)))}. That is not a slow week, it is most of one gone. Turning up is the whole of Phase 1.`);
  } else if (patrol.skipped.length === 1) {
    const s = patrol.skipped[0];
    say(
      88,
      s.started
        ? `You opened ${dayName(s.dayKey)}'s ${s.title ?? "session"} and did not finish it. An abandoned session is still a miss.`
        : `${dayName(s.dayKey)}'s ${s.title ?? "patrol"} did not happen. Recoverable — but do not stack it on top of today's.`,
    );
  } else if (patrol.lastSessionDaysAgo !== null && patrol.lastSessionDaysAgo >= 3) {
    say(95, `${patrol.lastSessionDaysAgo} days since the last PATROL. Start with today's and do not try to make up the others.`);
  } else if (patrol.doneThisWeek >= 4) {
    say(40, `${patrol.doneThisWeek} of ${patrol.dueThisWeek} patrols done this week — that is the number that decides the year.`);
  }

  // ── The movement that went worst, and the catalogue's reason why. ──
  const worst = patrol.shortfalls[0];
  if (worst) {
    const u = worst.metric === "time" ? "s" : "";
    // Both can be true at once — one set, and that set short — and saying only
    // the louder half loses the reason it happened.
    const short = worst.target !== null && worst.best !== null && worst.best < worst.target;
    const back = worst.previousBest !== null && worst.best !== null && worst.best < worst.previousBest;
    const cut = worst.setsDone < worst.setsPlanned;

    const parts: string[] = [];
    if (cut) parts.push(`${worst.setsDone} ${worst.setsDone === 1 ? "set" : "sets"} of ${worst.setsPlanned}`);
    if (short) parts.push(`${worst.best}${u} against ${worst.target}${u}`);
    else if (back) parts.push(`${worst.best}${u}, down from ${worst.previousBest}${u}`);

    if (parts.length > 0) {
      say(
        cut && !short ? 80 : short ? 85 : 83,
        `${worst.name}: ${listOf(parts)}.` +
          (cut ? " Finish the sets — the last one is the one doing the work." : "") +
          (short || back ? correction(worst) : ""),
      );
    }
  }

  // ── FUEL, naming what actually did the damage. ──
  if (fuel.daysLogged7 === 0) {
    say(92, "Nothing logged in FUEL this week. Photograph what you eat — you cannot fix a week you cannot see.");
  } else {
    const over = [...fuel.overTargetDays].sort((a, b) => b.overBy - a.overBy);
    if (over.length > 0) {
      const d = over[0];
      const item = d.worstItems[0];
      say(
        90,
        `${dayName(dayKeyOf(d.date))} finished ${d.overBy} kcal over at ${d.kcal.toLocaleString("en-GB")}` +
          (item ? `, and ${item.kcal} of that was the ${item.description.toLowerCase()}` : "") +
          `.${over.length > 1 ? ` ${over.length} days over this week.` : ""}`,
      );
    }
    if (fuel.daysLogged7 <= 4) say(70, `FUEL logged on only ${fuel.daysLogged7} of the last 8 days.`);
    if (fuel.avgProtein7 !== null && fuel.avgProtein7 < fuel.proteinTargetG) {
      say(75, `Protein is averaging ${fuel.avgProtein7} g against ${fuel.proteinTargetG} g — the gap that costs muscle in a deficit.`);
    } else if (fuel.proteinDaysMet7 >= 5 && over.length === 0) {
      say(50, `Protein hit on ${fuel.proteinDaysMet7} of the logged days and nothing over target. That is a good week.`);
    }
  }

  // ── VITALS ──
  if (vitals.daysSinceWeighIn === null) {
    say(94, "No weight logged yet. The corridor cannot tell you anything without a reading.");
  } else if (vitals.daysSinceWeighIn >= 3) {
    say(91, `No reading for ${vitals.daysSinceWeighIn} days — the average is guesswork until you step on the scale.`);
  } else if (vitals.avg7 !== null && vitals.avg7LastWeek !== null) {
    const move = Math.round((vitals.avg7LastWeek - vitals.avg7) * 10) / 10;
    if (move > 0.1) say(45, `Average is down ${move} kg on last week.`);
    else if (move < -0.1) say(65, `Average is up ${Math.abs(move)} kg on last week. One week is noise; two is a trend.`);
    else say(55, "Average is flat on last week.");
  }

  // The closing line always survives — a briefing that does not land on today
  // is a report, and a report is not what the top of the home screen is for.
  const closing = patrol.todaysSession
    ? `Today is ${patrol.todaysSession.title} — ${week.rounds} rounds. ${fuel.kcalTargetToday.toLocaleString("en-GB")} kcal and ${fuel.proteinTargetG} g of protein.`
    : `OFF-DUTY today. Still weigh in and still log — ${fuel.kcalTargetToday.toLocaleString("en-GB")} kcal, ${fuel.proteinTargetG} g of protein.`;

  // Three observations at most. Everything true is not the same as everything
  // worth saying, and a paragraph nobody finishes coaches nobody.
  const chosen = seen.sort((a, b) => b.p - a.p).slice(0, 3);
  return [...chosen.map((c) => c.text), closing].join(" ");
}

/**
 * The correction to append to a shortfall, from the catalogue rather than invented.
 *
 * The cues, not the "what goes wrong" note. Both are good coaching, but `watch`
 * often opens with setup — the inverted row's begins "check the table takes your
 * weight before you get under it", which is sound advice and not the reason you
 * managed six instead of ten. The cues are the technique, they are already
 * imperative, and three of them fit in a clause.
 */
function correction(s: BriefingFacts["patrol"]["shortfalls"][number]): string {
  if (s.cues.length === 0) return s.watch ? ` ${s.watch}` : "";
  const cues = s.cues.map((c) => c.toLowerCase()).join(", ");
  return ` ${cues.charAt(0).toUpperCase()}${cues.slice(1)}.`;
}

// ─────────────────────────────────────────────────────────────
// Generation
// ─────────────────────────────────────────────────────────────

function save(date: string, body: string, source: "ai" | "local", model: string | null): BriefingRow {
  // Upsert on the date index: two tabs opening at 08:00 must not race into two
  // rows, and the second one through should simply replace the first.
  db.insert(briefings)
    .values({ date, body, source, model, createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({
      target: briefings.date,
      set: { body, source, model, createdAt: Math.floor(Date.now() / 1000) },
    })
    .run();
  return storedBriefing(date)!;
}

/**
 * Today's briefing, writing it if it is due and missing.
 *
 * Never throws and never returns nothing: a model that is slow, unreachable or
 * talking nonsense falls through to the locally composed version, which is
 * stored so the screen has something and marked so a later load can improve it.
 */
export async function ensureBriefing(date = todayISO(), timeoutMs = 30_000): Promise<BriefingRow | null> {
  const existing = storedBriefing(date);
  if (existing && !upgradable(existing)) return existing;
  if (!existing && !briefingDue(date)) return null;

  const facts = gatherFacts(date);
  const key = apiKey();
  const model = activeVisionModel();

  if (!key || !model) return existing ?? save(date, localBriefing(facts), "local", null);

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserText(facts) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();

    // A refusal, an empty answer or a wall of text are all "the model did not
    // do the job" — the local version is better than any of them.
    if (text.length < 40 || text.length > 2000) throw new Error("unusable length");
    return save(date, stripFormatting(text), "ai", model);
  } catch {
    return existing ?? save(date, localBriefing(facts), "local", null);
  }
}

/**
 * Markdown the prompt asked it not to use, removed rather than rendered.
 *
 * The panel is plain text on purpose; a stray "**" or a bullet in the middle of
 * a paragraph is the one thing that makes it look machine-written.
 */
export function stripFormatting(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)[*_](\S(?:.*?\S)?)[*_](?=\s|$)/g, "$1$2")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
