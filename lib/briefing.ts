import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { briefings, exerciseLogs, foodEntries, sessions, weights, waterLogs } from "./db/schema";
import { addDays, dayKeyOf, daysBetween, todayISO, weekIndex } from "./dates";
import { getSettings } from "./settings";
import { isLowProfileWeek, roundsForWeek, sessionFor, type DayKey } from "./plan";
import { intakeForDay, isRefuelWeek, phaseForDay, proteinTargetForDay } from "./course";
import { getHqStats, loadWeights, rollingAverage } from "./stats";
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
  };
  patrol: {
    last7: { date: string; dayKey: string; title: string | null; completed: boolean; rpe: number | null; note: string | null; sets: number }[];
    doneThisWeek: number;
    dueThisWeek: number;
    todaysSession: { title: string; movements: string[] } | null;
    nextThreeDays: { date: string; dayKey: string; title: string | null }[];
    lastSessionDaysAgo: number | null;
  };
}

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

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

THE PROGRAMME'S OWN WORDS — use these, they are what the screens say:
PATROL is a training session. FUEL is food. VITALS is the scale. THE WEB is the skill tree. LOW PROFILE WEEK is a deload. REFUEL WEEK is a planned week at maintenance calories. OFF-DUTY is a rest day.

RULES
- Use only the numbers in the data. Never invent a figure, a weight, a calorie count or a session that is not there.
- Lead with what actually matters today. One good observation beats four weak ones.
- Name at least one specific thing from the data — a number, a movement, a day of the week.
- If something is genuinely wrong, say so once, plainly, and say what to do about it. Do not scold and do not repeat it.
- If they have missed sessions or stopped logging, be matter-of-fact. The point is getting them back, not making them feel watched.
- Finish on today: what this session is for, or what to watch, or what to eat. One sentence of the days ahead is welcome; today is the focus.
- Do not give medical advice. Do not suggest eating below the plan's calorie target.
- If there is barely any data yet — a new run, a quiet week — say something short and useful rather than padding it out.`;

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
  const bits: string[] = [];
  const { vitals, fuel, patrol, week } = f;

  if (week.refuel) {
    bits.push(
      `REFUEL WEEK. Eat at maintenance — ${fuel.kcalTargetToday.toLocaleString("en-GB")} kcal — and take the two-round sessions. This is scheduled recovery, not a slip.`,
    );
  } else if (week.lowProfile) {
    bits.push(`LOW PROFILE WEEK — two rounds instead of three, and nothing to failure.`);
  }

  // VITALS
  if (vitals.daysSinceWeighIn === null) {
    bits.push("No weight logged yet. The corridor needs a reading before it can tell you anything.");
  } else if (vitals.daysSinceWeighIn >= 3) {
    bits.push(`No reading for ${vitals.daysSinceWeighIn} days — the average is guesswork until you step on the scale.`);
  } else if (vitals.avg7 !== null && vitals.avg7LastWeek !== null) {
    const move = Math.round((vitals.avg7LastWeek - vitals.avg7) * 10) / 10;
    if (move > 0.1) bits.push(`Average is down ${move} kg on last week, ${vitals.corridorState.replace("inside", "inside the corridor")}.`);
    else if (move < -0.1) bits.push(`Average is up ${Math.abs(move)} kg on last week — judge it across a fortnight, not a morning.`);
    else bits.push(`Average is flat on last week, sitting ${vitals.corridorState.replace("inside", "inside the corridor")}.`);
  }

  // PATROL
  if (patrol.lastSessionDaysAgo !== null && patrol.lastSessionDaysAgo >= 3) {
    bits.push(`${patrol.lastSessionDaysAgo} days since the last PATROL. Turning up is the whole phase — start with today's and don't try to make up the others.`);
  } else if (patrol.doneThisWeek > 0) {
    bits.push(`${patrol.doneThisWeek} of ${patrol.dueThisWeek} patrols done this week.`);
  }

  // FUEL
  if (fuel.daysLogged7 === 0) {
    bits.push("Nothing logged in FUEL this week. Photograph what you eat — the point is seeing the week, not counting to the calorie.");
  } else {
    if (fuel.daysLogged7 <= 4) bits.push(`FUEL logged on ${fuel.daysLogged7} of the last 8 days.`);
    if (fuel.avgProtein7 !== null && fuel.avgProtein7 < fuel.proteinTargetG) {
      bits.push(`Protein is averaging ${fuel.avgProtein7} g against a target of ${fuel.proteinTargetG} g — that gap is the one that costs muscle in a deficit.`);
    } else if (fuel.proteinDaysMet7 >= 5) {
      bits.push(`Protein hit on ${fuel.proteinDaysMet7} of the logged days. That is the thing that keeps the weight loss honest.`);
    }
  }

  // Today
  if (patrol.todaysSession) {
    bits.push(
      `Today is ${patrol.todaysSession.title} — ${week.rounds} rounds. Target ${fuel.kcalTargetToday.toLocaleString("en-GB")} kcal and ${fuel.proteinTargetG} g of protein.`,
    );
  } else {
    bits.push(
      `OFF-DUTY today. Still weigh in and still log — ${fuel.kcalTargetToday.toLocaleString("en-GB")} kcal, ${fuel.proteinTargetG} g of protein.`,
    );
  }

  return bits.join(" ");
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
