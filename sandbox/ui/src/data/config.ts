export function supabaseUrl() {
  return import.meta.env.VITE_SUPABASE_URL?.trim() || "";
}

export function supabaseAnonKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "";
}

export function isLiveData() {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
