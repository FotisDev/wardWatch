import { describe, expect, it } from "vitest";
import { describeAudit, type AuditEntry } from "./audit";

const entry = (action: string, details: Record<string, unknown> = {}): AuditEntry => ({
  id: 1,
  at: "2026-11-05T09:00:00Z",
  actor_id: null,
  ward_id: "w1",
  action,
  entity: action.split(".")[0]!,
  entity_id: "x",
  details,
});

describe("describeAudit", () => {
  it.each([
    [entry("alert.created", { severity: "high", score: 5 }), "High alert raised for Bed 1 (score 5)"],
    [
      entry("alert.escalated", { from: "high", to: "critical", score: 8 }),
      "Alert for Bed 1 escalated from high to critical (score 8)",
    ],
    [entry("alert.acknowledged"), "Alert for Bed 1 acknowledged"],
    [entry("alert.resolved"), "Alert for Bed 1 resolved"],
    [entry("patient.admitted"), "Bed 1 admitted"],
    [entry("patient.discharged"), "Bed 1 discharged"],
    [
      entry("staff.access_changed", { from_role: "nurse", to_role: "charge_nurse" }),
      "Staff access changed: role nurse → charge nurse",
    ],
  ])("describes %o", (e, expected) => {
    expect(describeAudit(e, "Bed 1")).toBe(expected);
  });

  it("falls back to a capitalised generic subject", () => {
    expect(describeAudit(entry("patient.admitted"))).toBe("Patient admitted");
  });

  it("returns unknown actions as-is", () => {
    expect(describeAudit(entry("something.new"))).toBe("Something.new");
  });
});
