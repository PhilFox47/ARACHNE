import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { dayKeyOf, daysBetween, formatShort, todayISO, weekIndex } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import {
  BASELINE_MODE,
  SESSION_SHAPE,
  isBaselinePhase,
  isLowProfileWeek,
  sessionFor,
  type DayKey,
} from "@/lib/plan";
import { phaseForDay } from "@/lib/course";
import { baselineSession, baselineSlotFor } from "@/lib/baseline";
import {
  baselinePrescription,
  conditioningOptions,
  hasVrHeadset,
  loggedSets,
  personalBest,
  isPreview,
  storedPrescription,
} from "@/lib/training";
import { feedbackFor } from "@/lib/skills";
import { SessionLogger } from "@/components/SessionLogger";
import { findMovement, type Movement } from "@/lib/movements";
import { treeContext } from "@/lib/web";
import type { TreeContext } from "@/components/MovementBrief";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ date: string }> }) {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const settings = getSettings();
  const day = daysBetween(settings.startDate, date);
  const dk = dayKeyOf(date) as DayKey;
  const phase = phaseForDay(day);
  const wk = weekIndex(settings.startDate, date);

  // Phase 0 runs the sweep, and the sweep is assigned by patrol number rather
  // than weekday — so the session for a date can't be looked up from `dk`.
  const baseline = isBaselinePhase(phase.id);
  const slot = baseline ? baselineSlotFor(settings.startDate, date) : null;
  const planSession = baseline ? baselineSession(settings.startDate, date) : sessionFor(phase.id, dk);

  const row = db.select().from(sessions).where(eq(sessions.date, date)).get();
  const rx = storedPrescription(date) ?? baselinePrescription(phase.id, dk, wk, date);

  // What was already said about each movement today, so a reload shows the
  // answer rather than asking again — which, now that it is asked every session
  // rather than once ever, is the difference between a question and a nag.
  const feel: Record<string, "controlled" | "hard" | "pain"> = {};
  for (const f of feedbackFor(date)) feel[f.exerciseKey] = f.verdict;

  /**
   * The catalogue entry behind every movement in the session, so the ⓘ on each
   * card can explain it without a round-trip.
   *
   * Sent alongside the prescription rather than stored on it: the explanation
   * belongs to the movement, not to the day, and freezing a copy of it into
   * every saved session would mean an improved warning never reached the
   * sessions that were already written.
   */
  const briefs: Record<string, { m: Movement; tree: TreeContext }> = {};
  for (const e of rx.exercises) {
    const m = findMovement(e.name);
    if (m) briefs[e.key] = { m, tree: treeContext(m) };
  }

  const logged = row ? loggedSets(row.id) : {};
  const pbs = Object.fromEntries(rx.exercises.map((e) => [e.key, personalBest(e.key)]));

  const isToday = date === todayISO();
  // A day that has not arrived. The session is worked out fresh every time it is
  // opened and nothing about it is written down — see `isPreview` in
  // lib/training.
  const preview = isPreview(date);

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
      ) : (
        <>
          {preview ? (
            <section className="panel flex flex-col gap-2 border-l-2 border-l-cobalt p-4">
              <p className="label-xs text-cobalt-lift">Preview</p>
              <p className="text-sm leading-relaxed text-ink">
                This day hasn&apos;t happened yet, so these are the movements and numbers your
                logs would earn you <em>today</em> — not a decision the app has made about it.
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Nothing here is saved. It is worked out again every time you look, and settled for
                real on the morning of, from everything you have logged by then. Train well between
                now and then and this session gets harder on its own.
              </p>
            </section>
          ) : null}

          {slot ? (
            <section className="panel-hot flex flex-col gap-2 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="label-xs text-crimson">
                  Patrol {slot.patrol.index} of 5 · {slot.round === 0 ? "sweep" : "repeat"}
                </p>
                <p className="label-xs">No targets</p>
              </div>
              <p className="text-sm leading-relaxed text-ink">{planSession.blurb}</p>
              <p className="text-xs leading-relaxed text-muted">{BASELINE_MODE.rule}</p>
            </section>
          ) : null}

          {/* Pick-one lists — Thursday, and the baseline Engine patrol. */}
          {planSession.options ? (
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
            </section>
          ) : null}

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
            preview={preview}
            briefs={briefs}
            feel={feel}
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

          {planSession.rule && !planSession.options ? (
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
