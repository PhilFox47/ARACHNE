import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { loadGameState } from "@/lib/gameData";
import { getHqStats } from "@/lib/stats";
import { rankForScore } from "@/lib/plan";
import { LevelBar, StreakStrip } from "@/components/LevelBar";
import { ChallengeList } from "@/components/Challenges";
import { DisciplineRadar } from "@/components/DisciplineRadar";
import { TensionLine } from "@/components/TensionLine";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function Progress() {
  if (!(await isAuthed())) redirect("/login");

  const game = loadGameState();
  const stats = getHqStats();
  const rank = rankForScore(null); // No trials until Phase 4.

  const unlocked = game.achievements.filter((a) => a.unlocked);
  const locked = game.achievements.filter((a) => !a.unlocked);

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-baseline justify-between">
        <h1 className="display text-2xl text-ink">RECORD</h1>
        <Link href="/" className="label-xs">
          HQ
        </Link>
      </header>

      <div className="swing">
        <LevelBar game={game} href="#ledger" />
      </div>

      <StreakStrip game={game} />

      {/* Two axes, side by side, so the difference is legible. */}
      <section className="panel flex flex-col gap-3 p-4">
        <p className="label-xs">Two measures</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <p className="numeral text-3xl text-ink">{game.level}</p>
            <p className="label-xs">Level · effort</p>
            <p className="text-xs text-muted-dim">Moves every day you turn up.</p>
          </div>
          <div className="flex flex-col gap-1 border-l border-edge pl-4">
            <p className="numeral text-3xl text-muted-dim">—</p>
            <p className="label-xs">Score · capability</p>
            <p className="text-xs text-muted-dim">Moves at THE TRIAL. Rank: {rank.name}.</p>
          </div>
        </div>
      </section>

      <ChallengeList challenges={game.challenges} scope="weekly" title="This week" />
      <ChallengeList challenges={game.challenges} scope="monthly" title="This month" />

      <section className="flex flex-col gap-2">
        <p className="label-xs">Disciplines</p>
        <div className="panel p-4">
          <DisciplineRadar disciplines={game.disciplines} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="label-xs">Achievements</p>
          <p className="label-xs tabular">
            {unlocked.length} / {game.achievements.length}
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-edge border border-edge">
          {[...unlocked, ...locked].map((a) => (
            <li key={a.key} className="flex flex-col gap-1.5 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className={`display text-sm ${a.unlocked ? "text-crimson" : "text-muted-dim"}`}>
                    {a.name}
                  </span>
                  {/* The value is stated up front — a first-step marker and a
                      year-long grind are both achievements, and it should be
                      obvious which one you just cleared. */}
                  <span
                    className={`shrink-0 text-[0.5rem] uppercase tracking-widest ${
                      a.tier === "major"
                        ? "text-crimson"
                        : a.tier === "milestone"
                          ? "text-cobalt-lift"
                          : "text-muted-dim"
                    }`}
                  >
                    {a.xp} XP
                  </span>
                </span>
                {a.progress && !a.unlocked ? (
                  <span className="label-xs tabular">
                    {a.progress.current}/{a.progress.target}
                  </span>
                ) : a.unlocked ? (
                  <span className="label-xs text-cobalt-lift">Unlocked</span>
                ) : null}
              </div>
              <p className={`text-xs ${a.unlocked ? "text-muted" : "text-muted-dim"}`}>{a.description}</p>
              {a.progress && !a.unlocked ? (
                <div className="relative h-0.5 w-full bg-panel-2">
                  <div
                    className="absolute inset-y-0 left-0 bg-cobalt"
                    style={{ width: `${Math.round((a.progress.current / a.progress.target) * 100)}%` }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section id="ledger" className="flex flex-col gap-2">
        <p className="label-xs">Where the XP came from</p>
        <ul className="panel divide-y divide-edge">
          {game.ledger.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between px-4 py-2.5">
              <span className="text-sm text-muted">{r.label}</span>
              <span className={`numeral text-base tabular ${r.xp < 0 ? "text-crimson" : "text-ink"}`}>
                {r.xp > 0 ? "+" : ""}
                {r.xp.toLocaleString("en-GB")}
              </span>
            </li>
          ))}
          <li className="flex items-baseline justify-between bg-panel-2 px-4 py-3">
            <span className="label-xs">Total</span>
            <span className="numeral text-xl text-cobalt-lift tabular">
              {game.xp.toLocaleString("en-GB")}
            </span>
          </li>
        </ul>
        {game.quietDays > 0 ? (
          <p className="text-xs text-muted-dim">
            {game.quietDays} quiet day{game.quietDays === 1 ? "" : "s"} beyond the {3}-day grace period. Nothing
            logged, nothing trained.
          </p>
        ) : null}
      </section>

      <TensionLine />

      <p className="px-1 text-xs leading-relaxed text-muted-dim">
        Day {stats.day} of {stats.totalDays}. Every number here is derived from the database when the page loads —
        there is no stored XP to drift out of sync, so changing a rule retroactively fixes history too.
      </p>

      <BottomNav />
    </main>
  );
}
