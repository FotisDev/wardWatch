import Link from "next/link";
import { buildHandover, handoverToText, type AlertSeverity, type HandoverPatient } from "@wardwatch/shared";
import { loadSession } from "@/lib/session";
import { AppHeader, NoWard } from "../app-header";
import { CopyButton } from "./copy-button";

const SHIFT_HOURS = [8, 12];
const badge: Record<AlertSeverity, string> = {
  low: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  critical: "bg-red-500/20 text-red-700 dark:text-red-300",
};
const trendLabel = { rising: "↑ rising", falling: "↓ falling", stable: "→ stable", unknown: "no data" };

export default async function HandoverPage({
  searchParams,
}: {
  searchParams: Promise<{ ward?: string; hours?: string }>;
}) {
  const params = await searchParams;
  const hours = SHIFT_HOURS.includes(Number(params.hours)) ? Number(params.hours) : 8;
  const { supabase, api, me, wards, ward } = await loadSession(params.ward);
  const header = <AppHeader me={me} wards={wards} ward={ward} path="/handover" />;

  if (!ward) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        {header}
        <NoWard userId={me.id} />
      </main>
    );
  }

  const until = new Date();
  const since = new Date(until.getTime() - hours * 3_600_000);
  const [{ data: patientRows }, alerts, scores] = await Promise.all([
    supabase
      .from("patients")
      .select("id, display_name, bed:beds(label)")
      .eq("ward_id", ward.id)
      .is("discharged_at", null),
    api.alertsForShift(ward.id, since),
    api.scoreSummary(ward.id, since),
  ]);
  const patients: HandoverPatient[] = (
    (patientRows ?? []) as unknown as { id: string; display_name: string; bed: { label: string } | null }[]
  ).map((p) => ({ id: p.id, display_name: p.display_name, bed: p.bed?.label ?? null }));

  const h = buildHandover({ patients, alerts, scores, since, until });
  const t = h.totals;
  const stats = [
    ["Alerts this shift", t.alerts],
    ["Critical", t.critical],
    ["Still active", t.stillActive],
    ["Unacknowledged", t.unacknowledged],
    ["Median time to ack", t.medianAckMinutes == null ? "–" : `${Math.round(t.medianAckMinutes)} min`],
  ] as const;

  return (
    <main className="mx-auto max-w-5xl p-6">
      {header}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Shift handover · {ward.name}</h2>
          <p className="text-sm text-neutral-500">
            {since.toLocaleString("en-GB", { timeZone: "Europe/Copenhagen" })} –{" "}
            {until.toLocaleString("en-GB", { timeZone: "Europe/Copenhagen", timeStyle: "short" })}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          {SHIFT_HOURS.map((n) => (
            <Link
              key={n}
              href={`/handover?ward=${ward.code}&hours=${n}`}
              className={`rounded-md px-3 py-1.5 text-sm ${
                n === hours ? "bg-neutral-900 text-white dark:bg-white dark:text-black" : "border border-neutral-300 dark:border-neutral-700"
              }`}
            >
              Last {n}h
            </Link>
          ))}
          <CopyButton text={handoverToText(h, ward.name)} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <dt className="text-xs text-neutral-500">{label}</dt>
            <dd className="text-2xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <table className="mt-6 w-full text-left text-sm">
        <thead className="text-xs uppercase text-neutral-500">
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th className="py-2 pr-3 font-medium">Bed</th>
            <th className="py-2 pr-3 font-medium">Patient</th>
            <th className="py-2 pr-3 font-medium">Score</th>
            <th className="py-2 pr-3 font-medium">Trend</th>
            <th className="py-2 pr-3 font-medium">Peak</th>
            <th className="py-2 pr-3 font-medium">Alerts</th>
            <th className="py-2 font-medium">Now</th>
          </tr>
        </thead>
        <tbody>
          {h.patients.map((p) => (
            <tr key={p.patient.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2 pr-3 text-neutral-500">{p.patient.bed ?? "–"}</td>
              <td className="py-2 pr-3 font-medium">{p.patient.display_name}</td>
              <td className="py-2 pr-3 tabular-nums">{p.latestScore ?? "–"}</td>
              <td className={`py-2 pr-3 ${p.trend === "rising" ? "font-medium text-red-600 dark:text-red-400" : ""}`}>
                {trendLabel[p.trend]}
              </td>
              <td className="py-2 pr-3 tabular-nums">{p.maxScore ?? "–"}</td>
              <td className="py-2 pr-3 tabular-nums">
                {p.alertCount}
                {p.worstSeverity && <span className="ml-1 text-neutral-500">(worst {p.worstSeverity})</span>}
              </td>
              <td className="py-2">
                {p.activeAlert ? (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge[p.activeAlert.severity]}`}>
                    {p.activeAlert.severity}
                    {p.activeAlert.status === "acknowledged" && " · ack"}
                  </span>
                ) : (
                  <span className="text-neutral-500">ok</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {h.patients.length === 0 && <p className="mt-4 text-sm text-neutral-500">No admitted patients on this ward.</p>}
    </main>
  );
}
