import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { buildSeries, getHqStats, loadWeights } from "@/lib/stats";
import { computeInsights } from "@/lib/sense";
import { getSettings, ensureStartDate } from "@/lib/settings";
import { loadGameState } from "@/lib/gameData";
import { todayISO } from "@/lib/dates";
import { Mark } from "@/components/Mark";
import { CountUp } from "@/components/CountUp";
import { WeightChart } from "@/components/WeightChart";
import { WeightEntry } from "@/components/WeightEntry";
import { TensionLine } from "@/components/TensionLine";
import { BottomNav } from "@/components/BottomNav";
import { LevelBar, StreakStrip } from "@/components/LevelBar";
import { ChallengeList } from "@/components/Challenges";
import { PHASES } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function HQ() {
  if (!(await isAuthed())) redirect("/login");

  ensureStartDate();
  const settings = getSettings();
  const rows = loadWeights();
  const stats = getHqStats();
  const series = buildSeries(rows, settings.startDate);
  const insights = computeInsights(stats, rows);
  const game = loadGameState();

  // The label names the metric; colour carries the corridor state. Labelling it
  // "In corridor" put a state word directly under a signed delta, which read as
  // though the number itself were measured in corridors.
  const corridorState =
    stats.corridorState === "inside"
      ? "inside the corridor"
      : stats.corridorState === "above"
        ? "above the corridor"
        : stats.corridorState === "below"
          ? "below the corridor"
          : "no reading yet";

  const corridorColor =
    stats.corridorState === "above"
      ? "text-crimson"
      : stats.corridorState === "below"
        ? "text-cobalt-lift"
        : "text-ink";

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      {/* ── Bar ── */}
      <header className="pad-safe-t flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Mark size={26} />
          <span className="display text-lg tracking-[0.14em] text-ink">ARACHNE</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="label-xs tabular">
            Day {stats.day} / {stats.totalDays}
          </span>
          <Link href="/settings" aria-label="Settings" className="tap flex items-center justify-center">
            <svg viewBox="0 0 100 100" width="17" height="17" fill="none" stroke="#8A92A6" strokeWidth="7" strokeLinecap="round" aria-hidden="true">
              <circle cx="50" cy="50" r="14" />
              <path d="M50 12 V26 M50 74 V88 M12 50 H26 M74 50 H88 M23 23 L33 33 M67 67 L77 77 M77 23 L67 33 M33 67 L23 77" />
            </svg>
          </Link>
        </div>
      </header>

      {/* ── Hero: the number that matters ── */}
      <section className="swing panel halftone flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="label-xs">7-day average</p>
            <CountUp
              value={stats.avg7}
              decimals={1}
              suffix="KG"
              className="numeral text-[4.5rem] text-ink"
            />
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1 border border-crimson-dim px-2.5 py-1.5 text-right">
            <span className="label-xs text-crimson">Phase {stats.phase.id}</span>
            <span className="display text-sm text-ink">{stats.phase.codename}</span>
            <span className="label-xs tabular">
              {stats.kcalTarget.toLocaleString("en-GB")} kcal
              {stats.inTaper ? " · taper" : ""}
            </span>
          </div>
        </div>

        <TensionLine accent={stats.corridorState === "above"} />

        <div className="grid grid-cols-3 border border-edge">
          <Stat
            label="From start"
            value={
              <CountUp
                value={stats.deltaFromStart}
                decimals={1}
                signed
                className={`numeral text-2xl ${
                  stats.deltaFromStart !== null && stats.deltaFromStart < 0 ? "text-crimson" : "text-ink"
                }`}
              />
            }
          />
          <Stat
            label="Vs target"
            title={`${stats.corridorDelta ?? 0} kg versus target — ${corridorState}`}
            value={
              <CountUp
                value={stats.corridorDelta}
                decimals={1}
                signed
                className={`numeral text-2xl ${corridorColor}`}
              />
            }
            bordered
          />
          <Stat
            label="Target"
            value={<span className="numeral text-2xl text-ink tabular">{stats.corridorTarget.toFixed(1)}</span>}
            bordered
          />
        </div>
      </section>

      {/* ── Phase 0 takes over the top slot: it's the only job for 14 days ── */}
      {stats.phase.id === 0 ? (
        <Link href="/baseline" className="swing panel-hot flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="label-xs text-crimson">Baseline · Phase 0</span>
            <span className="label-xs tabular">
              {Math.max(0, PHASES[0].endDay - stats.day + 1)} days left
            </span>
          </div>
          <span className="display text-lg text-ink">Find your starting point</span>
          <span className="text-sm leading-relaxed text-muted">
            Measurements, the six-test fitness baseline, and two weeks of honest tracking. Train at the
            bottom of every range and stop short — this fortnight is measurement, not progress.
          </span>
          <span className="label-xs text-crimson">Open baseline &rarr;</span>
        </Link>
      ) : null}

      {/* ── Progression ── */}
      <div className="swing flex flex-col gap-3" style={{ animationDelay: "50ms" }}>
        <LevelBar game={game} />
        <StreakStrip game={game} />
      </div>

      {/* ── Primary action ── */}
      <div className="swing" style={{ animationDelay: "60ms" }}>
        <WeightEntry
          initial={stats.latest?.weightKg ?? settings.startWeightKg}
          loggedToday={stats.loggedToday}
          today={todayISO()}
        />
      </div>

      {/* ── Chart ── */}
      <section className="swing panel flex flex-col gap-3 p-4" style={{ animationDelay: "120ms" }}>
        <div className="flex items-baseline justify-between">
          <p className="label-xs">Corridor</p>
          <p className="label-xs">
            {stats.startWeightKg} &rarr; {stats.targetWeightKg} kg
          </p>
        </div>
        <WeightChart points={series} />
      </section>

      {/* ── SENSE ── */}
      <section className="swing flex flex-col gap-2" style={{ animationDelay: "180ms" }}>
        <p className="label-xs">SENSE</p>
        {insights.length === 0 ? (
          <div className="panel p-4">
            <p className="text-sm text-muted">Nothing worth flagging.</p>
          </div>
        ) : (
          insights.map((i) => (
            <div
              key={i.key}
              className={`panel border-l-2 p-3.5 ${
                i.tone === "warn"
                  ? "border-l-crimson"
                  : i.tone === "good"
                    ? "border-l-cobalt"
                    : "border-l-muted-dim"
              }`}
            >
              <p className="text-sm leading-relaxed text-ink">{i.text}</p>
            </div>
          ))
        )}
      </section>

      {/* ── Challenges ── */}
      <div className="swing" style={{ animationDelay: "220ms" }}>
        <ChallengeList challenges={game.challenges} scope="weekly" title="This week" />
      </div>

      <Link href="/progress" className="panel flex items-center justify-between p-4">
        <span className="flex flex-col gap-1">
          <span className="display text-sm text-ink">Full record</span>
          <span className="label-xs">
            {game.unlockedAchievements} achievements · monthly challenges · disciplines
          </span>
        </span>
        <span className="text-crimson">&rarr;</span>
      </Link>

      <p className="px-1 text-xs leading-relaxed text-muted-dim">{stats.phase.brief}</p>

      <BottomNav />
    </main>
  );
}

function Stat({
  label,
  value,
  bordered,
  title,
}: {
  label: string;
  value: React.ReactNode;
  bordered?: boolean;
  title?: string;
}) {
  return (
    <div
      title={title}
      aria-label={title}
      className={`flex flex-col gap-1.5 p-2.5 ${bordered ? "border-l border-edge" : ""}`}
    >
      {value}
      <span className="label-xs leading-tight">{label}</span>
    </div>
  );
}
