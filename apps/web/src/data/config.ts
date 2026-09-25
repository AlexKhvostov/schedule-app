const DEV_SANDBOX_KEY = "v2-dev-sandbox";

export function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

export function supabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
}

export function isLiveData() {
  return Boolean(supabaseUrl() && supabaseAnonKey()) && !isDevSandboxEnabled();
}

export function devLoginAvailable() {
  return process.env.NODE_ENV === "development";
}

export function isDevSandboxEnabled() {
  if (!devLoginAvailable() || typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(DEV_SANDBOX_KEY) === "1";
}

export function enableDevSandbox() {
  if (devLoginAvailable()) sessionStorage.setItem(DEV_SANDBOX_KEY, "1");
}

export function disableDevSandbox() {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(DEV_SANDBOX_KEY);
}
