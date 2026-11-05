import { describeAudit, type AuditEntry } from "@wardwatch/shared";
import { loadSession } from "@/lib/session";
import { AppHeader, NoWard } from "../app-header";

function patientIdOf(e: AuditEntry) {
  if (e.entity === "patient") return e.entity_id;
  return typeof e.details.patient_id === "string" ? e.details.patient_id : null;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ ward?: string }> }) {
  const { supabase, api, me, wards, ward } = await loadSession((await searchParams).ward);
  const header = <AppHeader me={me} wards={wards} ward={ward} path="/audit" />;

  if (!ward) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        {header}
        <NoWard userId={me.id} />
      </main>
    );
  }

  const entries = await api.auditLog(ward.id, 200);
  const actorIds = [...new Set(entries.map((e) => e.actor_id).filter((id): id is string => !!id))];
  const [{ data: actors }, { data: patients }] = await Promise.all([
    actorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    supabase.from("patients").select("id, display_name, bed:beds(label)").eq("ward_id", ward.id),
  ]);
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? "Unnamed user"]));
  const patientName = new Map(
    ((patients ?? []) as unknown as { id: string; display_name: string; bed: { label: string } | null }[]).map((p) => [
      p.id,
      p.bed ? `${p.bed.label} · ${p.display_name}` : p.display_name,
    ]),
  );

  return (
    <main className="mx-auto max-w-5xl p-6">
      {header}
      <h2 className="mt-6 text-lg font-semibold">Audit log · {ward.name}</h2>
      <p className="text-sm text-neutral-500">
        Every alert, patient and access change, newest first. Entries can&apos;t be edited or deleted.
      </p>

      {entries.length === 0 && <p className="mt-4 text-sm text-neutral-500">Nothing recorded yet.</p>}
      <ol className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-900">
        {entries.map((e) => {
          const pid = patientIdOf(e);
          return (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm">
              <time className="w-36 shrink-0 tabular-nums text-neutral-500" dateTime={e.at}>
                {new Date(e.at).toLocaleString("en-GB", { timeZone: "Europe/Copenhagen" })}
              </time>
              <span className="flex-1">{describeAudit(e, (pid && patientName.get(pid)) || "patient")}</span>
              <span className="text-neutral-500">
                {e.actor_id ? (actorName.get(e.actor_id) ?? "Staff member") : "System"}
              </span>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
