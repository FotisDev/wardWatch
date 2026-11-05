export type AuditEntry = {
  id: number;
  at: string;
  actor_id: string | null;
  ward_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  details: Record<string, unknown>;
};

const text = (v: unknown) => (v == null ? "none" : String(v).replace("_", " "));

export function describeAudit(entry: AuditEntry, subject = "patient"): string {
  const s = describe(entry, subject);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function describe(entry: AuditEntry, subject: string): string {
  const d = entry.details;
  switch (entry.action) {
    case "alert.created":
      return `${text(d.severity)} alert raised for ${subject} (score ${d.score})`;
    case "alert.escalated":
      return `Alert for ${subject} escalated from ${text(d.from)} to ${text(d.to)} (score ${d.score})`;
    case "alert.acknowledged":
      return `Alert for ${subject} acknowledged`;
    case "alert.resolved":
      return `Alert for ${subject} resolved`;
    case "patient.admitted":
      return `${subject} admitted`;
    case "patient.discharged":
      return `${subject} discharged`;
    case "patient.moved":
      return `${subject} moved`;
    case "staff.access_changed":
      return `Staff access changed: role ${text(d.from_role)} → ${text(d.to_role)}`;
    default:
      return entry.action;
  }
}
