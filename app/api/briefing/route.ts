import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { ensureBriefing, storedBriefing } from "@/lib/briefing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Today's briefing, written if it is due and missing.
 *
 * A POST rather than a GET because it can write — and because the HQ page
 * server-renders whatever is already stored, so this is only ever called when
 * there is work to do. The key never leaves the server; the client gets a
 * paragraph.
 */
export async function POST() {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  const date = todayISO();
  try {
    const briefing = await ensureBriefing(date);
    return NextResponse.json({ ok: true, briefing });
  } catch {
    // ensureBriefing swallows its own failures; anything reaching here is the
    // database itself, and the screen is better off silent than broken.
    return NextResponse.json({ ok: true, briefing: storedBriefing(date) });
  }
}
