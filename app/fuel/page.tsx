import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getHqStats } from "@/lib/stats";
import { PROTEIN_PER_MEAL_G } from "@/lib/plan";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function Fuel() {
  if (!(await isAuthed())) redirect("/login");
  const stats = getHqStats();

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-baseline justify-between">
        <h1 className="display text-2xl text-ink">FUEL</h1>
        <span className="label-xs tabular">Phase {stats.phase.id}</span>
      </header>

      <section className="swing panel halftone flex flex-col gap-4 p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="label-xs">Daily target</p>
            <p className="numeral text-6xl text-ink tabular">
              {stats.kcalTarget.toLocaleString("en-GB")}
              <span className="ml-1.5 text-[0.28em] tracking-normal text-muted">KCAL</span>
            </p>
          </div>
          {stats.phase.proteinG ? (
            <div className="flex flex-col items-end gap-1.5">
              <p className="label-xs">Protein</p>
              <p className="numeral text-3xl text-crimson tabular">{stats.phase.proteinG}g</p>
            </div>
          ) : null}
        </div>
        {stats.inTaper ? (
          <p className="text-xs text-muted">
            Closing taper — back to maintenance for the final two weeks.
          </p>
        ) : null}
      </section>

      <div className="panel flex flex-col gap-2 p-4">
        <p className="label-xs">Not yet online</p>
        <p className="text-sm text-muted">
          Camera capture, the daily log and the weekly snack-versus-meal breakdown arrive in the next
          build but one. Until then the target above is the whole feature.
        </p>
      </div>

      <div className="panel flex flex-col gap-2 p-4">
        <p className="label-xs">Standing rule</p>
        <p className="text-sm text-ink">
          {PROTEIN_PER_MEAL_G} g of protein per meal. Non-negotiable — it protects muscle in a deficit and
          it keeps you full.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
