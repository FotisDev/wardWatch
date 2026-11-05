import { describe, expect, it } from "vitest";
import { buildHandover, handoverToText, type HandoverPatient } from "./handover";
import type { Alert } from "./schemas";

const since = new Date("2026-11-05T07:00:00Z");
const until = new Date("2026-11-05T15:00:00Z");

const patients: HandoverPatient[] = [
  { id: "p1", display_name: "A. Jensen", bed: "Bed 1" },
  { id: "p2", display_name: "M. Nielsen", bed: "Bed 2" },
  { id: "p3", display_name: "K. Hansen", bed: "Bed 10" },
];

function alert(overrides: Partial<Alert>): Alert {
  return {
    id: crypto.randomUUID(),
    patient_id: "p1",
    ward_id: "w1",
    vitals_id: null,
    kind: "early_warning",
    severity: "high",
    score: 5,
    message: "",
    status: "open",
    created_at: "2026-11-05T09:00:00Z",
    acknowledged_by: null,
    acknowledged_at: null,
    resolved_at: null,
    ...overrides,
  };
}

describe("buildHandover", () => {
  it("counts only alerts raised during the shift but keeps older active ones", () => {
    const old = alert({ patient_id: "p2", created_at: "2026-11-05T03:00:00Z", severity: "medium" });
    const resolvedOld = alert({ created_at: "2026-11-05T02:00:00Z", status: "resolved" });
    const fresh = alert({ patient_id: "p1", severity: "critical", score: 8 });

    const h = buildHandover({ patients, alerts: [old, resolvedOld, fresh], scores: [], since, until });

    expect(h.totals.alerts).toBe(1);
    expect(h.totals.critical).toBe(1);
    expect(h.totals.stillActive).toBe(2);
    expect(h.patients.find((p) => p.patient.id === "p2")?.activeAlert?.severity).toBe("medium");
    expect(h.patients.find((p) => p.patient.id === "p2")?.alertCount).toBe(0);
  });

  it("puts patients with the most severe active alert first, then by score, then by bed", () => {
    const h = buildHandover({
      patients,
      alerts: [alert({ patient_id: "p3", severity: "critical" }), alert({ patient_id: "p2", severity: "medium" })],
      scores: [{ patient_id: "p1", first_score: 1, last_score: 4, max_score: 4, readings: 10 }],
      since,
      until,
    });
    expect(h.patients.map((p) => p.patient.id)).toEqual(["p3", "p2", "p1"]);
  });

  it("derives the score trend from the first and last reading", () => {
    const h = buildHandover({
      patients,
      alerts: [],
      scores: [
        { patient_id: "p1", first_score: 1, last_score: 5, max_score: 6, readings: 20 },
        { patient_id: "p2", first_score: 6, last_score: 2, max_score: 6, readings: 20 },
        { patient_id: "p3", first_score: 2, last_score: 3, max_score: 3, readings: 20 },
      ],
      since,
      until,
    });
    const trend = Object.fromEntries(h.patients.map((p) => [p.patient.id, p.trend]));
    expect(trend).toEqual({ p1: "rising", p2: "falling", p3: "stable" });
  });

  it("reports unknown trend and null score for patients without readings", () => {
    const h = buildHandover({ patients: [patients[0]!], alerts: [], scores: [], since, until });
    expect(h.patients[0]).toMatchObject({ trend: "unknown", latestScore: null, worstSeverity: null });
  });

  it("computes the median time to acknowledge in minutes", () => {
    const acked = (created: string, ack: string) =>
      alert({ created_at: created, acknowledged_at: ack, status: "resolved" });
    const h = buildHandover({
      patients,
      alerts: [
        acked("2026-11-05T08:00:00Z", "2026-11-05T08:02:00Z"),
        acked("2026-11-05T09:00:00Z", "2026-11-05T09:10:00Z"),
        acked("2026-11-05T10:00:00Z", "2026-11-05T10:04:00Z"),
        acked("2026-11-05T11:00:00Z", "2026-11-05T11:06:00Z"),
      ],
      scores: [],
      since,
      until,
    });
    expect(h.totals.medianAckMinutes).toBe(5);
  });

  it("has no median when nothing was acknowledged", () => {
    const h = buildHandover({ patients, alerts: [alert({})], scores: [], since, until });
    expect(h.totals.medianAckMinutes).toBeNull();
    expect(h.totals.unacknowledged).toBe(1);
  });
});

describe("handoverToText", () => {
  it("renders a plain-text summary in local time", () => {
    const h = buildHandover({
      patients,
      alerts: [alert({ patient_id: "p1", severity: "critical", status: "acknowledged" })],
      scores: [{ patient_id: "p1", first_score: 2, last_score: 8, max_score: 8, readings: 5 }],
      since,
      until,
    });
    const text = handoverToText(h, "Cardiology");
    expect(text).toContain("Handover: Cardiology");
    expect(text).toContain("05/11/2026, 08:00 – 05/11/2026, 16:00");
    expect(text).toContain("- Bed 1 A. Jensen · score 8 ↑ · ACTIVE critical (acknowledged) · 1 alert this shift");
  });
});
