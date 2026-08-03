import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { getHqStats } from "@/lib/stats";
import { getSettings } from "@/lib/settings";
import { BASELINE_MODE, PHASES } from "@/lib/plan";
import { baselineComparison, baselineCoverage, baselineSchedule, startingRungs } from "@/lib/baseline";
import { formatShort, todayISO } from "@/lib/dates";
import { loadBaseline } from "./actions";
import { BaselineForms } from "@/components/BaselineForms";
import { BottomNav } from "@/components/BottomNav";
import { TensionLine } from "@/components/TensionLine";

export const dynamic = "force-dynamic";

export default async function Baseline() {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  const stats = getHqStats();
  const s = getSettings();
  const { test, meas } = await loadBaseline();
  const phase0 = PHASES[0];
  const daysLeft = Math.max(0, phase0.endDay - stats.day + 1);
  const today = todayISO();
  const schedule = baselineSchedule(s.startDate).filter((e) => e.slot !== null);
  const coverage = baselineCoverage(s.startDate);
  const comparison = baselineComparison(s.startDate).filter((c) => c.first !== null);
  const repeated = comparison.filter((c) => c.second !== null);
  const rungs = startingRungs();

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/" className="label-xs">
            ‹ HQ
          </Link>
          <h1 className="display text-2xl text-ink">BASELINE</h1>
        </div>
        <span className="label-xs tabular">
          {stats.phase.id === 0 ? `${daysLeft}d left` : "Phase 0 closed"}
        </span>
      </header>

      <section className="panel halftone flex flex-col gap-3 p-4">
        <p className="label-xs text-cobalt-lift">What these two weeks are for</p>
        <p className="text-sm leading-relaxed text-ink">
          Finding out where you actually start — what you normally eat, how much you normally drink, and what
          you can currently do. Nothing here is meant to be hard.
        </p>
        <TensionLine />
        <ul className="flex flex-col gap-2">
          {[
            "Eat exactly as you normally would and log all of it. A baseline you've already tidied up tells you nothing.",
            "Five patrols in week 1 cover every movement the year uses. No targets on any of them — you're taking a reading, not setting a record.",
            "Week 2 repeats the same five. Two readings a week apart is a baseline; one is a guess.",
            `Drink to ${(s.waterTargetMl / 1000).toFixed(1)} L and log it, so you know whether that's a change or already normal.`,
            "The deficit starts in week 3. Not before.",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-cobalt" />
              <span className="text-sm leading-relaxed text-muted">{t}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── The sweep ── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="label-xs">The sweep</p>
          <p className="label-xs tabular">
            {coverage.measured} / {coverage.probes} movements measured
          </p>
        </div>

        <ul className="panel divide-y divide-edge">
          {schedule.map(({ date, slot }, i) => (
            <li key={date}>
              {/* The repeat week is the same five patrols again, so it needs a
                  seam — otherwise the list reads as ten different sessions. */}
              {i > 0 && slot!.round !== schedule[i - 1].slot!.round ? (
                <p className="label-xs border-b border-edge bg-panel-2 px-3 py-1.5 text-cobalt-lift">
                  Week 2 · the same five again
                </p>
              ) : null}
              <Link
                href={`/patrol/${date}`}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center border text-xs ${
                    date < today
                      ? "border-crimson-dim text-crimson"
                      : date === today
                        ? "border-crimson bg-crimson text-ink"
                        : "border-edge text-muted-dim"
                  }`}
                >
                  {slot!.patrol.index}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm text-ink">{slot!.patrol.title}</span>
                  <span className="label-xs">
                    {formatShort(date)} · {slot!.patrol.probes.length} movements
                    {slot!.round === 1 ? " · repeat" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-crimson">&rarr;</span>
              </Link>
            </li>
          ))}
        </ul>

        {coverage.missing.length > 0 ? (
          <p className="px-1 text-xs leading-relaxed text-muted-dim">
            Still unmeasured: {coverage.missing.slice(0, 6).map((m) => m.name).join(", ")}
            {coverage.missing.length > 6 ? ` and ${coverage.missing.length - 6} more` : ""}. Anything left
            blank keeps the document&apos;s own starting numbers instead of yours.
          </p>
        ) : (
          <p className="px-1 text-xs leading-relaxed text-cobalt-lift">
            Every movement measured. From week 3 the plan places each one on the rung your own numbers
            justify.
          </p>
        )}
      </section>

      {/* ── Week 1 against week 2 ── */}
      {comparison.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-xs">Week 1 vs week 2</p>
            <p className="label-xs tabular">
              {repeated.length} of {comparison.length} repeated
            </p>
          </div>

          <ul className="panel divide-y divide-edge">
            {comparison.map((c) => (
              <li key={c.key} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                <span className="flex shrink-0 items-baseline gap-2 tabular">
                  <span className="numeral text-sm text-muted">
                    {c.first}
                    {c.metric === "time" ? "s" : ""}
                  </span>
                  <span className="text-muted-dim">&rarr;</span>
                  <span className="numeral text-sm text-ink">
                    {c.second === null ? "—" : `${c.second}${c.metric === "time" ? "s" : ""}`}
                  </span>
                  <span
                    className={`numeral w-12 text-right text-xs ${
                      c.delta === null
                        ? "text-muted-dim"
                        : c.delta > 0
                          ? "text-cobalt-lift"
                          : c.delta < 0
                            ? "text-crimson"
                            : "text-muted"
                    }`}
                  >
                    {c.delta === null
                      ? ""
                      : `${c.delta > 0 ? "+" : ""}${c.delta}${c.metric === "time" ? "s" : ""}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p className="px-1 text-xs leading-relaxed text-muted-dim">
            {repeated.length === 0
              ? "Nothing repeated yet. Week 2 runs the same five patrols in the same order — the second number is the one the plan builds on."
              : "A large jump usually means week 1 was cautious rather than that seven days made you stronger; a drop usually means week 1 went too close to failure. Either way, the second reading is the truer one."}
          </p>
        </section>
      ) : null}

      {/* ── What the fortnight concluded ── */}
      {rungs.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="label-xs">Where the plan starts you</p>
          <ul className="panel divide-y divide-edge">
            {rungs.map((r) => (
              <li key={r.family} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm text-ink">{r.movement}</span>
                  <span className="label-xs truncate">{r.evidence}</span>
                </span>
                {/* Rung on the ladder, so progress up it is visible at a glance. */}
                <span className="flex shrink-0 gap-0.5" aria-label={`Rung ${r.rung + 1} of ${r.rungs}`}>
                  {Array.from({ length: r.rungs }, (_, i) => (
                    <span
                      key={i}
                      className={`h-4 w-1 ${i <= r.rung ? "bg-crimson" : "bg-panel-2"}`}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-1 text-xs leading-relaxed text-muted-dim">
            From Phase 1 the plan prescribes these variations rather than the document&apos;s defaults, and
            moves you up a rung on its own rule — a clean 3&times;12. Never more than one rung either side of
            what the plan asked for.
          </p>
        </section>
      ) : null}

      <BaselineForms
        initialTest={test as unknown as Record<string, number | null> | null}
        initialMeas={meas as unknown as Record<string, number | null> | null}
        heightCm={s.heightCm}
      />

      <p className="px-1 text-xs leading-relaxed text-muted-dim">
        {BASELINE_MODE.rule}
      </p>

      <BottomNav />
    </main>
  );
}
