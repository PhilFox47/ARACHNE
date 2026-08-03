import Link from "next/link";
import type { GameState } from "@/lib/game";
import { CountUp } from "./CountUp";

/**
 * Level and XP. Sits next to the ARACHNE Score rather than replacing it: the
 * score says how capable you are and only moves at THE TRIAL, this says how
 * much work you've put in and moves every day.
 */
export function LevelBar({ game, href = "/progress" }: { game: GameState; href?: string }) {
  const pct = Math.round(game.levelProgress * 100);
  const toNext = Math.max(0, game.nextLevelXp - game.xp);

  return (
    <Link href={href} className="panel halftone flex flex-col gap-3 p-4">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="label-xs">LVL</span>
          <CountUp value={game.level} decimals={0} className="numeral text-5xl text-ink" />
          <span className="display text-sm text-crimson">{game.title}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="numeral text-lg text-cobalt-lift tabular">{game.xp.toLocaleString("en-GB")}</span>
          <span className="label-xs">XP</span>
        </div>
      </div>

      {/* Progress drawn as a tensioned line rather than a rounded pill. */}
      <div className="relative h-2 w-full border border-edge bg-panel-2">
        <div
          className="absolute inset-y-0 left-0 bg-crimson transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-y-0 right-0 w-px bg-edge" />
      </div>

      <div className="flex items-center justify-between">
        <span className="label-xs">{toNext.toLocaleString("en-GB")} XP to level {game.level + 1}</span>
        <span className="label-xs tabular">{pct}%</span>
      </div>
    </Link>
  );
}

export function StreakStrip({ game }: { game: GameState }) {
  return (
    <div className="grid grid-cols-3 border border-edge">
      <Cell value={game.patrolStreak} label="Patrol streak" accent />
      <Cell value={game.logStreak} label="Log streak" bordered />
      <Cell value={game.unlockedAchievements} label="Unlocked" bordered />
    </div>
  );
}

function Cell({
  value,
  label,
  accent,
  bordered,
}: {
  value: number;
  label: string;
  accent?: boolean;
  bordered?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 p-2.5 ${bordered ? "border-l border-edge" : ""}`}>
      <CountUp
        value={value}
        decimals={0}
        className={`numeral text-2xl ${accent && value > 0 ? "text-crimson" : "text-ink"}`}
      />
      <span className="label-xs leading-tight">{label}</span>
    </div>
  );
}
