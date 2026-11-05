import { redirect } from "next/navigation";
import { createApi } from "@wardwatch/shared";
import { createClient } from "@/lib/supabase/server";

export type Ward = { id: string; code: string; name: string };

export async function loadSession(wardCode?: string) {
  const supabase = await createClient();
  const api = createApi(supabase);
  const me = await api.me().catch(() => null);
  if (!me) redirect("/login");

  const { data: allWards } = await supabase.from("wards").select("id, code, name").order("name");
  const wards: Ward[] = (allWards ?? []).filter((w) => me.role === "admin" || w.id === me.ward_id);
  const ward = wards.find((w) => w.code === wardCode) ?? wards[0] ?? null;

  return { supabase, api, me, wards, ward };
}
