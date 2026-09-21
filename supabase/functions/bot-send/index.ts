import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function discordSend(token: string, target: string, content: string) {
  const channel = await fetch(`https://discord.com/api/v10/channels/${target}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "RedPartySchedule (https://github.com/AlexKhvostov/schedule-app, 1.0)",
    },
    body: JSON.stringify({ content }),
  });
  if (channel.ok) return { sent: true };
  const dm = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "RedPartySchedule (https://github.com/AlexKhvostov/schedule-app, 1.0)",
    },
    body: JSON.stringify({ recipient_id: target }),
  });
  const opened = dm.ok ? ((await dm.json()) as { id?: string }) : null;
  if (!opened?.id) return { error: "discord-target" };
  const msg = await fetch(`https://discord.com/api/v10/channels/${opened.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "RedPartySchedule (https://github.com/AlexKhvostov/schedule-app, 1.0)",
    },
    body: JSON.stringify({ content }),
  });
  if (!msg.ok) return { error: "discord-send" };
  return { sent: true };
}

async function telegramSend(token: string, target: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: target, text }),
  });
  if (!res.ok) return { error: "telegram-send" };
  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json({ error: "unauthorized" }, 401);

  const { data: member } = await supabase.from("members").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!member) return json({ error: "forbidden" }, 403);
  const { data: roles } = await supabase.from("member_roles").select("role_id").eq("member_id", member.id);
  const isRoot = (roles ?? []).some((row) => row.role_id === "root");

  const body = (await req.json().catch(() => null)) as { bot?: unknown; target?: unknown; text?: unknown } | null;
  const bot = String(body?.bot ?? "").trim();
  const target = String(body?.target ?? "").trim();
  const text = String(body?.text ?? "").trim();
  if (bot !== "discord" && bot !== "telegram") return json({ error: "unknown-bot" }, 400);
  if (!target || !text) return json({ error: "empty" }, 400);
  if (!isRoot) return json({ error: "forbidden" }, 403);

  const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = adminKey ? createClient(url, adminKey) : supabase;
  const { data: secret } = await admin.from("bot_secrets").select("token").eq("bot_id", bot).maybeSingle();
  const token =
    String(secret?.token ?? "").trim() ||
    (bot === "discord" ? Deno.env.get("DISCORD_BOT_TOKEN")?.trim() ?? "" : "");
  if (!token) return json({ error: "not-configured" }, 503);

  const result = bot === "telegram" ? await telegramSend(token, target, text) : await discordSend(token, target, text);
  if (result.error) return json({ error: result.error }, 502);
  return json({ sent: true });
});
