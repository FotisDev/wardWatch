import { z } from "zod";

export const appRole = z.enum(["nurse", "charge_nurse", "admin"]);
export type AppRole = z.infer<typeof appRole>;

export const alertSeverity = z.enum(["low", "medium", "high", "critical"]);
export type AlertSeverity = z.infer<typeof alertSeverity>;

export const alertStatus = z.enum(["open", "acknowledged", "resolved"]);
export type AlertStatus = z.infer<typeof alertStatus>;
