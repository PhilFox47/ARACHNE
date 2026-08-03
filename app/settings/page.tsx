import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { apiKey, envModel } from "@/lib/nanogpt";
import { SettingsForm } from "@/components/SettingsForm";
import { EquipmentPicker } from "@/components/EquipmentPicker";
import { ResetPanel } from "@/components/ResetPanel";
import { BottomNav } from "@/components/BottomNav";
import { addDays, todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function Settings() {
  if (!(await isAuthed())) redirect("/login");
  const s = getSettings();

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-baseline justify-between">
        <h1 className="display text-2xl text-ink">SETTINGS</h1>
        <Link href="/" className="label-xs">
          HQ
        </Link>
      </header>

      <SettingsForm
        initial={{
          visionModel: s.visionModel,
          photoCorrectionPct: s.photoCorrectionPct,
          heightCm: s.heightCm,
          startWeightKg: s.startWeightKg,
          targetWeightKg: s.targetWeightKg,
          startDate: s.startDate,
        }}
        envModel={envModel()}
        hasKey={apiKey() !== null}
      />

      <EquipmentPicker initial={s.equipment} />

      <ResetPanel today={todayISO()} tomorrow={addDays(todayISO(), 1)} />

      <BottomNav />
    </main>
  );
}
