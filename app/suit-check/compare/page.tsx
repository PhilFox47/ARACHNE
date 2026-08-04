import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { formatShort, weekStartDate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { SuitCompare, type WeekSet } from "@/components/SuitCompare";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function Compare() {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  const s = getSettings();
  const rows = db.select().from(photos).orderBy(asc(photos.weekIndex)).all();

  const byWeek = new Map<number, WeekSet>();
  for (const p of rows) {
    const existing = byWeek.get(p.weekIndex) ?? {
      weekIndex: p.weekIndex,
      label: `Week ${p.weekIndex + 1} · ${formatShort(weekStartDate(s.startDate, p.weekIndex))}`,
      byAngle: {},
    };
    existing.byAngle[p.angle] = p.path;
    byWeek.set(p.weekIndex, existing);
  }

  const weeks = [...byWeek.values()].sort((a, b) => a.weekIndex - b.weekIndex);

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/suit-check" className="label-xs">
            ‹ SUIT CHECK
          </Link>
          <h1 className="display text-2xl text-ink">COMPARE</h1>
        </div>
        <span className="label-xs tabular">{weeks.length} weeks</span>
      </header>

      {weeks.length < 2 ? (
        <section className="panel p-4">
          <p className="text-sm text-muted">
            Two weeks of photos are needed before there is anything to compare. You have {weeks.length}.
          </p>
        </section>
      ) : (
        <>
          <SuitCompare weeks={weeks} />
          <p className="px-1 text-xs leading-relaxed text-muted-dim">
            Drag the divider, or use the arrow keys. Between months 4 and 8 the scale barely moves while the
            shape does — this is the screen that shows it.
          </p>
        </>
      )}

      <BottomNav />
    </main>
  );
}
