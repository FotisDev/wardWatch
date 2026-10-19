import { z } from "zod";

/** A single set of vital signs, as sent by a monitor or the simulator. */
export const vitalsInput = z.object({
  patient_id: z.string().uuid(),
  recorded_at: z.string().datetime().optional(),
  heart_rate: z.number().int().min(0).max(300),
  resp_rate: z.number().int().min(0).max(80),
  spo2: z.number().int().min(0).max(100),
  systolic_bp: z.number().int().min(0).max(300),
  temperature: z.number().min(25).max(45),
  source: z.string().max(50).default("simulator"),
});
export type VitalsInput = z.infer<typeof vitalsInput>;
