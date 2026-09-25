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
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
    if (res.ok) return { data: parsed as T, status: res.status };

    const message =
      typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message: string }).message) : text;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 2) return { error: message || `discord ${res.status}`, status: res.status };

    const retryAfter =
      typeof parsed === "object" && parsed && "retry_after" in parsed
        ? Number((parsed as { retry_after?: unknown }).retry_after)
        : Number.NaN;
    const delayMs = Number.isFinite(retryAfter)
      ? Math.min(2000, Math.max(100, retryAfter * 1000))
      : 250 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { error: "discord retry exhausted", status: 503 };
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
  if (channel.error || !channel.data?.id) return { ok: false, error: `dm-channel-${channel.status}` };
  const msg = await discord(token, `/channels/${channel.data.id}/messages`, {
    method: "POST",
    body: { content },
  });
  return msg.error ? { ok: false, error: `dm-message-${msg.status}` } : { ok: true as const };
}

function mention(uid: string | undefined, name: string) {
  if (uid) return `<@${uid}>`;
  return name.trim() || "—";
}

function markOf(tag: string, who: string) {
  const chip = tag.trim().toUpperCase();
  return chip ? `**${chip}** · ${who}` : who;
}

type RemovalEvent = {
  event_id: string;
  member_id: string;
  slot_date: string;
  half: number;
  level: number;
  limit_id: string;
  variant_id: string;
};

function clock(half: number) {
  const wrapped = ((half % 48) + 48) % 48;
  return `${String(Math.floor(wrapped / 2)).padStart(2, "0")}:${wrapped % 2 ? "30" : "00"}`;
}

function eventLabel(rows: RemovalEvent[]) {
  const first = rows[0];
  if (!first) return "";
  const halves = rows.map((row) => row.half);
  const from = Math.min(...halves);
  const to = Math.max(...halves) + 1;
  const [, month, day] = first.slot_date.split("-");
  const kinds = [...new Set(rows.map((row) => `${row.variant_id} ${row.limit_id}`))].join(", ");
  return `${kinds} · ${day}.${month} ${clock(from)}–${clock(to)} CET`;
}

type DeliveryStatus = "delivered" | "partial" | "failed" | "skipped";

async function recordDelivery(
  admin: ReturnType<typeof createClient>,
  eventIds: string[],
  result: {
    status: DeliveryStatus;
    channelSent: boolean;
    dmSent: number;
    dmFailed: number;
    errors: string[];
  },
) {
  if (!eventIds.length) return null;
  const { error } = await admin
    .from("occupancy_event_notifications")
    .update({
      delivery_status: result.status,
      channel_sent: result.channelSent,
      dm_sent: result.dmSent,
      dm_failed: result.dmFailed,
      completed_at: new Date().toISOString(),
      last_error: result.errors.length ? { codes: result.errors } : null,
    })
    .in("event_id", eventIds);
  return error?.message ?? null;
}

