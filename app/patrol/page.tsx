import { redirect } from "next/navigation";
import Link from "next/link";
import { and, gte, lte, sql } from "drizzle-orm";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { getHqStats } from "@/lib/stats";
import { addDays, dayKeyOf, formatShort, todayISO, weekIndex } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { loadGameState } from "@/lib/gameData";
import {
  BASELINE_MODE,
  BASELINE_PATROLS,
  SESSION_SHAPE,
  isBaselinePhase,
  isLowProfileWeek,
  roundsForWeek,
  sessionFor,
  type DayKey,
} from "@/lib/plan";
import { courseTotalDays, phaseForDay } from "@/lib/course";
import { baselineCoverage, baselineSession, baselineSlotFor } from "@/lib/baseline";
import { conditioningOptions } from "@/lib/training";
import { WeekPlan, type DayPlan } from "@/components/WeekPlan";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

const DAY_NAMES: Record<DayKey, string> = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

const DAY_LONG: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export default async function Patrol({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  const settings = getSettings();
  const stats = getHqStats();
  const game = loadGameState();
  const today = todayISO();

  const currentWeek = weekIndex(settings.startDate, today);
  const maxWeek = Math.floor(courseTotalDays() / 7);
  const params = await searchParams;
  const requested = Number(params.week);
  const week = Number.isInteger(requested) ? Math.max(0, Math.min(requested, maxWeek)) : currentWeek;

  const weekStart = addDays(settings.startDate, week * 7);
  const lowProfile = isLowProfileWeek(week);

  // The phase is read from the week's own first day, so browsing ahead shows
  // the exercises that will actually apply then rather than today's.
  const weekPhase = phaseForDay(week * 7);

  // One query for the week rather than seven — the set counts come back with
  // the sessions so the overview shows real progress per day.
  const weekEnd = addDays(weekStart, 6);
  const rows = db
    .select({
      id: sessions.id,
      date: sessions.date,
      completed: sessions.completed,
      setsLogged: sql<number>`(SELECT COUNT(*) FROM exercise_logs WHERE exercise_logs.session_id = ${sessions.id})`,
    })
    .from(sessions)
    .where(and(gte(sessions.date, weekStart), lte(sessions.date, weekEnd)))
    .all();
  const byDate = new Map(rows.map((r) => [r.date, r]));

  // Thursday's pick-one list is driven by the VR games you own, not the
  // document's fixed five, so it has to be substituted in here too.
  const conditioning = conditioningOptions(weekPhase.id).map((o) => `${o.label} — ${o.detail}`);

  const baselineWeek = isBaselinePhase(weekPhase.id);
  const rounds = baselineWeek ? BASELINE_MODE.rounds : roundsForWeek(week);

  const days: DayPlan[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dk = dayKeyOf(date);
    const row = byDate.get(date);
    // Phase 0 runs the sweep, assigned by patrol number rather than weekday.
    const planned = baselineWeek
      ? baselineSession(settings.startDate, date)
      : sessionFor(weekPhase.id, dk);
    const session =
      planned && planned.options ? { ...planned, options: conditioning } : planned;
    return {
      dayKey: dk,
      dayName: DAY_NAMES[dk],
      date,
      dateLabel: formatShort(date).split(" ")[0],
      isToday: date === today,
      isPast: date < today,
      session,
      completed: row?.completed ?? false,
      setsLogged: row?.setsLogged ?? 0,
    };
  });

  const doneThisWeek = days.filter((d) => d.completed).length;

  const trainingCount = days.filter((d) => d.session !== null).length;

  const coverage = baselineCoverage(settings.startDate);
  // Where patrol 1 actually landed, which is only Monday if you started on one.
  const firstPatrolDay =
    Array.from({ length: 7 }, (_, i) => addDays(settings.startDate, i)).find(
      (d) => baselineSlotFor(settings.startDate, d)?.patrol.index === 1,
    ) ?? null;

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-baseline justify-between">
        <h1 className="display text-2xl text-ink">PATROL</h1>
        <span className="label-xs tabular">
          Phase {weekPhase.id} · {weekPhase.codename}
        </span>
      </header>

      {/* ── Week navigation ── */}
      <nav className="flex items-stretch gap-2">
        <Link
          href={`/patrol?week=${Math.max(0, week - 1)}`}
          aria-disabled={week === 0}
          className={`tap panel flex items-center justify-center px-4 text-lg ${
            week === 0 ? "pointer-events-none opacity-30" : "text-muted active:text-crimson"
          }`}
        >
          ‹
        </Link>

        <div className="panel flex flex-1 flex-col items-center justify-center gap-0.5 py-2">
          <span className="display text-lg text-ink">Week {week + 1}</span>
          <span className="label-xs">
            {formatShort(weekStart)} – {formatShort(addDays(weekStart, 6))}
          </span>
        </div>

        <Link
          href={`/patrol?week=${Math.min(maxWeek, week + 1)}`}
          aria-disabled={week === maxWeek}
          className={`tap panel flex items-center justify-center px-4 text-lg ${
            week === maxWeek ? "pointer-events-none opacity-30" : "text-muted active:text-crimson"
          }`}
        >
          ›
        </Link>
      </nav>

      {week !== currentWeek ? (
        <Link href="/patrol" className="label-xs text-center text-cobalt-lift underline">
          Back to this week
        </Link>
      ) : null}

      {/* ── Week status ── */}
      <section className="grid grid-cols-3 border border-edge">
        <Stat value={game.patrolStreak} label="Patrol streak" accent />
        <Stat value={rounds} label="Rounds" bordered />
        <Stat value={doneThisWeek} label={`Done / ${trainingCount}`} bordered />
      </section>

      {baselineWeek ? (
        <div className="panel-hot flex flex-col gap-2.5 p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-xs text-crimson">
              {week === 0 ? "Baseline sweep" : "Baseline repeat"}
            </p>
            <p className="label-xs tabular">
              {coverage.measured} / {coverage.probes} measured
            </p>
          </div>
          <p className="text-sm leading-relaxed text-ink">
            {week === 0
              ? `${BASELINE_PATROLS.length} patrols, ${coverage.probes} movements between them, no targets anywhere. They exist to find out what you can currently do — everything after week 2 is built on these numbers.`
              : BASELINE_MODE.repeatRule}
          </p>
          {firstPatrolDay && week === 0 ? (
            <p className="text-xs leading-relaxed text-muted">
              You started on a {DAY_LONG[dayKeyOf(settings.startDate)]}, so patrol 1 lands on{" "}
              {DAY_LONG[dayKeyOf(firstPatrolDay)]} and the rest follow in order from there.
            </p>
          ) : null}
        </div>
      ) : lowProfile ? (
        <div className="panel-hot flex flex-col gap-1 p-3.5">
          <p className="label-xs text-crimson">Low profile week</p>
          <p className="text-sm text-ink">
            Two rounds instead of three, and nothing to failure. That&apos;s programming, not slacking.
          </p>
        </div>
      ) : null}

      <p className="px-1 text-xs text-muted-dim">
        Every session: {SESSION_SHAPE.warmupMin} min warm-up → {SESSION_SHAPE.workMin} min work →{" "}
        {SESSION_SHAPE.cooldownMin} min cooldown.
      </p>

      <WeekPlan days={days} rounds={rounds} />

      <p className="px-1 text-xs leading-relaxed text-muted-dim">
        Day {stats.day} of {stats.totalDays}. Open any day to log sets and check it off. The plan is complete
        for all four phases, so browsing ahead shows the real exercises.
      </p>

      <BottomNav />
    </main>
  );
}

function Stat({
  value,
  label,
  accent,
  bordered,
}: {
  value: number;
  label: string;
  accent?: boolean;
  bordered?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 p-2.5 ${bordered ? "border-l border-edge" : ""}`}>
      <span className={`numeral text-2xl tabular ${accent && value > 0 ? "text-crimson" : "text-ink"}`}>
        {value}
      </span>
      <span className="label-xs leading-tight">{label}</span>
    </div>
  );
}
