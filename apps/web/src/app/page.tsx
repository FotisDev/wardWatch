import Link from "next/link";
import { redirect } from "next/navigation";
import { createApi } from "@wardwatch/shared";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import { WardBoard, type Patient, type Reading } from "./ward-board";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ward?: string; code?: string }>;
}) {
  const { ward: wardCode, code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);

  const supabase = await createClient();
  const api = createApi(supabase);
  const me = await api.me().catch(() => null);
  if (!me) redirect("/login");

  const { data: allWards } = await supabase.from("wards").select("id, code, name").order("name");
  const wards = (allWards ?? []).filter((w) => me.role === "admin" || w.id === me.ward_id);
  const ward = wards.find((w) => w.code === wardCode) ?? wards[0];

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
      <div>
        <h1 className="text-2xl font-bold">WardWatch</h1>
        <p className="text-sm text-neutral-500">
          {me.full_name ?? "Signed in"} · {me.role.replace("_", " ")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {wards.length > 1 &&
          wards.map((w) => (
            <Link
              key={w.id}
              href={`/?ward=${w.code}`}
              className={`rounded-md px-3 py-1.5 text-sm ${
                w.id === ward?.id
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                  : "border border-neutral-300 dark:border-neutral-700"
              }`}
            >
              {w.name}
            </Link>
          ))}
        <form action={signOut}>
          <button className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-foreground">Sign out</button>
        </form>
      </div>
    </header>
  );

  if (!ward) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        {header}
        <h2 className="mt-8 text-lg font-semibold">No ward assigned yet</h2>
        <p className="mt-2 text-sm text-neutral-500">
          An admin needs to give you a ward or the admin role. To make yourself admin, run this in the Supabase SQL
          editor:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
          {`update public.profiles set role = 'admin' where id = '${me.id}';`}
        </pre>
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
