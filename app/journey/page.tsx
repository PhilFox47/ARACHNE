import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { buildJourney, newMovementsIn } from "@/lib/journey";
import { loadGameState } from "@/lib/gameData";
import { formatShort } from "@/lib/dates";
import { CountUp } from "@/components/CountUp";
import { TensionLine } from "@/components/TensionLine";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  const j = buildJourney();
  const game = loadGameState();
  const pct = Math.round(j.progress * 100);

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-baseline justify-between">
        <h1 className="display text-2xl text-ink">JOURNEY</h1>
        <span className="label-xs tabular">
          Day {j.day} / {j.totalDays}
        </span>
      </header>

      {/* ── The year as one bar ── */}
      <section className="swing panel halftone flex flex-col gap-3 p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="label-xs">Through the year</p>
            <CountUp value={pct} decimals={0} suffix="%" className="numeral text-5xl text-ink" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="label-xs">Remaining</p>
            <p className="numeral text-2xl text-cobalt-lift tabular">{j.totalDays - j.day}d</p>
          </div>
        </div>

        {/* Phase bands, proportional to their real length. */}
        <div className="flex h-3 w-full gap-px border border-edge">
          {j.phases.map((p) => (
            <div
              key={p.phase.id}
              className="relative bg-panel-2"
              style={{ flexGrow: p.daysTotal }}
              title={`${p.phase.codename}: ${p.daysTotal} days`}
            >
              <div
                className={p.status === "done" ? "h-full bg-crimson" : "h-full bg-cobalt"}
                style={{ width: `${Math.round(p.progress * 100)}%` }}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 border border-edge">
          <Tot value={j.totals.sessions} label="Sessions" accent />
          <Tot value={j.totals.sets} label="Sets" bordered />
          <Tot value={game.level} label="Level" bordered />
          <Tot
            value={j.totals.weightLost === null ? 0 : Math.abs(j.totals.weightLost)}
            label="Kg off"
            bordered
            decimals={1}
          />
        </div>
      </section>

      {/* ── Phases ── */}
      <section className="flex flex-col gap-3">
        <p className="label-xs">The five phases</p>
        {j.phases.map((p) => {
          const unlocks = newMovementsIn(p.phase.id);
          const isCurrent = p.status === "current";

          return (
            <article
              key={p.phase.id}
              className={`flex flex-col gap-3 p-4 ${isCurrent ? "panel-hot" : "panel"} ${
                p.status === "ahead" ? "opacity-75" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="label-xs">Phase {p.phase.id}</span>
                    {p.status === "done" ? (
                      <span className="label-xs text-cobalt-lift">Behind you</span>
                    ) : isCurrent ? (
                      <span className="label-xs text-crimson">You are here</span>
                    ) : (
                      <span className="label-xs text-muted-dim">Ahead</span>
                    )}
                  </span>
                  <span className={`display text-xl ${isCurrent ? "text-crimson" : "text-ink"}`}>
                    {p.phase.codename}
                  </span>
                  <span className="text-xs text-muted">{p.phase.focus}</span>
                  <span className="label-xs">
                    {formatShort(p.startDate)} – {formatShort(p.endDate)} · {p.daysTotal} days
                  </span>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="numeral text-2xl text-ink tabular">
                    {p.phase.kcal.toLocaleString("en-GB")}
                  </span>
                  <span className="label-xs">kcal</span>
                  {p.phase.proteinG ? (
                    <span className="label-xs">{p.phase.proteinG}g protein</span>
                  ) : null}
                </div>
              </div>

              {/* Weight target for the phase */}
              {p.phase.weightFromKg !== null && p.phase.weightToKg !== null ? (
                <div className="flex items-baseline justify-between border border-edge px-3 py-2">
                  <span className="label-xs">Target</span>
                  <span className="numeral text-base text-ink tabular">
                    {p.phase.weightFromKg} → {p.phase.weightToKg} kg
                  </span>
                </div>
              ) : null}

              {p.status !== "ahead" ? (
                <>
                  <div className="relative h-1.5 w-full bg-panel-2">
                    <div
                      className={isCurrent ? "h-full bg-crimson" : "h-full bg-cobalt"}
                      style={{ width: `${Math.round(p.progress * 100)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <Fact
                      value={`${p.sessionsDone}/${p.sessionsPossible}`}
                      label="Sessions"
                    />
                    <Fact value={String(p.setsLogged)} label="Sets" />
                    <Fact
                      value={
                        p.weightDelta === null
                          ? "—"
                          : `${p.weightDelta > 0 ? "+" : ""}${p.weightDelta} kg`
                      }
                      label="Weight"
                      accent={p.weightDelta !== null && p.weightDelta < 0}
                    />
                  </div>
                </>
              ) : null}

              <p className="border-l-2 border-l-edge pl-3 text-sm leading-relaxed text-muted">
                {p.phase.brief}
              </p>

              {/* What actually changes here — the point of the screen. */}
              <details open={isCurrent} className="flex flex-col gap-2">
                <summary className="label-xs cursor-pointer select-none">
                  What changes in this phase
                </summary>
                <ul className="mt-3 flex flex-col gap-2">
                  {p.phase.changes.map((c) => (
                    <li key={c} className="flex gap-2.5">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${
                          isCurrent ? "bg-crimson" : "bg-cobalt"
                        }`}
                      />
                      <span className="text-sm leading-relaxed text-ink">{c}</span>
                    </li>
                  ))}
                </ul>
              </details>

              {unlocks.length > 0 ? (
                <div className="flex flex-col gap-1.5 border-t border-edge pt-3">
                  <p className="label-xs">
                    {p.status === "ahead" ? "New movements unlocked here" : "New movements in this phase"}
                  </p>
                  <p className="text-xs leading-relaxed text-muted">{unlocks.join(" · ")}</p>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <TensionLine accent />

      {/* ── Checkpoints ── */}
      <section className="flex flex-col gap-3">
        <p className="label-xs">Checkpoints</p>
        {j.checkpoints.map((c) => (
          <article
            key={c.checkpoint.month}
            className={`flex flex-col gap-3 p-4 ${c.reached ? "panel" : "panel opacity-75"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="display text-lg text-ink">Month {c.checkpoint.month}</span>
                <span className="label-xs">{formatShort(c.date)}</span>
              </div>
              {c.reached ? (
                c.weightMet === true ? (
                  <span className="border border-cobalt px-2 py-1 text-[0.6rem] uppercase tracking-widest text-cobalt-lift">
                    On target
                  </span>
                ) : (
                  <span className="border border-crimson-dim px-2 py-1 text-[0.6rem] uppercase tracking-widest text-crimson">
                    Behind
                  </span>
                )
              ) : (
                <span className="label-xs">Ahead</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Fact
                value={`${c.weightTarget} kg`}
                label="Weight target"
              />
              <Fact
                value={c.weightActual === null ? "—" : `${c.weightActual} kg`}
                label="Actual"
                accent={c.weightMet === true}
              />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(c.checkpoint.targets).map(([k, t]) => (
                <span key={k} className="flex items-baseline gap-1.5">
                  <span className="numeral text-sm text-ink tabular">{t.label}</span>
                  <span className="label-xs">{k.replace(/([A-Z])/g, " $1")}</span>
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <p className="label-xs">Abilities</p>
              <p className="text-xs leading-relaxed text-muted">
                {c.checkpoint.abilities.map((a) => a.label).join(" · ")}
              </p>
            </div>
          </article>
        ))}
      </section>

      <Link href="/progress" className="panel flex items-center justify-between p-4">
        <span className="flex flex-col gap-1">
          <span className="display text-sm text-ink">Full record</span>
          <span className="label-xs">Level, disciplines, challenges, achievements</span>
        </span>
        <span className="text-crimson">&rarr;</span>
      </Link>

      <BottomNav />
    </main>
  );
}

function Tot({
  value,
  label,
  accent,
  bordered,
  decimals = 0,
}: {
  value: number;
  label: string;
  accent?: boolean;
  bordered?: boolean;
  decimals?: number;
}) {
  return (
    <div className={`flex flex-col gap-1 p-2.5 ${bordered ? "border-l border-edge" : ""}`}>
      <CountUp
        value={value}
        decimals={decimals}
        className={`numeral text-xl ${accent && value > 0 ? "text-crimson" : "text-ink"}`}
      />
      <span className="label-xs leading-tight">{label}</span>
    </div>
  );
}

function Fact({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className={`numeral text-lg tabular ${accent ? "text-crimson" : "text-ink"}`}>{value}</span>
      <span className="label-xs leading-tight">{label}</span>
    </span>
  );
}
