import Link from "next/link";
import { ChoreList } from "./ChoreList";
import type { ChoreStanding, Malus } from "@/lib/chores";

/**
 * MAINTENANCE on HQ, sized by how much is left.
 *
 * HQ already carries eight sections, so this one has to earn its place: the
 * outstanding chores are tappable right here because that is a several-times-a-
 * day interaction and it should never cost a navigation, and the moment the
 * list is clear it collapses to a single line. A card that stays large after
 * the work is done is a card that pushes the rest of the screen off the phone.
 */
export function MaintenanceCard({
  daily,
  weekly,
  malus,
  date,
}: {
  daily: ChoreStanding[];
  weekly: ChoreStanding[];
  malus: Malus;
  date: string;
}) {
  const outstanding = daily.filter((s) => !s.done);
  const weeklyLeft = weekly.filter((s) => !s.done);
  const total = daily.length + weekly.length;
  if (total === 0) return null;

  const allClear = outstanding.length === 0 && weeklyLeft.length === 0;

  return (
    <section className="swing flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <p className="label-xs">Maintenance</p>
        <Link href="/maintenance" className="label-xs text-cobalt-lift underline">
          All of it
        </Link>
      </div>

      {allClear ? (
        <div className="panel flex items-center gap-2.5 px-3.5 py-3">
          <span aria-hidden className="text-cobalt-lift">✓</span>
          <p className="text-sm text-muted">
            Everything done — today and this week. No malus tomorrow.
          </p>
        </div>
      ) : (
        <div className="panel flex flex-col px-3.5">
          {outstanding.length > 0 ? <ChoreList items={outstanding} date={date} /> : null}
          {weeklyLeft.length > 0 ? (
            <div className={outstanding.length > 0 ? "border-t border-edge pt-1" : ""}>
              <p className="label-xs pt-2">This week</p>
              <ChoreList items={weeklyLeft} date={date} />
            </div>
          ) : null}
        </div>
      )}

      {malus.fraction > 0 ? (
        <p className="text-xs leading-relaxed text-crimson">
          −{Math.round(malus.fraction * 100)}% XP today from{" "}
          {[
            malus.missedDaily.length > 0 ? `${malus.missedDaily.length} missed yesterday` : null,
            malus.missedWeekly.length > 0 ? `${malus.missedWeekly.length} missed last week` : null,
          ]
            .filter(Boolean)
            .join(" and ")}
          . Clearing today&rsquo;s list lifts it tomorrow.
        </p>
      ) : null}
    </section>
  );
}
