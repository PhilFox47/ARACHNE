import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getHqStats } from "@/lib/stats";
import { dayKeyOf, todayISO, weekIndex } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { isLowProfileWeek, roundsForWeek, sessionFor, SESSION_SHAPE } from "@/lib/plan";
import { BottomNav } from "@/components/BottomNav";
import { TensionLine } from "@/components/TensionLine";

export const dynamic = "force-dynamic";

/**
 * Read-only in this build. Logging, streaks and the heatmap arrive with Phase 2 —
 * but the session itself is pure plan.ts, so showing it now costs nothing and
 * makes the phase derivation checkable against the plan document on the phone.
 */
export default async function Patrol() {
  if (!(await isAuthed())) redirect("/login");

  const settings = getSettings();
  const stats = getHqStats();
  const today = todayISO();
  const dayKey = dayKeyOf(today);
  const week = weekIndex(settings.startDate, today);
  const lowProfile = isLowProfileWeek(week);
  const rounds = roundsForWeek(week);
  const session = sessionFor(stats.phase.id, dayKey);

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-baseline justify-between">
        <h1 className="display text-2xl text-ink">PATROL</h1>
        <span className="label-xs tabular">Week {week + 1}</span>
      </header>

      {lowProfile ? (
        <div className="panel-hot flex flex-col gap-1 p-3.5">
          <p className="label-xs text-crimson">Low profile week</p>
          <p className="text-sm text-ink">
            {rounds} rounds instead of 3, and nothing to failure. That&apos;s programming, not slacking.
          </p>
        </div>
      ) : null}

      {session === null ? (
        <section className="swing panel halftone flex flex-col gap-2 p-6">
          <p className="display text-3xl text-ink">Off-duty</p>
          <p className="text-sm text-muted">
            No patrol today. Optional: one 45-minute walk.
          </p>
        </section>
      ) : (
        <section className="swing panel flex flex-col gap-4 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="display text-2xl text-ink">{session.title}</h2>
            <span className="label-xs shrink-0 tabular">
              {rounds} rounds &middot; {SESSION_SHAPE.workMin} min
            </span>
          </div>

          {session.blurb ? <p className="text-sm text-muted">{session.blurb}</p> : null}

          {session.warmup ? (
            <Block title={`Warm-up · ${SESSION_SHAPE.warmupMin} min`} items={session.warmup} />
          ) : null}

          {session.main.length > 0 ? <Block title="Work" items={session.main} /> : null}

          {session.options ? (
            <div className="flex flex-col gap-2">
              <p className="label-xs">Pick one</p>
              <ul className="flex flex-col gap-1.5">
                {session.options.map((o) => (
                  <li key={o} className="text-sm text-ink">
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {session.extras ? <Block title="Additionally" items={session.extras} /> : null}
          {session.cooldown ? (
            <Block title={`Cooldown · ${SESSION_SHAPE.cooldownMin} min`} items={session.cooldown} />
          ) : null}

          {session.rule ? (
            <>
              <TensionLine accent />
              <p className="border-l-2 border-l-crimson pl-3 text-sm leading-relaxed text-muted">
                {session.rule}
              </p>
            </>
          ) : null}
        </section>
      )}

      <p className="px-1 text-xs text-muted-dim">
        Check-off, RPE, PATROL STREAK and the eight-week heatmap arrive in the next build.
      </p>

      <BottomNav />
    </main>
  );
}

function Block({
  title,
  items,
}: {
  title: string;
  items: { name: string; dose: string; note?: string; since?: number }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="label-xs">{title}</p>
      <ul className="flex flex-col divide-y divide-edge border border-edge">
        {items.map((e) => (
          <li key={e.name} className="flex items-baseline justify-between gap-3 px-3 py-2">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm text-ink">
                {e.name}
                {e.since ? (
                  <span className="ml-2 border border-crimson-dim px-1 text-[0.5rem] uppercase tracking-widest text-crimson">
                    New
                  </span>
                ) : null}
              </span>
              {e.note ? <span className="text-xs text-muted-dim">{e.note}</span> : null}
            </span>
            <span className="shrink-0 text-sm text-muted tabular">{e.dose}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
