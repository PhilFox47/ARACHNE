import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Wired into the compose healthcheck. Touches the database rather than just
 * returning 200 — a container whose volume failed to mount is not healthy, and
 * a process-liveness check would happily report that it is.
 */
export async function GET() {
  try {
    db.get(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: "up", ts: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "down", error: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}
