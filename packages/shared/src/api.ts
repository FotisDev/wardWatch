import type { SupabaseClient } from "@supabase/supabase-js";
import { registerDevice, updateAlertStatus, type RegisterDevice, type UpdateAlertStatus } from "./schemas";

/**
 * Client-agnostic data access. Web and mobile both pass in their own
 * authenticated Supabase client; row-level security does the authorisation.
 */
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

    async registerDevice(input: RegisterDevice) {
      const body = registerDevice.parse(input);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("device_tokens")
        .upsert({ ...body, user_id: auth.user.id }, { onConflict: "user_id,token" });
      if (error) throw error;
    },
  };
}

export type WardWatchApi = ReturnType<typeof createApi>;
