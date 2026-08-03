import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { getHqStats } from "@/lib/stats";
import { getSettings } from "@/lib/settings";
import { BASELINE_MODE, PHASES } from "@/lib/plan";
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
            "Train at the bottom of every range, two rounds, stopping three or four short. Soreness on day 3 costs you week 2.",
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
