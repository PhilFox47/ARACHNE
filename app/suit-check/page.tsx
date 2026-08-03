import { redirect } from "next/navigation";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { isAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { addDays, formatShort, todayISO, weekIndex } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { PHOTO_ANGLES } from "@/lib/plan";
import { SuitCheckCapture } from "@/components/SuitCheckCapture";
import { TensionLine } from "@/components/TensionLine";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function SuitCheck({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  if (!(await isAuthed())) redirect("/login");

  const s = getSettings();
  const today = todayISO();
  const currentWeek = weekIndex(s.startDate, today);

  const params = await searchParams;
  const requested = Number(params.week);
  const week = Number.isInteger(requested) ? Math.max(0, Math.min(requested, currentWeek)) : currentWeek;

  const all = db.select().from(photos).orderBy(desc(photos.weekIndex)).all();
  const thisWeek = all.filter((p) => p.weekIndex === week);

  // Group into complete-ish sets for the history strip.
  const byWeek = new Map<number, typeof all>();
  for (const p of all) {
    const list = byWeek.get(p.weekIndex) ?? [];
    list.push(p);
    byWeek.set(p.weekIndex, list);
  }
  const history = [...byWeek.entries()].sort((a, b) => b[0] - a[0]);
  const completeWeeks = history.filter(([, list]) => list.length >= PHOTO_ANGLES.length).length;

  const weekStart = addDays(s.startDate, week * 7);
  const done = thisWeek.length;

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/vitals" className="label-xs">
            ‹ VITALS
          </Link>
          <h1 className="display text-2xl text-ink">SUIT CHECK</h1>
        </div>
        <span className="label-xs tabular">{completeWeeks} full sets</span>
      </header>

      {/* ── Week selector ── */}
      <nav className="flex items-stretch gap-2">
        <Link
          href={`/suit-check?week=${Math.max(0, week - 1)}`}
          aria-disabled={week === 0}
          className={`tap panel flex items-center justify-center px-4 text-lg ${
            week === 0 ? "pointer-events-none opacity-30" : "text-muted active:text-crimson"
          }`}
        >
          ‹
        </Link>
        <div className="panel flex flex-1 flex-col items-center justify-center gap-0.5 py-2">
          <span className="display text-lg text-ink">Week {week + 1}</span>
          <span className="label-xs">
            {formatShort(weekStart)} – {formatShort(addDays(weekStart, 6))}
          </span>
        </div>
        <Link
          href={`/suit-check?week=${Math.min(currentWeek, week + 1)}`}
          aria-disabled={week === currentWeek}
          className={`tap panel flex items-center justify-center px-4 text-lg ${
            week === currentWeek ? "pointer-events-none opacity-30" : "text-muted active:text-crimson"
          }`}
        >
          ›
        </Link>
      </nav>

      <section className="swing panel flex flex-col gap-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="label-xs">{week === currentWeek ? "This week" : "That week"}</p>
          <p className={`label-xs tabular ${done >= 4 ? "text-cobalt-lift" : "text-crimson"}`}>
            {done} / {PHOTO_ANGLES.length} angles
          </p>
        </div>
        <SuitCheckCapture shots={thisWeek} weekIndex={week} />
      </section>

      {completeWeeks >= 2 ? (
        <Link href="/suit-check/compare" className="panel-hot flex items-center justify-between p-4">
          <span className="flex flex-col gap-1">
            <span className="display text-sm text-ink">Compare two weeks</span>
            <span className="label-xs">Drag the divider. This is the part that actually convinces you.</span>
          </span>
          <span className="text-crimson">&rarr;</span>
        </Link>
      ) : (
        <div className="panel p-4">
          <p className="text-sm text-muted">
            Comparison unlocks at two complete sets. You have {completeWeeks}.
          </p>
        </div>
      )}

      <TensionLine />

      {/* ── History ── */}
      <section className="flex flex-col gap-2">
        <p className="label-xs">History</p>
        {history.length === 0 ? (
          <div className="panel p-4">
            <p className="text-sm text-muted">No suit checks on record.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map(([wk, list]) => (
              <li key={wk}>
                <Link
                  href={`/suit-check?week=${wk}`}
                  className={`panel flex items-center gap-3 p-2.5 ${wk === week ? "border-crimson-dim" : ""}`}
                >
                  <span className="flex shrink-0 flex-col items-center justify-center border border-edge px-2 py-1">
                    <span className="display text-xs text-muted">WK</span>
                    <span className="numeral text-base text-ink tabular">{wk + 1}</span>
                  </span>
                  <span className="flex flex-1 gap-1.5">
                    {PHOTO_ANGLES.map((a) => {
                      const shot = list.find((p) => p.angle === a.key);
                      return shot ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={a.key}
                          src={`/api/photo/${shot.path}`}
                          alt={a.label}
                          loading="lazy"
                          className="h-14 w-11 border border-edge object-cover"
                        />
                      ) : (
                        <span
                          key={a.key}
                          className="h-14 w-11 border border-dashed border-edge bg-panel-2"
                          aria-label={`${a.label} missing`}
                        />
                      );
                    })}
                  </span>
                  <span className={`label-xs shrink-0 ${list.length >= 4 ? "text-cobalt-lift" : "text-muted-dim"}`}>
                    {list.length}/4
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
