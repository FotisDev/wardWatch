import { z } from "zod";
import { alertSeverity, alertStatus } from "./enums";

export const alert = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  ward_id: z.string().uuid(),
  vitals_id: z.number().int().nullable(),
  kind: z.string(),
  severity: alertSeverity,
  score: z.number().int(),
  message: z.string(),
  status: alertStatus,
  created_at: z.string(),
  acknowledged_by: z.string().uuid().nullable(),
  acknowledged_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
});
export type Alert = z.infer<typeof alert>;

export const updateAlertStatus = z.object({
  id: z.string().uuid(),
  status: z.enum(["acknowledged", "resolved"]),
});
export type UpdateAlertStatus = z.infer<typeof updateAlertStatus>;
