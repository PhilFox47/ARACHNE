import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { getHqStats } from "@/lib/stats";
import { getSettings } from "@/lib/settings";
import { BASELINE_MODE, PHASES } from "@/lib/plan";
import { baselineCoverage, baselineSchedule } from "@/lib/baseline";
import { formatShort, todayISO } from "@/lib/dates";
import { loadBaseline } from "./actions";
import { BaselineForms } from "@/components/BaselineForms";
import { BottomNav } from "@/components/BottomNav";
import { TensionLine } from "@/components/TensionLine";

export const dynamic = "force-dynamic";

export default async function Baseline() {
  if (!(await isAuthed())) redirect("/login");

  const stats = getHqStats();
  const s = getSettings();
  const { test, meas } = await loadBaseline();
  const phase0 = PHASES[0];
  const daysLeft = Math.max(0, phase0.endDay - stats.day + 1);
  const today = todayISO();
  const schedule = baselineSchedule(s.startDate).filter((e) => e.slot !== null);
  const coverage = baselineCoverage(s.startDate);

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
          {schedule.map(({ date, slot }) => (
            <li key={date}>
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
