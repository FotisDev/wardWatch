import { z } from "zod";
import { devicePlatform } from "./enums";

export const registerDevice = z.object({
  platform: devicePlatform,
  token: z.string().min(1),
  subscription: z
    .object({
      endpoint: z.string().url().optional(),
      expirationTime: z.number().nullable().optional(),
      keys: z.record(z.string()).optional(),
    })
    .nullable()
    .optional(),
});
export type RegisterDevice = z.infer<typeof registerDevice>;
