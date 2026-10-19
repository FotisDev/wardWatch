import { z } from "zod";
import { devicePlatform } from "./enums";

/**
 * A push target. Web push stores the full PushSubscription JSON;
 * Expo/native push stores only the token.
 */
export const registerDevice = z.object({
  platform: devicePlatform,
  token: z.string().min(1),
  subscription: z.record(z.unknown()).nullable().optional(),
});
export type RegisterDevice = z.infer<typeof registerDevice>;
