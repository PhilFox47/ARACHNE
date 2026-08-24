"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The trainer's paragraph, at the top of HQ.
 *
 * Server-rendered when today's is already stored, which is every load after the
 * first — no spinner, no flash, no request. The client half exists only for the
 * first open of the day, where the paragraph has to be written before it can be
 * shown and that takes a model call.
 *
 * It degrades in one direction the whole way down: a stored briefing, else one
 * written now, else the locally composed version the server falls back to, else
 * nothing at all rather than an error. The top of the home screen is the last
 * place that should be able to show you a failure.
 */
export function Briefing({
  initial,
  due,
}: {
  initial: { body: string; source: "ai" | "local"; date: string } | null;
  /** Whether the server thinks one should exist by now. */
  due: boolean;
}) {
  const [body, setBody] = useState(initial?.body ?? null);
  const [working, setWorking] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    // Only when there is nothing to show and the day has earned one. Guarded by
    // a ref because React runs effects twice in development and this one costs
    // a model call.
    if (body !== null || !due || asked.current) return;
    asked.current = true;
    setWorking(true);
    void (async () => {
      try {
        const res = await fetch("/api/briefing", { method: "POST" });
        const json = await res.json();
        if (json?.briefing?.body) setBody(json.briefing.body as string);
      } catch {
        // Nothing to say, so say nothing.
      } finally {
        setWorking(false);
      }
    })();
  }, [body, due]);

  if (body === null && !working) return null;

  return (
    <section className="swing flex flex-col gap-2">
      <p className="label-xs">The trainer</p>
      <div className="panel border-l-2 border-l-crimson p-4">
        {working ? (
          <p className="text-sm leading-relaxed text-muted-dim">Reading the week…</p>
        ) : (
          body!.split(/\n{2,}/).map((para, i) => (
            <p key={i} className={`text-sm leading-relaxed text-ink ${i > 0 ? "mt-2.5" : ""}`}>
              {para}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
