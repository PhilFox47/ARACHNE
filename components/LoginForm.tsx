"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mark } from "./Mark";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Not recognised.");
        setPassword("");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Console unreachable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-4">
        <Mark size={84} />
        <h1 className="display text-4xl tracking-[0.18em] text-ink">ARACHNE</h1>
      </div>

      <form onSubmit={submit} className="panel flex w-full max-w-xs flex-col gap-4 p-5">
        <label className="label-xs" htmlFor="pw">
          Access
        </label>
        <input
          id="pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          className="tap border border-edge bg-panel-2 px-3 py-2.5 text-center text-lg text-ink outline-none focus:border-cobalt"
        />
        {error ? <p className="text-center text-xs text-crimson">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="tap display border border-crimson bg-crimson px-4 py-3 text-sm tracking-widest text-ink active:opacity-70 disabled:opacity-40"
        >
          {busy ? "Checking" : "Enter"}
        </button>
      </form>
    </main>
  );
}
