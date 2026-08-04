"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { backupNow, backupState, importDatabase, restore } from "@/app/settings/backup";
import type { BackupInfo } from "@/lib/backup";

type State = Awaited<ReturnType<typeof backupState>>;

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

const when = (unix: number) =>
  new Date(unix * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const ROWS = ["weights", "sessions", "exercise_logs", "food_entries", "photos"] as const;

function total(b: BackupInfo): number {
  return ROWS.reduce((n, t) => n + (b.counts[t] ?? 0), 0);
}

/**
 * The backups, and the two ways back in.
 *
 * Restoring is as destructive as the reset panel and asks for the same kind of
 * deliberate effort — pick a date, read what it holds, type RESTORE. There is no
 * undo, because the thing it overwrites is the only copy that isn't in this
 * list.
 */
export function BackupPanel() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<{ name: string; base64: string } | null>(null);

  const load = () => start(async () => setState(await backupState()));
  useEffect(load, []);

  const armed = confirmText === "RESTORE";

  const runRestore = () => {
    if (!target) return;
    setError(null);
    start(async () => {
      const res = await restore(target, confirmText);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote(`Restored ${res.rows.toLocaleString("en-GB")} rows and ${res.images} images from ${target}.`);
      setTarget(null);
      setConfirmText("");
      if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
      router.refresh();
    });
  };

  const runImport = () => {
    if (!importing) return;
    setError(null);
    start(async () => {
      const res = await importDatabase(importing.base64, confirmText);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote(
        `Imported ${res.rows.toLocaleString("en-GB")} rows from ${importing.name}. Images aren't part of a database file — the ones already on this machine were left alone.`,
      );
      setImporting(null);
      setConfirmText("");
      if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
      router.refresh();
    });
  };

  const onFile = async (file: File) => {
    setError(null);
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    // Chunked: spreading a multi-megabyte array into String.fromCharCode blows
    // the argument limit.
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    setImporting({ name: file.name, base64: btoa(binary) });
    setConfirmText("");
  };

  if (!state) {
    return (
      <div className="panel p-4">
        <p className="label-xs">Backups</p>
        <p className="mt-1 text-sm text-muted">Reading…</p>
      </div>
    );
  }

  const latest = state.backups[0] ?? null;

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-xs">Backups</p>
        <p className="label-xs tabular">
          {state.backups.length} / {state.keep}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        One a day, {state.keep} kept — writing one more drops the oldest. Each holds the whole database
        and every image, in <code className="text-cobalt-lift">{state.dir}</code>.
        {state.disabled ? " Automatic backups are switched off." : ""}
      </p>

      {latest ? (
        <p className="label-xs">
          Latest {latest.date} · {when(latest.createdAt)} · {size(latest.dbBytes)} ·{" "}
          {latest.imageCount} images
        </p>
      ) : (
        <p className="label-xs text-crimson">Nothing backed up yet.</p>
      )}

      {note ? <p className="text-sm text-cobalt-lift">{note}</p> : null}
      {error ? <p className="text-sm text-crimson">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await backupNow();
              setNote(res.ok ? `Backed up ${res.info.date}.` : null);
              setError(res.ok ? null : res.error);
              setState(await backupState());
              router.refresh();
            })
          }
          className="tap display flex-1 border border-cobalt px-4 py-2.5 text-xs tracking-widest text-cobalt-lift disabled:opacity-40"
        >
          {pending ? "Working" : "Back up now"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setTarget(null);
            setImporting(null);
          }}
          className="tap display border border-edge px-4 text-xs tracking-widest text-muted"
        >
          {open ? "Hide" : "Restore"}
        </button>
      </div>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-edge pt-4">
          {state.backups.length === 0 ? (
            <p className="text-sm text-muted">No backups to restore from yet.</p>
          ) : (
            <ul className="divide-y divide-edge border border-edge">
              {state.backups.map((b) => (
                <li key={b.date} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm text-ink tabular">{b.date}</span>
                    <span className="label-xs">
                      {size(b.dbBytes)} · {total(b).toLocaleString("en-GB")} rows · {b.imageCount} images
                      {b.partial ? " · manifest missing" : ""}
                    </span>
                  </span>
                  <a
                    href={`/api/backup/${b.date}`}
                    download
                    className="label-xs shrink-0 underline"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setTarget(target === b.date ? null : b.date);
                      setImporting(null);
                      setConfirmText("");
                      setError(null);
                    }}
                    className={`label-xs shrink-0 underline ${
                      target === b.date ? "text-crimson" : "text-muted"
                    }`}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ── Import from a file ── */}
          <input
            ref={fileRef}
            type="file"
            accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => {
              setTarget(null);
              fileRef.current?.click();
            }}
            className="tap display border border-edge px-4 py-2.5 text-xs tracking-widest text-muted"
          >
            Import a database file
          </button>
          <p className="text-xs leading-relaxed text-muted-dim">
            Takes any <code>arachne-*.db</code> downloaded from this screen, including one from another
            machine. Older files are migrated forward before anything is written; a file from a newer
            build is refused rather than half-applied.
          </p>

          {target || importing ? (
            <div className="panel-hot flex flex-col gap-3 p-3.5">
              <p className="text-sm leading-relaxed text-ink">
                {target
                  ? `Every reading, session, meal, trial and photo will be replaced by the ${target} backup.`
                  : `Every reading, session, meal and trial will be replaced by ${importing!.name}.`}{" "}
                There is no undo.
              </p>
              <p className="label-xs">Type RESTORE to confirm</p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="Type RESTORE to confirm"
                className="tap border border-edge bg-panel-2 px-3 text-center text-lg tracking-[0.3em] text-ink outline-none focus:border-crimson"
              />
              <button
                type="button"
                disabled={!armed || pending}
                onClick={target ? runRestore : runImport}
                className="tap display w-full border border-crimson bg-crimson px-4 py-3 text-sm tracking-widest text-ink disabled:border-edge disabled:bg-transparent disabled:text-muted-dim"
              >
                {pending ? "Restoring" : armed ? "Overwrite everything" : "Type RESTORE above"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
