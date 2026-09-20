import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isLiveData, supabaseAnonKey, supabaseUrl } from "./config";

let cached: SupabaseClient | null = null;

export function getSupabase() {
  if (!isLiveData()) return null;
  if (!cached) cached = createClient(supabaseUrl(), supabaseAnonKey());
  return cached;
}
