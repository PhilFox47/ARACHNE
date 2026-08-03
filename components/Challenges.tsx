import type { Challenge } from "@/lib/game";

/**
 * Challenges are generated from a seed derived from the period key, so the set
 * is identical every time you open the app within a week and different the
 * next. Nothing rerolls on refresh — a challenge you can reroll isn't one.
 */
export function ChallengeList({
  challenges,
  scope,
  title,
}: {
  challenges: Challenge[];
  scope: "weekly" | "monthly";
  title: string;
}) {
  const list = challenges.filter((c) => c.scope === scope);
  if (list.length === 0) return null;

  const done = list.filter((c) => c.done).length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <p className="label-xs">{title}</p>
        <p className="label-xs tabular">
          {done} / {list.length}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.id}>
            <ChallengeCard challenge={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChallengeCard({ challenge: c }: { challenge: Challenge }) {
  const pct = c.target > 0 ? Math.min(100, Math.round((c.current / c.target) * 100)) : 0;

  return (
    <div className={`flex flex-col gap-2.5 p-3.5 ${c.done ? "panel-hot" : "panel"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={`display text-sm ${c.done ? "text-crimson" : "text-ink"}`}>{c.title}</p>
          <p className="text-xs leading-relaxed text-muted">{c.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className={`numeral text-xl tabular ${c.done ? "text-crimson" : "text-ink"}`}>
            {c.current}
            <span className="text-muted-dim">/{c.target}</span>
          </span>
          <span className="label-xs">+{c.reward} XP</span>
        </div>
      </div>

      <div className="relative h-1 w-full bg-panel-2">
        <div
          className={`absolute inset-y-0 left-0 ${c.done ? "bg-crimson" : "bg-cobalt"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
