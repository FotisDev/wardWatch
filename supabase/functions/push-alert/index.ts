import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("PUSH_WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  const { alert_id } = await req.json();
  const { data: alert, error } = await supabase
    .from("alerts")
    .select("id, ward_id, severity, score, status, patient:patients(bed:beds(label))")
    .eq("id", alert_id)
    .single();
  if (error || !alert) return new Response("alert not found", { status: 404 });
  if (alert.status === "resolved") return Response.json({ sent: 0 });

  const { data: staff } = await supabase
    .from("profiles")
    .select("id")
    .or(`ward_id.eq.${alert.ward_id},role.eq.admin`);
  const { data: devices } = await supabase
    .from("device_tokens")
    .select("id, subscription")
    .eq("platform", "web")
    .in("user_id", (staff ?? []).map((s) => s.id));

  // Bed and score only: lock screens are visible to anyone nearby, so no patient names.
  const bed = (alert.patient as { bed: { label: string } | null } | null)?.bed?.label ?? "Unknown bed";
  const payload = JSON.stringify({
    title: `${alert.severity.toUpperCase()} · ${bed}`,
    body: `Early warning score ${alert.score}`,
    tag: alert.id,
    severity: alert.severity,
    url: "/",
  });

  let sent = 0;
  const expired: string[] = [];
  await Promise.all(
    (devices ?? []).map(async (d) => {
      try {
        await webpush.sendNotification(d.subscription, payload, { TTL: 300, urgency: "high" });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(d.id);
        else console.error("push failed", status, (e as Error).message);
      }
    }),
  );
  if (expired.length) await supabase.from("device_tokens").delete().in("id", expired);

  return Response.json({ sent, expired: expired.length });
});
