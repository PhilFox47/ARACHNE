"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEntry, quickLog } from "@/app/fuel/actions";
import { ANALYSING_PLACEHOLDER } from "@/lib/plan";
import { Favourites, type FavouriteItem } from "./Favourites";
import { WebLoader } from "./WebLoader";

interface QuickItem {
  normKey: string;
  description: string;
  uses: number;
  kcal: number | null;
}

/** Client-side compression to a 1200px max edge before anything is uploaded. */
async function compress(file: File, maxEdge = 1200, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}

export function FuelCapture({
  quickItems,
  favourites,
}: {
  quickItems: QuickItem[];
  favourites: FavouriteItem[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "saving" | "reading">(null);
  const [awaitingNote, setPending2] = useState<{ id: number; preview: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const finish = (msg: string) => {
    setBusy(null);
    setNote(msg);
    router.refresh();
    setTimeout(() => setNote(null), 3200);
  };

  const onPhoto = async (file: File) => {
    setBusy("saving");
    setNote(null);
    if (navigator.vibrate) navigator.vibrate(8);

    let dataUrl: string;
    try {
      dataUrl = await compress(file);
    } catch {
      finish("Couldn't read that image.");
      return;
    }

    // Save first, before anyone types anything. The entry exists before the
    // model is ever called, so a slow analysis — or abandoning the note sheet
    // entirely — can never cost you the log.
    const created = await createEntry({ description: ANALYSING_PLACEHOLDER, photoDataUrl: dataUrl });
    if (!created.ok) {
      finish(created.error);
      return;
    }

    setBusy(null);
    setPending2({ id: created.id, preview: dataUrl });
    router.refresh();
  };

  /**
   * A photo can't show diameter, how much of it you ate, or the oil it was
   * cooked in — and portion inference is where these estimates go wrong. One
   * line of context is worth more than any amount of model tuning.
   */
  const analyse = async (entryId: number, hint: string) => {
    setPending2(null);
    setBusy("reading");
    try {
      const res = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entryId, hint: hint.trim() || undefined }),
      });
      const body = await res.json();
      if (body.analysed) {
        if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
        finish("Logged.");
      } else {
        finish(`Saved without numbers — ${body.error ?? "the model didn't answer"}.`);
      }
    } catch {
      finish("Saved without numbers — the model didn't answer.");
    }
  };

  const onText = () => {
    if (text.trim().length === 0) return;
    start(async () => {
      const res = await createEntry({ description: text.trim() });
      setText("");
      finish(res.ok ? "Logged." : "Couldn't save that.");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPhoto(f);
        }}
      />

      {/* The single biggest thing on the screen, and the first one your thumb
          reaches. If logging feels like work it stops happening. */}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => fileRef.current?.click()}
        className="tap panel-hot flex min-h-[104px] w-full flex-col items-center justify-center gap-2 active:opacity-80 disabled:opacity-60"
      >
        {busy ? (
          <WebLoader size={38} label={busy === "saving" ? "Saving" : "Reading the plate"} />
        ) : (
          <>
            <svg viewBox="0 0 100 100" width="34" height="34" fill="none" stroke="#D42A3F" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="50" cy="55" r="22" />
              <circle cx="50" cy="55" r="9" opacity="0.5" />
              <path d="M30 30 H70" />
            </svg>
            <span className="display text-lg tracking-widest text-ink">Log fuel</span>
            <span className="label-xs">Photo · saves instantly</span>
          </>
        )}
      </button>

      {note ? (
        <p role="status" className="border border-edge bg-panel-2 px-3 py-2 text-center text-xs text-muted">
          {note}
        </p>
      ) : null}

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onText();
          }}
          placeholder="…or just type it"
          aria-label="Describe what you ate"
          className="tap min-w-0 flex-1 border border-edge bg-panel-2 px-3 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
        />
        <button
          type="button"
          disabled={pending || text.trim().length === 0}
          onClick={onText}
          className="tap display border border-edge px-4 text-xs tracking-widest text-muted disabled:opacity-30"
        >
          Add
        </button>
      </div>

      {awaitingNote ? (
        <NoteSheet
          preview={awaitingNote.preview}
          onAnalyse={(hint) => void analyse(awaitingNote.id, hint)}
        />
      ) : null}

      <Favourites items={favourites} onLogged={() => finish("Logged.")} />

      {quickItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="label-xs">Again</p>
          {/* One row that scrolls, rather than a wrapping block that pushes the
              day's log below the fold. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {quickItems.map((q) => (
              <button
                key={q.normKey}
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await quickLog(q.normKey);
                    if (navigator.vibrate) navigator.vibrate(10);
                    finish("Logged.");
                  })
                }
                className="tap flex shrink-0 items-center gap-2 border border-edge px-3 py-1.5 text-xs text-ink active:border-crimson"
              >
                <span className="max-w-[9rem] truncate">{q.description}</span>
                {q.kcal !== null ? <span className="text-muted-dim tabular">{q.kcal}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Appears after the shot, before the model runs. The entry is already saved by
 * this point, so there is no way to lose it here — the only thing at stake is
 * how good the estimate will be.
 */
function NoteSheet({
  preview,
  onAnalyse,
}: {
  preview: string;
  onAnalyse: (hint: string) => void;
}) {
  const [hint, setHint] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus without yanking the keyboard up on a phone the moment it appears —
    // typing is optional, and forcing the keyboard makes it feel required.
    ref.current?.focus({ preventScroll: true });
  }, []);

  /**
   * Append, then put the caret back at the end. Without the explicit
   * selection reset the input keeps its old caret position, so anything typed
   * after tapping a chip lands in front of the word instead of after it.
   */
  const append = (word: string) => {
    setHint((v) => {
      const next = v.trim().length === 0 ? word : `${v.trim()}, ${word}`;
      queueMicrotask(() => {
        const el = ref.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(next.length, next.length);
      });
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-base/80 backdrop-blur-sm">
      <div className="pad-safe-b panel mx-auto flex w-full max-w-lg flex-col gap-3 border-t-2 border-t-crimson p-4">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-16 w-16 shrink-0 border border-edge object-cover" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="display text-base text-ink">Anything the photo misses?</p>
            <p className="text-xs leading-relaxed text-muted">
              Size, how much you ate, what it was cooked in. Optional — saved either way.
            </p>
          </div>
        </div>

        <input
          ref={ref}
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAnalyse(hint);
          }}
          enterKeyHint="done"
          placeholder="e.g. 30 cm pizza, ate two thirds"
          aria-label="Extra detail for the estimate"
          className="tap border border-edge bg-panel-2 px-3 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
        />

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {["small", "large", "half of it", "homemade", "restaurant portion"].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => append(w)}
              className="shrink-0 border border-edge px-3 py-1.5 text-xs text-muted active:border-cobalt active:text-cobalt-lift"
            >
              {w}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onAnalyse(hint)}
          className="tap display w-full border border-crimson bg-crimson px-4 py-3 text-sm tracking-widest text-ink active:opacity-80"
        >
          {hint.trim() ? "Analyse with this" : "Analyse"}
        </button>
      </div>
    </div>
  );
}
