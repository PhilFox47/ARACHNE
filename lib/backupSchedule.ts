/**
 * The thing that makes the backups daily.
 *
 * An hourly tick that asks "is there a backup for today yet?" rather than a
 * timer set for midnight. Same result on a machine that stays up, and a much
 * better one on a machine that doesn't: a container restarted at 23:58 loses
 * nothing, and one that was off for a week takes its backup within the hour of
 * coming back rather than waiting for the next midnight it happens to see.
 *
 * The check is idempotent — creating a backup claims the day's directory, and a
 * second attempt is refused — so running it too often costs a `stat`.
 */

import { KEEP_BACKUPS, ensureTodaysBackup } from "./backup";

const HOUR_MS = 60 * 60 * 1000;

/** Long enough to stay out of the way of the first requests after a boot. */
const FIRST_CHECK_MS = 20_000;

let started = false;

export function startBackupSchedule(): void {
  if (started) return;
  if (process.env.BACKUP_DISABLED === "1" || KEEP_BACKUPS <= 0) return;
  started = true;

  const tick = () => {
    try {
      const res = ensureTodaysBackup();
      if (res === null) return;
      if (res.ok) {
        const linked = res.linked > 0 ? `, ${res.linked} images linked` : "";
        const pruned = res.pruned.length > 0 ? `, pruned ${res.pruned.join(", ")}` : "";
        console.log(`[backup] wrote ${res.info.date} (${kb(res.info.dbBytes)}${linked})${pruned}`);
      } else {
        console.error(`[backup] ${res.error}`);
      }
    } catch (err) {
      // A failed backup must never take the server down with it.
      console.error("[backup] check failed:", err);
    }
  };

  // `unref` on both, so the backup schedule is never the reason a process
  // refuses to exit. The HTTP server is what keeps it alive.
  setTimeout(tick, FIRST_CHECK_MS).unref();
  setInterval(tick, HOUR_MS).unref();
}

const kb = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
