import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { todayISO, addDays, mondayOf, formatShort } from "@/lib/dates";
import { seedChores, allChores, choreLogBetween } from "@/lib/choreData";
import { malusFor, standingsFor, MALUS_CAP, DAILY_MALUS, WEEKLY_MALUS } from "@/lib/chores";
import { ChoreList } from "@/components/ChoreList";
import { ChoreEditor } from "@/components/ChoreEditor";
import { BottomNav } from "@/components/BottomNav";
import { SmallHours } from "@/components/SmallHours";
import { TensionLine } from "@/components/TensionLine";

export const dynamic = "force-dynamic";

export default async function Maintenance() {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  seedChores();

  const today = todayISO();
  const chores = allChores();
  // Two weeks back is enough for today's standings and the malus, which only
  // ever reads yesterday and last week.
  const log = choreLogBetween(addDays(today, -21), today);
  const { daily, weekly } = standingsFor(today, chores, log);
  const malus = malusFor(today, chores, log);

  const dailyDone = daily.filter((s) => s.done).length;
  const weeklyDone = weekly.filter((s) => s.done).length;
  const monday = mondayOf(today);

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-baseline justify-between">
        <h1 className="display text-2xl text-ink">MAINTENANCE</h1>
        <span className="label-xs tabular">
          {dailyDone + weeklyDone} / {daily.length + weekly.length}
        </span>
      </header>

      <SmallHours className="-mt-3" />

      {/* ── What it is costing you ── */}
      {malus.fraction > 0 ? (
        <section className="panel border-l-2 border-l-crimson p-3.5">
          <p className="label-xs text-crimson">
            −{Math.round(malus.fraction * 100)}% XP today
            {malus.capped ? ` · capped at ${Math.round(MALUS_CAP * 100)}%` : ""}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            {malus.missedDaily.length > 0
              ? `Missed yesterday: ${malus.missedDaily.join(", ")}.`
              : ""}
            {malus.missedWeekly.length > 0
              ? ` Missed last week: ${malus.missedWeekly.join(", ")}.`
              : ""}{" "}
            Clear today&rsquo;s list and tomorrow is back to full.
          </p>
        </section>
      ) : (
        <section className="panel border-l-2 border-l-cobalt p-3.5">
          <p className="label-xs text-cobalt-lift">No malus</p>
          <p className="mt-1 text-sm text-ink">
            {malus.dailyDue + malus.weeklyDue === 0
              ? "Full XP today. Nothing was due yesterday — the malus starts once these have been on the list for a day."
              : "Full XP today. Every daily chore was done yesterday and every weekly one last week."}
          </p>
        </section>
      )}

      {/* ── Today ── */}
      <section className="swing flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="label-xs">Today · {formatShort(today)}</p>
          <p className="label-xs tabular">
            {dailyDone} / {daily.length}
          </p>
        </div>
        <div className="panel px-3.5">
          {daily.length === 0 ? (
            <p className="py-3 text-sm text-muted">No daily chores. Add one below.</p>
          ) : (
            <ChoreList items={daily} date={today} />
          )}
        </div>
        <TensionLine accent={dailyDone < daily.length} />
      </section>

      {/* ── This week ──
          Visible from Monday and tickable any day: the laundry does not care
          which day it happened, only that the week did not end without it. */}
      <section className="swing flex flex-col gap-2" style={{ animationDelay: "90ms" }}>
        <div className="flex items-baseline justify-between">
          <p className="label-xs">
            This week · from {formatShort(monday)}
          </p>
          <p className="label-xs tabular">
            {weeklyDone} / {weekly.length}
          </p>
        </div>
        <div className="panel px-3.5">
          {weekly.length === 0 ? (
            <p className="py-3 text-sm text-muted">No weekly chores. Add one below.</p>
          ) : (
            <ChoreList items={weekly} date={today} />
          )}
        </div>
      </section>

      {/* ── The list itself ── */}
      <ChoreEditor
        daily={daily.map((s) => s.chore)}
        weekly={weekly.map((s) => s.chore)}
      />

      <p className="text-xs leading-relaxed text-muted-dim">
        A daily chore missed yesterday costs {Math.round(DAILY_MALUS * 100)}% of today&rsquo;s XP; a
        weekly one missed last week costs {Math.round(WEEKLY_MALUS * 100)}% of every day this week.
        They add up, to a maximum of {Math.round(MALUS_CAP * 100)}%. Milestones — achievements,
        ABILITIES, checkpoints, THE TRIAL — are never reduced.
      </p>

      <BottomNav />
    </main>
  );
}
