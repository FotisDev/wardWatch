import { createApi } from "@wardwatch/shared";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { count: wards, error } = await supabase
    .from("wards")
    .select("*", { count: "exact", head: true });
  const me = await createApi(supabase).me().catch(() => null);

  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-3xl font-bold">WardWatch</h1>
      <p className="mt-2 text-gray-500">Ward monitoring and nurse alerts.</p>
      <ul className="mt-6 space-y-1 text-sm">
        <li>Supabase: {error ? `error: ${error.message}` : "connected"}</li>
        <li>Signed in: {me ? `${me.full_name ?? me.id} (${me.role})` : "no"}</li>
        <li>Wards visible: {wards ?? 0}</li>
      </ul>
    </main>
  );
}
