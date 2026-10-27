import type { SupabaseClient } from "@supabase/supabase-js";
import { updateAlertStatus, type UpdateAlertStatus } from "./schemas";

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

  };
}

export type WardWatchApi = ReturnType<typeof createApi>;
