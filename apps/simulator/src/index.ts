import { createClient } from "@supabase/supabase-js";
import { vitalsInput, type VitalsInput } from "@wardwatch/shared";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in apps/simulator/.env");
  process.exit(1);
}

const TICK_MS = Number(process.env.SIM_TICK_MS ?? 5000);
const DETERIORATION_CHANCE = Number(process.env.SIM_DETERIORATION_CHANCE ?? 0.03);

const supabase = createClient(url, key, { auth: { persistSession: false } });

type Vitals = Omit<VitalsInput, "patient_id" | "recorded_at" | "source">;

const healthy: Vitals = { heart_rate: 75, resp_rate: 15, spo2: 98, systolic_bp: 125, temperature: 36.8 };
const sick: Vitals = { heart_rate: 135, resp_rate: 27, spo2: 88, systolic_bp: 88, temperature: 39.4 };

interface PatientState {
  current: Vitals;
  deteriorating: number;
}

const jitter = (n: number) => (Math.random() - 0.5) * 2 * n;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function step(state: PatientState): Vitals {
  const target = state.deteriorating > 0 ? sick : healthy;
  const pull = state.deteriorating > 0 ? 0.25 : 0.15;
  const next = {} as Vitals;
  for (const k of Object.keys(healthy) as (keyof Vitals)[]) {
    const noise = { heart_rate: 3, resp_rate: 1, spo2: 0.7, systolic_bp: 4, temperature: 0.1 }[k];
    next[k] = state.current[k] + (target[k] - state.current[k]) * pull + jitter(noise);
  }
  state.current = next;
  if (state.deteriorating > 0) state.deteriorating--;
  else if (Math.random() < DETERIORATION_CHANCE) state.deteriorating = 8 + Math.floor(Math.random() * 8);

  return {
    heart_rate: Math.round(clamp(next.heart_rate, 30, 220)),
    resp_rate: Math.round(clamp(next.resp_rate, 5, 50)),
    spo2: Math.round(clamp(next.spo2, 70, 100)),
    systolic_bp: Math.round(clamp(next.systolic_bp, 60, 240)),
    temperature: Math.round(clamp(next.temperature, 34, 42) * 10) / 10,
  };
}

async function main() {
  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, display_name")
    .is("discharged_at", null);
  if (error) throw error;
  if (!patients?.length) {
    console.error("No admitted patients found. Seed the database first.");
    process.exit(1);
  }

  const states = new Map<string, PatientState>(
    patients.map((p) => [p.id, { current: { ...healthy }, deteriorating: 0 }]),
  );
  console.log(`Simulating ${patients.length} patients every ${TICK_MS} ms. Ctrl+C to stop.`);

  const tick = async () => {
    const rows = patients.map((p) => {
      const state = states.get(p.id)!;
      return vitalsInput.parse({ patient_id: p.id, source: "simulator", ...step(state) });
    });
    const { error } = await supabase.from("vitals").insert(rows);
    if (error) return console.error("insert failed:", error.message);

    const worsening = patients.filter((p) => states.get(p.id)!.deteriorating > 0).map((p) => p.display_name);
    console.log(`${new Date().toLocaleTimeString()}  ${rows.length} readings` +
      (worsening.length ? `  deteriorating: ${worsening.join(", ")}` : ""));
  };

  await tick();
  setInterval(tick, TICK_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
