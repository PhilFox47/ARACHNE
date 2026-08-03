"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSuitPhoto, saveSuitPhoto } from "@/app/suit-check/actions";
import { PHOTO_ANGLES } from "@/lib/plan";

export interface SuitShot {
  id: number;
  angle: string;
  path: string;
  date: string;
}

/** Same 1200px compression as FUEL — these are for comparison, not printing. */
async function compress(file: File, maxEdge = 1200, quality = 0.84): Promise<string> {
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

/**
 * Four slots, one per angle. Each is its own camera button, so a set can be
 * built up across the day rather than demanding all four in one go.
 */
export function SuitCheckCapture({ shots, weekIndex }: { shots: SuitShot[]; weekIndex: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const byAngle = new Map(shots.map((s) => [s.angle, s]));

  const shoot = async (angle: string, file: File) => {
    setBusy(angle);
    setError(null);
    if (navigator.vibrate) navigator.vibrate(8);
    try {
      const dataUrl = await compress(file);
      const res = await saveSuitPhoto(angle, dataUrl, weekIndex);
      if (!res.ok) setError(res.error);
      else if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
      router.refresh();
    } catch {
      setError("Couldn't read that image.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {PHOTO_ANGLES.map((a) => {
          const shot = byAngle.get(a.key);
          const loading = busy === a.key;

          return (
            <div key={a.key} className="flex flex-col gap-2">
              <input
                ref={(el) => {
                  refs.current[a.key] = el;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void shoot(a.key, f);
                }}
              />

              <button
                type="button"
                disabled={loading}
                onClick={() => refs.current[a.key]?.click()}
                className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden border ${
                  shot ? "border-crimson-dim" : "border-dashed border-edge"
                } bg-panel-2 active:opacity-80 disabled:opacity-60`}
              >
                {shot ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/photo/${shot.path}`}
                      alt={a.label}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-base/80 px-2 py-1 text-[0.6rem] uppercase tracking-widest text-ink">
                      {a.label}
                    </span>
                  </>
                ) : (
                  <span className="flex flex-col items-center gap-2 px-2 text-center">
                    <svg viewBox="0 0 100 100" width="26" height="26" fill="none" stroke={loading ? "#4E86E8" : "#8A92A6"} strokeWidth="6" strokeLinecap="round" aria-hidden="true">
                      <circle cx="50" cy="55" r="20" />
                      <path d="M32 30 H68" />
                    </svg>
                    <span className="label-xs">{loading ? "Saving" : a.label}</span>
                  </span>
                )}
              </button>

              {shot ? (
                <button
                  type="button"
                  onClick={() =>
                    start(async () => {
                      await deleteSuitPhoto(shot.id);
                      router.refresh();
                    })
                  }
                  className="label-xs self-start text-crimson underline"
                >
                  Retake
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <p className="text-xs text-crimson">{error}</p> : null}

      <p className="text-xs leading-relaxed text-muted-dim">
        Same light, same spot, same shorts, every week. The document is blunt about why: between months 4
        and 8 progress feels slow even when it isn&apos;t, and these are the antidote.
      </p>
    </div>
  );
}
