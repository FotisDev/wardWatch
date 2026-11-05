import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEntry } from "./audit";
import type { ScoreSummary } from "./handover";
import { registerDevice, updateAlertStatus, type Alert, type RegisterDevice, type UpdateAlertStatus } from "./schemas";

export function createApi(supabase: SupabaseClient) {
  return {
    async me() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, ward_id")
        .eq("id", auth.user.id)
        .single();
      if (error) throw error;
      return data;
    },

    async openAlerts(wardId?: string) {
      let q = supabase
        .from("alerts")
        .select("*, patient:patients(id, display_name, bed:beds(label))")
        .neq("status", "resolved")
        .order("created_at", { ascending: false });
      if (wardId) q = q.eq("ward_id", wardId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },

    async setAlertStatus(input: UpdateAlertStatus) {
      const { id, status } = updateAlertStatus.parse(input);
      const { data, error } = await supabase.rpc("set_alert_status", {
        p_alert_id: id,
        p_status: status,
      });
      if (error) throw error;
      return data;
    },

    async alertsForShift(wardId: string, since: Date) {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("ward_id", wardId)
        .or(`created_at.gte.${since.toISOString()},status.neq.resolved`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Alert[];
    },

    async scoreSummary(wardId: string, since: Date) {
      const { data, error } = await supabase.rpc("patient_score_summary", {
        p_ward_id: wardId,
        p_since: since.toISOString(),
      });
      if (error) throw error;
      return data as ScoreSummary[];
    },

    async auditLog(wardId: string, limit = 100) {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("ward_id", wardId)
        .order("at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as AuditEntry[];
    },

    async registerDevice(input: RegisterDevice) {
      const body = registerDevice.parse(input);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("device_tokens")
        .upsert({ ...body, user_id: auth.user.id }, { onConflict: "user_id,token" });
      if (error) throw error;
    },

    async unregisterDevice(token: string) {
      const { error } = await supabase.from("device_tokens").delete().eq("token", token);
      if (error) throw error;
    },
  };
}

export type WardWatchApi = ReturnType<typeof createApi>;
