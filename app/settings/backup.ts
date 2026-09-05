"use server";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { isAuthed } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import {
  BACKUP_DIR,
  KEEP_BACKUPS,
  createBackup,
  listBackups,
  restoreBackup,
  restoreFrom,
  type BackupInfo,
} from "@/lib/backup";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not authorised.");
}

const PAGES = ["/", "/patrol", "/fuel", "/vitals", "/journey", "/progress", "/settings", "/baseline", "/suit-check"];

export async function backupState(): Promise<{
  backups: BackupInfo[];
  keep: number;
  dir: string;
  disabled: boolean;
}> {
  await guard();
  return {
    backups: listBackups(),
    keep: KEEP_BACKUPS,
    dir: BACKUP_DIR,
    disabled: process.env.BACKUP_DISABLED === "1" || KEEP_BACKUPS <= 0,
  };
}

/**
 * Writes today's backup on demand. If one already exists it is replaced —
 * pressing the button and being told "already done" would be useless when the
 * reason for pressing it is that you are about to change something.
 */
export async function backupNow() {
  await guard();
  const date = todayISO();

  fs.rmSync(path.join(BACKUP_DIR, date), { recursive: true, force: true });
  const res = createBackup(date);
  revalidatePath("/settings");
  return res;
}

/**
 * Restore is destructive and unattended-proof: it replaces every row in the
 * database and every file on the image volume with the backup's. Guarded by the
 * same typed confirmation as the reset panel, for the same reason.
 */
export async function restore(date: string, confirmation: string) {
  await guard();
  if (confirmation !== "RESTORE") {
    return { ok: false as const, error: "Confirmation text did not match." };
  }
  const res = restoreBackup(date);
  if (res.ok) for (const p of PAGES) revalidatePath(p);
  return res;
}

/**
 * Imports a database file from outside the rolling set — a copy pulled off an
 * old machine, or one downloaded from this screen. Written to a temp file first
 * so the opener can migrate and integrity-check it before anything is touched.
 *
 * Images are not part of an imported file; the caller is told so rather than
 * having the volume silently emptied.
 */
export async function importDatabase(base64: string, confirmation: string) {
  await guard();
  if (confirmation !== "RESTORE") {
    return { ok: false as const, error: "Confirmation text did not match." };
  }

  const buf = Buffer.from(base64, "base64");
  // SQLite files start with this, and a wrong file is the likeliest mistake
  // here — refusing early beats a confusing error from deep inside the opener.
  if (buf.length < 16 || buf.subarray(0, 15).toString("latin1") !== "SQLite format 3") {
    return { ok: false as const, error: "That is not a SQLite database file." };
  }

  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "arachne-import-")), "import.db");
  try {
    fs.writeFileSync(tmp, buf);
    const res = restoreFrom(tmp, null);
    if (res.ok) for (const p of PAGES) revalidatePath(p);
    return res;
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}
