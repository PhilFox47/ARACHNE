import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { isAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { dayKeyOf, daysBetween, formatShort, todayISO, weekIndex } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { SESSION_SHAPE, isLowProfileWeek, phaseForDay, sessionFor, type DayKey } from "@/lib/plan";
import {
  baselinePrescription,
  conditioningOptions,
  hasVrHeadset,
  loggedSets,
  personalBest,
  storedPrescription,
} from "@/lib/training";
import { SessionLogger } from "@/components/SessionLogger";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ date: string }> }) {
  if (!(await isAuthed())) redirect("/login");

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const settings = getSettings();
  const day = daysBetween(settings.startDate, date);
  const dk = dayKeyOf(date) as DayKey;
  const phase = phaseForDay(day);
  const wk = weekIndex(settings.startDate, date);
  const planSession = sessionFor(phase.id, dk);

  const row = db.select().from(sessions).where(eq(sessions.date, date)).get();
  const rx = storedPrescription(date) ?? baselinePrescription(phase.id, dk, wk, date);

  const logged = row ? loggedSets(row.id) : {};
  const pbs = Object.fromEntries(rx.exercises.map((e) => [e.key, personalBest(e.key)]));

  const isToday = date === todayISO();

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={`/patrol?week=${wk}`} className="label-xs">
            ‹ Week {wk + 1}
          </Link>
          <h1 className="display truncate text-2xl text-ink">
            {planSession?.title ?? "Off-duty"}
          </h1>
          <p className="label-xs">
            {formatShort(date)}
            {isToday ? " · today" : ""} · Phase {phase.id} {phase.codename}
          </p>
        </div>
      </header>

      {planSession === null ? (
        <section className="panel halftone flex flex-col gap-2 p-6">
          <p className="display text-2xl text-ink">Off-duty</p>
          <p className="text-sm text-muted">
            No patrol scheduled. The plan prescribes rest here — a rest day taken on purpose isn&apos;t a
            missed one. An optional 45-minute walk is the only thing on the list.
          </p>
        </section>
      ) : rx.exercises.length === 0 ? (
        <section className="panel flex flex-col gap-3 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-xs">Pick one</p>
            {!hasVrHeadset() ? <p className="label-xs text-crimson">No headset</p> : null}
          </div>
          <ul className="flex flex-col divide-y divide-edge border border-edge">
            {conditioningOptions(phase.id).map((o) => (
              <li key={o.label} className="flex flex-col gap-0.5 px-3 py-2">
                <span className="text-sm text-ink">{o.label}</span>
                <span className="text-xs leading-relaxed text-muted-dim">{o.detail}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-dim">
            {planSession.rule ?? "25 minutes unbroken, heart rate high."}
          </p>
          <SessionLogger
            date={date}
            initialPrescription={rx}
            initialLogged={logged}
            personalBests={pbs}
            completed={row?.completed ?? false}
            initialRpe={row?.rpe ?? null}
            initialNote={row?.note ?? null}
            isDeload={isLowProfileWeek(wk)}
          />
        </section>
      ) : (
        <>
          {planSession.warmup ? (
            <details className="panel p-3">
              <summary className="label-xs cursor-pointer select-none">
                Warm-up · {SESSION_SHAPE.warmupMin} min
              </summary>
              <ul className="mt-3 flex flex-col divide-y divide-edge border border-edge">
                {planSession.warmup.map((e) => (
                  <li key={e.name} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-ink">{e.name}</span>
                    <span className="text-sm text-muted tabular">{e.dose}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <SessionLogger
            date={date}
            initialPrescription={rx}
            initialLogged={logged}
            personalBests={pbs}
            completed={row?.completed ?? false}
            initialRpe={row?.rpe ?? null}
            initialNote={row?.note ?? null}
            isDeload={isLowProfileWeek(wk)}
          />

          {planSession.cooldown ? (
            <details className="panel p-3">
              <summary className="label-xs cursor-pointer select-none">
                Cooldown · {SESSION_SHAPE.cooldownMin} min
              </summary>
              <ul className="mt-3 flex flex-col divide-y divide-edge border border-edge">
                {planSession.cooldown.map((e) => (
                  <li key={e.name} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-ink">{e.name}</span>
                    <span className="text-sm text-muted tabular">{e.dose}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {planSession.rule ? (
            <p className="border-l-2 border-l-crimson pl-3 text-sm leading-relaxed text-muted">
              {planSession.rule}
            </p>
          ) : null}
        </>
      )}

      <BottomNav />
    </main>
  );
}
