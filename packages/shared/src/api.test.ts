import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createApi } from "./api";
import { vitalsInput } from "./schemas";

describe("setAlertStatus", () => {
  it("calls the RPC with validated input", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "a" }, error: null });
    const api = createApi({ rpc } as unknown as SupabaseClient);
    const id = crypto.randomUUID();

    await api.setAlertStatus({ id, status: "acknowledged" });

    expect(rpc).toHaveBeenCalledWith("set_alert_status", { p_alert_id: id, p_status: "acknowledged" });
  });

  it("rejects reopening or bad ids before touching the database", async () => {
    const rpc = vi.fn();
    const api = createApi({ rpc } as unknown as SupabaseClient);

    await expect(api.setAlertStatus({ id: "not-a-uuid", status: "resolved" })).rejects.toThrow();
    await expect(
      api.setAlertStatus({ id: crypto.randomUUID(), status: "open" as "resolved" }),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces database errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("alert not found") });
    const api = createApi({ rpc } as unknown as SupabaseClient);
    await expect(api.setAlertStatus({ id: crypto.randomUUID(), status: "resolved" })).rejects.toThrow(
      "alert not found",
    );
  });
});

describe("vitalsInput", () => {
  const valid = {
    patient_id: crypto.randomUUID(),
    heart_rate: 80,
    resp_rate: 16,
    spo2: 97,
    systolic_bp: 120,
    temperature: 36.9,
  };

  it("accepts a normal reading and defaults the source", () => {
    expect(vitalsInput.parse(valid).source).toBe("simulator");
  });

  it.each([
    ["spo2", 101],
    ["heart_rate", 80.5],
    ["temperature", 50],
    ["resp_rate", -1],
  ])("rejects %s = %s", (field, value) => {
    expect(vitalsInput.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});
