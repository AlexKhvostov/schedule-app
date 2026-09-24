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

async function discord<T>(token: string, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "RedPartySchedule (https://github.com/AlexKhvostov/schedule-app, 1.0)",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { message: text };
  }
  if (!res.ok) {
    const message =
      typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message: string }).message) : text;
    return { error: message || `discord ${res.status}`, status: res.status };
  }
  return { data: parsed as T, status: res.status };
}

async function botToken(admin: ReturnType<typeof createClient>, bot: string, fallback: string) {
  const { data } = await admin.from("bot_secrets").select("token").eq("bot_id", bot).maybeSingle();
  return String(data?.token ?? "").trim() || fallback;
}

async function dm(token: string, uid: string, content: string) {
  const channel = await discord<{ id: string }>(token, "/users/@me/channels", {
    method: "POST",
    body: { recipient_id: uid },
  });
  if (channel.error || !channel.data?.id) return false;
  const msg = await discord(token, `/channels/${channel.data.id}/messages`, {
    method: "POST",
    body: { content },
  });
  return !msg.error;
}

function mention(uid: string | undefined, name: string) {
  if (uid) return `<@${uid}>`;
  return name.trim() || "—";
}

function markOf(tag: string, who: string) {
  const chip = tag.trim().toUpperCase();
  return chip ? `**${chip}** · ${who}` : who;
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

  const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = adminKey ? createClient(url, adminKey) : supabase;

  const { data: club } = await admin
    .from("bot_settings")
    .select("notify_mark_removed, notice_chat")
    .eq("id", "discord")
    .maybeSingle();
  if (!club?.notify_mark_removed) return json({ sent: 0, skipped: "off" });

  const body = (await req.json().catch(() => null)) as {
    owners?: unknown;
    memberIds?: unknown;
    actorMemberId?: unknown;
    actorName?: unknown;
    ownerNames?: unknown;
    kind?: unknown;
    when?: unknown;
    limit?: unknown;
    lang?: unknown;
  } | null;

  const actorId = String(body?.actorMemberId ?? "").trim();
  const owners: { id: string; name: string; tag: string }[] = [];
  if (Array.isArray(body?.owners)) {
    for (const row of body.owners) {
      if (!row || typeof row !== "object") continue;
      const id = String((row as { id?: unknown }).id ?? "").trim();
      if (!id || id === actorId) continue;
      const name = String((row as { name?: unknown }).name ?? "").trim();
      const tag = String((row as { tag?: unknown }).tag ?? "").trim();
      if (!owners.some((item) => item.id === id)) owners.push({ id, name, tag });
    }
  } else {
    const ids = [...new Set((Array.isArray(body?.memberIds) ? body.memberIds : []).map((id) => String(id).trim()).filter(Boolean))];
    const names = Array.isArray(body?.ownerNames) ? body.ownerNames.map((name) => String(name).trim()) : [];
    ids.forEach((id, index) => {
      if (id && id !== actorId && !owners.some((item) => item.id === id)) owners.push({ id, name: names[index] || "", tag: "" });
    });
  }
  if (!owners.length) return json({ sent: 0 });

  const token = await botToken(admin, "discord", Deno.env.get("DISCORD_BOT_TOKEN")?.trim() ?? "");
  if (!token) return json({ error: "not-configured" }, 503);

  const involved = [...owners.map((row) => row.id), ...(actorId ? [actorId] : [])];
  const { data: idents } = await admin
    .from("identities")
    .select("member_id, provider, provider_uid")
    .in("member_id", involved)
    .eq("provider", "discord");
  const uidByMember = new Map<string, string>();
  for (const row of idents ?? []) {
    const uid = String(row.provider_uid ?? "").trim();
    if (uid) uidByMember.set(row.member_id, uid);
  }

  const en = String(body?.lang ?? "").startsWith("en");
  const when = String(body?.when ?? "").trim();
  const limit = String(body?.limit ?? "").trim();
  const slot = [limit, when].filter(Boolean).join(" · ");
  const actorName = String(body?.actorName ?? "").trim() || (en ? "the club" : "клуб");
  const actorWho = mention(uidByMember.get(actorId), actorName);
  const marksLabel = owners.map((row) => markOf(row.tag, mention(uidByMember.get(row.id), row.name))).join(", ");
  const ownersLabel = owners.map((row) => row.name).filter(Boolean).join(", ") || (en ? "a player" : "игрок");
  const tagsLabel = owners.map((row) => row.tag.trim().toUpperCase()).filter(Boolean).join(", ");

  const channelLines = en
    ? [`Mark removed: ${marksLabel}`, slot ? `Slot: ${slot}` : "", `By: ${actorWho}`].filter(Boolean)
    : [`Удалена метка: ${marksLabel}`, slot ? `Слот: ${slot}` : "", `Снял: ${actorWho}`].filter(Boolean);

  const ownerDm = en
    ? ["Your schedule mark was removed.", slot ? `Slot: ${slot}` : "", `By: ${actorName}.`].filter(Boolean).join("\n")
    : ["Вашу метку сняли с расписания.", slot ? `Слот: ${slot}` : "", `Снял: ${actorName}.`].filter(Boolean).join("\n");

  const actorDm = en
    ? [`You removed mark ${tagsLabel ? `${tagsLabel} (${ownersLabel})` : ownersLabel}.`, slot ? `Slot: ${slot}` : ""].filter(Boolean).join("\n")
    : [`Вы сняли метку ${tagsLabel ? `${tagsLabel} (${ownersLabel})` : ownersLabel}.`, slot ? `Слот: ${slot}` : ""].filter(Boolean).join("\n");

  const noticeChat = String(club.notice_chat ?? "").trim();
  let channel = 0;
  if (noticeChat) {
    const posted = await discord(token, `/channels/${noticeChat}/messages`, {
      method: "POST",
      body: { content: channelLines.join("\n") },
    });
    if (!posted.error) channel = 1;
  }

  let sent = 0;
  for (const owner of owners) {
    const uid = uidByMember.get(owner.id);
    if (!uid) continue;
    if (await dm(token, uid, ownerDm)) sent += 1;
  }
  if (actorId) {
    const uid = uidByMember.get(actorId);
    if (uid && (await dm(token, uid, actorDm))) sent += 1;
  }

  return json({ sent, channel });
});
