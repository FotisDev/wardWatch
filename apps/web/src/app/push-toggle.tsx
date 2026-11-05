"use client";

import { useEffect, useMemo, useState } from "react";
import { createApi } from "@wardwatch/shared";
import { createClient } from "@/lib/supabase/client";

type State = "unsupported" | "denied" | "off" | "on" | "busy";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function PushToggle() {
  const api = useMemo(() => createApi(createClient()), []);
  const [state, setState] = useState<State>("busy");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(Notification.permission === "denied" ? "denied" : sub ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setState("busy");
    setError(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
        }));
      await api.registerDevice({ platform: "web", token: sub.endpoint, subscription: sub.toJSON() });
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    setError(null);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await api.unregisterDevice(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("on");
    }
  }

  if (state === "unsupported") return null;

  return (
    <button
      onClick={state === "on" ? disable : enable}
      disabled={state === "busy" || state === "denied"}
      title={error ?? (state === "denied" ? "Notifications are blocked in your browser settings" : undefined)}
      className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
    >
      <span className={`h-2 w-2 rounded-full ${state === "on" ? "bg-emerald-500" : "bg-neutral-400"}`} />
      {state === "on" ? "Alerts on" : state === "denied" ? "Alerts blocked" : "Enable alerts"}
      {error && <span className="text-red-600">!</span>}
    </button>
  );
}
