"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function credentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

function back(params: Record<string, string>): never {
  redirect(`/login?${new URLSearchParams(params)}`);
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(formData));
  if (error) back({ error: error.message });
  redirect("/");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    ...credentials(formData),
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: String(formData.get("full_name") ?? "").trim() || null },
    },
  });
  if (error) back({ error: error.message });
  if (!data.session) back({ message: "Check your email for a confirmation link." });
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
