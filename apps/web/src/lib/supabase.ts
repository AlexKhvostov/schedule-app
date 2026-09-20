import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function publicEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "",
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "",
  };
}

export function isConfigured() {
  const { url, key } = publicEnv();
  return Boolean(url && key);
}

let cached: SupabaseClient | null = null;

export function getSupabase() {
  const { url, key } = publicEnv();
  if (!url || !key) return null;
  if (!cached) cached = createClient(url, key);
  return cached;
}
