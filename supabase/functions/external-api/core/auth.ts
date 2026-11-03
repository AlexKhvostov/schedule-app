// This integration key is unrelated to Supabase's project API keys or Discord sessions.
export async function keyHash(request: Request): Promise<string> {
  const key = request.headers.get("x-api-key") ?? "";
  if (!/^rp_[a-f0-9]{64}$/.test(key)) throw new Error("invalid_api_key");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
