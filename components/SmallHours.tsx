import { DAY_START_HOUR, formatShort, inSmallHours, todayISO } from "@/lib/dates";

/**
 * The line that stops a late night looking like a broken app.
 *
 * Between midnight and the day's turnover the app is deliberately still on
 * yesterday: the water, the food and the chores you are logging at half past
 * midnight belong to the day you have not finished yet. That is the whole point
 * of moving the boundary, and it is also the one moment the screen disagrees
 * with the clock in your other hand — so it says so, once, and only then.
 *
 * Rendered by server components on a `force-dynamic` page, so it reads the same
 * clock `todayISO()` does and cannot drift from the dates around it.
 */
export function SmallHours({ className = "" }: { className?: string }) {
  if (!inSmallHours()) return null;

  return (
    <p className={`label-xs text-muted-dim ${className}`}>
      Still {formatShort(todayISO())} — the day turns over at {DAY_START_HOUR}:00
    </p>
  );
}
