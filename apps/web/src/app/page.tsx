import { redirect } from "next/navigation";
import { loadSession } from "@/lib/session";
import { AppHeader, NoWard } from "./app-header";
import { WardBoard, type Patient, type Reading } from "./ward-board";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ward?: string; code?: string }>;
}) {
  const { ward: wardCode, code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);

  const { supabase, api, me, wards, ward } = await loadSession(wardCode);
  const header = <AppHeader me={me} wards={wards} ward={ward} path="/" />;

  if (!ward) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        {header}
        <NoWard userId={me.id} />
      </main>
    );
  }

  const { data: patientRows } = await supabase
    .from("patients")
    .select("id, display_name, mrn, bed:beds(label)")
    .eq("ward_id", ward.id)
    .is("discharged_at", null);
  const patients = (patientRows ?? []) as unknown as Patient[];

  const latest: Record<string, Reading> = {};
  if (patients.length) {
    const { data: readings } = await supabase
      .from("vitals")
      .select("patient_id, recorded_at, heart_rate, resp_rate, spo2, systolic_bp, temperature, score")
      .in("patient_id", patients.map((p) => p.id))
      .order("recorded_at", { ascending: false })
      .limit(patients.length * 5);
    for (const r of (readings ?? []) as Reading[]) latest[r.patient_id] ??= r;
  }

  const alerts = await api.openAlerts(ward.id);

  return (
    <main className="mx-auto max-w-7xl p-6">
      {header}
      <WardBoard key={ward.id} ward={ward} patients={patients} initialReadings={latest} initialAlerts={alerts} />
    </main>
  );
}
