"use client";

import { useEffect, useMemo, useState } from "react";
import { createApi, type Alert, type AlertSeverity } from "@wardwatch/shared";
import { createClient } from "@/lib/supabase/client";

export type Patient = { id: string; display_name: string; mrn: string; bed: { label: string } | null };
export type Reading = {
  patient_id: string;
  recorded_at: string;
  heart_rate: number;
  resp_rate: number;
  spo2: number;
  systolic_bp: number;
  temperature: number;
  score: number | null;
};

const severityRank: Record<AlertSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const severityStyle: Record<AlertSeverity, { card: string; badge: string }> = {
  low: { card: "border-sky-500/60", badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  medium: { card: "border-yellow-500/70", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300" },
  high: { card: "border-orange-500 bg-orange-500/5", badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  critical: { card: "border-red-500 bg-red-500/10", badge: "bg-red-500/20 text-red-700 dark:text-red-300" },
};
const STALE_MS = 30_000;

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

export function WardBoard({
  ward,
  patients,
  initialReadings,
  initialAlerts,
}: {
  ward: { id: string; name: string };
  patients: Patient[];
  initialReadings: Record<string, Reading>;
  initialAlerts: Alert[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [readings, setReadings] = useState(initialReadings);
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ids = new Set(patients.map((p) => p.id));
    const channel = supabase
      .channel(`ward-${ward.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vitals" }, ({ new: r }) => {
        const reading = r as Reading;
        if (ids.has(reading.patient_id)) setReadings((prev) => ({ ...prev, [reading.patient_id]: reading }));
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts", filter: `ward_id=eq.${ward.id}` },
        ({ new: a }) => {
          const alert = a as Alert;
          if (!alert?.id) return;
          setAlerts((prev) => {
            const rest = prev.filter((x) => x.id !== alert.id);
            return alert.status === "resolved" ? rest : [alert, ...rest];
          });
        },
      );

    // Realtime applies RLS, so it needs the signed-in user's token before subscribing.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, ward.id, patients]);

  const alertByPatient = new Map(alerts.map((a) => [a.patient_id, a]));
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const sortedAlerts = [...alerts].sort(
    (a, b) => severityRank[b.severity] - severityRank[a.severity] || b.created_at.localeCompare(a.created_at),
  );
  const beds = [...patients].sort((a, b) =>
    (a.bed?.label ?? "").localeCompare(b.bed?.label ?? "", undefined, { numeric: true }),
  );

  async function setStatus(id: string, status: "acknowledged" | "resolved") {
    setBusy(id);
    setError(null);
    try {
      const updated = (await createApi(supabase).setAlertStatus({ id, status })) as Alert;
      setAlerts((prev) =>
        status === "resolved" ? prev.filter((a) => a.id !== id) : prev.map((a) => (a.id === id ? updated : a)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{ward.name}</h2>
          <span className="flex items-center gap-2 text-xs text-neutral-500">
            <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-neutral-400"}`} />
            {live ? "Live" : "Connecting…"}
          </span>
        </div>

        {beds.length === 0 && <p className="text-sm text-neutral-500">No admitted patients on this ward.</p>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {beds.map((p) => {
            const r = readings[p.id];
            const alert = alertByPatient.get(p.id);
            const stale = !r || now - new Date(r.recorded_at).getTime() > STALE_MS;
            return (
              <article
                key={p.id}
                className={`rounded-lg border p-4 ${
                  alert ? severityStyle[alert.severity].card : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-neutral-500">{p.bed?.label ?? "No bed"}</p>
                    <p className="font-medium">{p.display_name}</p>
                    <p className="text-xs text-neutral-500">{p.mrn}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold tabular-nums">{r?.score ?? "–"}</p>
                    <p className="text-[10px] uppercase text-neutral-500">EWS</p>
                  </div>
                </div>

                {r ? (
                  <dl className="mt-3 grid grid-cols-5 gap-1 text-center text-sm tabular-nums">
                    {[
                      ["HR", r.heart_rate],
                      ["RR", r.resp_rate],
                      ["SpO₂", `${r.spo2}%`],
                      ["SBP", r.systolic_bp],
                      ["Temp", Number(r.temperature).toFixed(1)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-[10px] uppercase text-neutral-500">{label}</dt>
                        <dd className="font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-neutral-500">No readings yet</p>
                )}

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={stale ? "text-amber-600 dark:text-amber-400" : "text-neutral-500"}>
                    {r ? ago(r.recorded_at, now) : "—"}
                    {r && stale && " · stale"}
                  </span>
                  {alert && (
                    <span className={`rounded px-1.5 py-0.5 font-medium ${severityStyle[alert.severity].badge}`}>
                      {alert.severity}
                      {alert.status === "acknowledged" && " · ack"}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <aside>
        <h2 className="mb-3 text-lg font-semibold">
          Active alerts <span className="text-neutral-500">({alerts.length})</span>
        </h2>
        {error && <p className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
        {sortedAlerts.length === 0 && <p className="text-sm text-neutral-500">No active alerts.</p>}
        <ul className="space-y-2">
          {sortedAlerts.map((a) => {
            const p = patientById.get(a.patient_id);
            return (
              <li key={a.id} className={`rounded-lg border p-3 ${severityStyle[a.severity].card}`}>
                <div className="flex items-center justify-between">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${severityStyle[a.severity].badge}`}>
                    {a.severity}
                  </span>
                  <span className="text-xs text-neutral-500">{ago(a.created_at, now)}</span>
                </div>
                <p className="mt-2 text-sm font-medium">
                  {p?.bed?.label ?? "?"} · {p?.display_name ?? "Unknown patient"}
                </p>
                <p className="text-sm text-neutral-500">{a.message}</p>
                <div className="mt-3 flex gap-2">
                  {a.status === "open" ? (
                    <button
                      disabled={busy === a.id}
                      onClick={() => setStatus(a.id, "acknowledged")}
                      className="flex-1 rounded-md bg-neutral-900 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <span className="flex-1 py-1.5 text-xs text-neutral-500">
                      Acknowledged {a.acknowledged_at && ago(a.acknowledged_at, now)}
                    </span>
                  )}
                  <button
                    disabled={busy === a.id}
                    onClick={() => setStatus(a.id, "resolved")}
                    className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
                  >
                    Resolve
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
