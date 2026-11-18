import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { deliverFill, type FillDelivery } from "./delivery.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: cors });
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !adminKey) return json({ error: "not-configured" }, 503);
  const admin = createClient(url, adminKey);
  const cron = req.headers.get("x-fill-worker-token");
  let user: string | null = null;
  let id: string | null = null;
  if (cron) {
    const { data, error } = await admin.rpc("fill_queue_worker_authorized", {
      p_token: cron,
    });
    if (error || data !== true) return json({ error: "unauthorized" }, 401);
  } else {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const { data, error } = await admin.auth.getUser(authorization.slice(7));
    if (error || !data.user) return json({ error: "unauthorized" }, 401);
    user = data.user.id;
    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string" || !uuid.test(body.id)) {
      return json({ error: "invalid-id" }, 400);
    }
    id = body.id;
  }
  const { data, error } = await admin.rpc("claim_fill_deliveries", {
    p_id: id,
    p_auth_user: user,
  });
  if (error) return json({ error: "claim" }, 500);
  const rows = (data ?? []) as FillDelivery[];
  if (!rows.length) return json({ processed: 0 });
  const { data: secret } = await admin.from("bot_secrets").select("token").eq(
    "bot_id",
    "discord",
  ).maybeSingle();
  const token = String(secret?.token ?? "").trim() ||
    Deno.env.get("DISCORD_BOT_TOKEN")?.trim() || "";
  const scheduleUrl = Deno.env.get("SCHEDULE_SITE_URL")?.trim() ||
    "https://redparty.ru";
  const results = await Promise.all(rows.map(async (row) => {
    const result = await deliverFill(row, token, scheduleUrl);
    return await admin.rpc("finish_fill_delivery", {
      p_id: row.completion_id,
      p_destination: row.destination,
      p_attempt: row.attempt,
      p_status: result.status,
      p_error: result.code,
      p_retry_seconds: result.retry,
    });
  }));
  return results.some((result) => result.error)
    ? json({ error: "record" }, 502)
    : json({ processed: rows.length });
});
