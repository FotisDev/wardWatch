import type { Alert, AlertSeverity } from "./schemas";

export type HandoverPatient = { id: string; display_name: string; bed: string | null };
export type ScoreSummary = {
  patient_id: string;
  first_score: number | null;
  last_score: number | null;
  max_score: number | null;
  readings: number;
};

export type PatientHandover = {
  patient: HandoverPatient;
  latestScore: number | null;
  trend: "rising" | "falling" | "stable" | "unknown";
  maxScore: number | null;
  alertCount: number;
  worstSeverity: AlertSeverity | null;
  activeAlert: Pick<Alert, "id" | "severity" | "status"> | null;
};

export type Handover = {
  since: string;
  until: string;
  patients: PatientHandover[];
  totals: {
    alerts: number;
    critical: number;
    stillActive: number;
    unacknowledged: number;
    medianAckMinutes: number | null;
  };
};

const rank: Record<AlertSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function trendOf(first: number | null, last: number | null): PatientHandover["trend"] {
  if (first == null || last == null) return "unknown";
  if (last - first >= 2) return "rising";
  if (first - last >= 2) return "falling";
  return "stable";
}

/** Summarises a shift. `alerts` should hold every alert created in the window plus any still active. */
export function buildHandover(input: {
  patients: HandoverPatient[];
  alerts: Alert[];
  scores: ScoreSummary[];
  since: Date;
  until: Date;
}): Handover {
  const since = input.since.getTime();
  const inWindow = input.alerts.filter((a) => new Date(a.created_at).getTime() >= since);
  const active = input.alerts.filter((a) => a.status !== "resolved");
  const scores = new Map(input.scores.map((s) => [s.patient_id, s]));

  const patients = input.patients.map((patient): PatientHandover => {
    const s = scores.get(patient.id);
    const mine = inWindow.filter((a) => a.patient_id === patient.id);
    const current = active.find((a) => a.patient_id === patient.id) ?? null;
    const worst = [...mine, ...(current ? [current] : [])].reduce<AlertSeverity | null>(
      (w, a) => (w == null || rank[a.severity] > rank[w] ? a.severity : w),
      null,
    );
    return {
      patient,
      latestScore: s?.last_score ?? null,
      trend: trendOf(s?.first_score ?? null, s?.last_score ?? null),
      maxScore: s?.max_score ?? null,
      alertCount: mine.length,
      worstSeverity: worst,
      activeAlert: current && { id: current.id, severity: current.severity, status: current.status },
    };
  });

  patients.sort(
    (a, b) =>
      (b.activeAlert ? rank[b.activeAlert.severity] + 1 : 0) - (a.activeAlert ? rank[a.activeAlert.severity] + 1 : 0) ||
      (b.latestScore ?? -1) - (a.latestScore ?? -1) ||
      (a.patient.bed ?? "").localeCompare(b.patient.bed ?? "", undefined, { numeric: true }),
  );

  const ackMinutes = inWindow
    .filter((a) => a.acknowledged_at)
    .map((a) => (new Date(a.acknowledged_at!).getTime() - new Date(a.created_at).getTime()) / 60_000);

  return {
    since: input.since.toISOString(),
    until: input.until.toISOString(),
    patients,
    totals: {
      alerts: inWindow.length,
      critical: inWindow.filter((a) => a.severity === "critical").length,
      stillActive: active.length,
      unacknowledged: active.filter((a) => a.status === "open").length,
      medianAckMinutes: median(ackMinutes),
    },
  };
}

const trendArrow = { rising: "↑", falling: "↓", stable: "→", unknown: "?" };

export function handoverToText(h: Handover, wardName: string, timeZone = "Europe/Copenhagen"): string {
  const t = h.totals;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { timeZone, dateStyle: "short", timeStyle: "short" });
  const lines = [
    `Handover: ${wardName}`,
    `${fmt(h.since)} – ${fmt(h.until)}`,
    `Alerts: ${t.alerts} (${t.critical} critical), ${t.stillActive} still active, ${t.unacknowledged} unacknowledged` +
      (t.medianAckMinutes != null ? `, median time to acknowledge ${Math.round(t.medianAckMinutes)} min` : ""),
    "",
  ];
  for (const p of h.patients) {
    const parts = [
      `${p.patient.bed ?? "No bed"} ${p.patient.display_name}`,
      `score ${p.latestScore ?? "–"} ${trendArrow[p.trend]}`,
    ];
    if (p.activeAlert) parts.push(`ACTIVE ${p.activeAlert.severity} (${p.activeAlert.status})`);
    if (p.alertCount) parts.push(`${p.alertCount} alert${p.alertCount > 1 ? "s" : ""} this shift`);
    lines.push(`- ${parts.join(" · ")}`);
  }
  return lines.join("\n");
}