function logDelivery(level: "info" | "error", event: string, data: Record<string, unknown>) {
  const line = JSON.stringify({ event, ...data });
  if (level === "error") console.error(line);
  else console.info(line);
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
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
  if (!adminKey) return json({ error: "not-configured" }, 503);
  const admin = createClient(url, adminKey, { auth: { persistSession: false } });

  const { data: club } = await admin
    .from("bot_settings")
    .select("notify_mark_removed, notice_chat")
    .eq("id", "discord")
    .maybeSingle();
  if (!club?.notify_mark_removed) return json({ sent: 0, skipped: "off" });

  const body = (await req.json().catch(() => null)) as { lang?: unknown } | null;
  const { data: actor } = await admin
    .from("members")
    .select("id,public_code,mark_tag")
    .eq("auth_user_id", auth.user.id)
    .eq("access_status", "active")
    .maybeSingle();
  if (!actor) return json({ error: "forbidden" }, 403);

  const { data: claimed, error: claimError } = await admin.rpc("claim_recent_removal_notifications", {
    p_actor: actor.id,
  });
  if (claimError) return json({ error: "claim", detail: claimError.message }, 500);
  const events = (claimed ?? []) as RemovalEvent[];
  if (!events.length) {
    logDelivery("info", "removal_notification_skipped", { requestId, reason: "no-events" });
    return json({ sent: 0, skipped: "no-events", requestId });
  }
  const eventIds = events.map((row) => row.event_id);

  const ownerIds = [...new Set(events.map((row) => row.member_id))];
  const involved = [...new Set([...ownerIds, actor.id])];
  const [{ data: members }, { data: idents }] = await Promise.all([
    admin.from("members").select("id,public_code,mark_tag").in("id", involved),
    admin
      .from("identities")
      .select("member_id,provider_uid,username,display_name,guild_nick")
      .in("member_id", involved)
      .eq("provider", "discord"),
  ]);
  const memberById = new Map((members ?? []).map((row) => [row.id, row]));
  const identByMember = new Map((idents ?? []).map((row) => [row.member_id, row]));
  const owners = ownerIds.map((id) => {
    const member = memberById.get(id);
    const ident = identByMember.get(id);
    return {
      id,
      name: ident?.guild_nick || ident?.display_name || ident?.username || member?.public_code || "—",
      tag: member?.mark_tag || "",
    };
  });
  const actorIdent = identByMember.get(actor.id);
  const actorName =
    actorIdent?.guild_nick || actorIdent?.display_name || actorIdent?.username || actor.public_code || "—";

  const token = await botToken(admin, "discord", Deno.env.get("DISCORD_BOT_TOKEN")?.trim() ?? "");
  if (!token) {
    const auditError = await recordDelivery(admin, eventIds, {
      status: "failed",
      channelSent: false,
      dmSent: 0,
      dmFailed: 0,
      errors: ["bot-token-missing"],
    });
    logDelivery("error", "removal_notification_failed", {
      requestId,
      eventCount: events.length,
      reason: "bot-token-missing",
      auditWriteFailed: Boolean(auditError),
    });
    return json({ error: "not-configured", requestId }, 503);
  }

  const uidByMember = new Map<string, string>();
  for (const row of idents ?? []) {
    const uid = String(row.provider_uid ?? "").trim();
    if (uid) uidByMember.set(row.member_id, uid);
  }

  const en = String(body?.lang ?? "").startsWith("en");
  const slot = eventLabel(events);
  const actorWho = mention(uidByMember.get(actor.id), actorName);
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
  const errors: string[] = [];
  let attempted = 0;
  if (noticeChat) {
    attempted += 1;
    const posted = await discord(token, `/channels/${noticeChat}/messages`, {
      method: "POST",
      body: {
        content: channelLines.join("\n"),
        allowed_mentions: { parse: [], users: involved.map((id) => uidByMember.get(id)).filter(Boolean) },
      },
    });
    if (!posted.error) channel = 1;
    else errors.push(`channel-message-${posted.status}`);
  }

  let sent = 0;
  for (const owner of owners) {
    const uid = uidByMember.get(owner.id);
    if (!uid) continue;
    attempted += 1;
    const delivered = await dm(token, uid, ownerDm);
    if (delivered.ok) sent += 1;
    else errors.push(delivered.error);
  }
  if (actor.id) {
    const uid = uidByMember.get(actor.id);
    if (uid) {
      attempted += 1;
      const delivered = await dm(token, uid, actorDm);
      if (delivered.ok) sent += 1;
      else errors.push(delivered.error);
    }
  }

  const successes = sent + channel;
  const status: DeliveryStatus = !attempted
    ? "skipped"
    : errors.length
      ? successes
        ? "partial"
        : "failed"
      : "delivered";
  const auditError = await recordDelivery(admin, eventIds, {
    status,
    channelSent: channel === 1,
    dmSent: sent,
    dmFailed: errors.filter((code) => code.startsWith("dm-")).length,
    errors,
  });
  logDelivery(auditError ? "error" : status === "failed" || status === "partial" ? "error" : "info", "removal_notification_completed", {
    requestId,
    status,
    eventCount: events.length,
    channelSent: channel === 1,
    dmSent: sent,
    dmFailed: errors.filter((code) => code.startsWith("dm-")).length,
    auditWriteFailed: Boolean(auditError),
  });

  return json({ sent, channel, failed: errors.length, status, requestId });
});
