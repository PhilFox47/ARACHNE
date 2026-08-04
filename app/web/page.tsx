import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { buildWeb } from "@/lib/web";
import { WebTree } from "@/components/WebTree";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function Web() {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  const web = buildWeb();

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/patrol" className="label-xs">
            ‹ PATROL
          </Link>
          <h1 className="display text-2xl text-ink">THE WEB</h1>
        </div>
        <span className="label-xs tabular">
          {web.totalMastered} / {web.totalNodes}
        </span>
      </header>

      <WebTree web={web} />

      <p className="px-1 text-xs leading-relaxed text-muted-dim">
        Nothing here is unlocked by time. Every state is read out of what you logged, so correcting a set
        corrects the tree — and a restored backup restores it too.
      </p>

      <BottomNav />
    </main>
  );
}
