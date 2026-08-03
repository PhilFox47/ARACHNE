import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { weights } from "@/lib/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { needsOnboarding } from "@/lib/onboarding";
import { Onboarding } from "@/components/Onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if (!(await isAuthed())) redirect("/login");

  // Reachable only when it's actually needed. Coming back to it later would
  // silently rewrite day 0, which is the one setting nothing else can recover.
  if (!needsOnboarding()) redirect("/");

  const today = todayISO();
  const hasHistory = db.select().from(weights).all().length > 0;

  return (
    <Onboarding
      today={today}
      tomorrow={addDays(today, 1)}
      equipment={getSettings().equipment}
      hasHistory={hasHistory}
    />
  );
}
