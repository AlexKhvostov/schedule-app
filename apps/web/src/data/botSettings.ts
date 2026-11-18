import { getSupabase } from "./client";
import type { RosterKind } from "../schedule/rosterPriorities";

export type BotId = "discord" | "telegram";
export type NotifyChannel = "discord" | "telegram" | "email";

export type BotRow = {
  id: BotId;
  appName: string;
  appId: string;
  botUsername: string;
  guildId: string;
  noticeChat: string;
  notifyMarkRemoved: boolean;
  notifyFillQueue: boolean;
  fillChannels: Record<RosterKind, string>;
  hasToken: boolean;
};

const EMPTY: Record<BotId, BotRow> = {
  discord: {
    id: "discord",
    appName: "Red Party",
    appId: "",
    botUsername: "",
    guildId: "",
    noticeChat: "",
    notifyMarkRemoved: true,
    notifyFillQueue: false,
    fillChannels: { nitro: "", regular: "", both: "" },
    hasToken: false,
  },
  telegram: {
    id: "telegram",
    appName: "",
    appId: "",
    botUsername: "",
    guildId: "",
    noticeChat: "",
    notifyMarkRemoved: false,
    notifyFillQueue: false,
    fillChannels: { nitro: "", regular: "", both: "" },
    hasToken: false,
  },
};

function pack(id: BotId, row: Record<string, unknown> | null | undefined, hasToken: boolean): BotRow {
  const channels = row?.fill_channels as Partial<BotRow["fillChannels"]> | undefined;
  return {
    ...EMPTY[id],
    appName: String(row?.app_name ?? EMPTY[id].appName),
    appId: String(row?.app_id ?? ""),
    botUsername: String(row?.bot_username ?? ""),
    guildId: String(row?.guild_id ?? ""),
    noticeChat: String(row?.notice_chat ?? ""),
    notifyMarkRemoved: Boolean(row?.notify_mark_removed ?? EMPTY[id].notifyMarkRemoved),
    notifyFillQueue: Boolean(row?.notify_fill_queue),
    fillChannels: { nitro: channels?.nitro ?? "", regular: channels?.regular ?? "", both: channels?.both ?? "" },
    hasToken,
  };
}

const DEMO_FILL_BOT_KEY = "redparty.demo.fill-discord.v1";
function demoDiscord(): BotRow {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_FILL_BOT_KEY) ?? "null") as Partial<BotRow> | null;
    return { ...EMPTY.discord, ...saved };
  } catch { return { ...EMPTY.discord }; }
}

export async function saveDiscordFillSettings(enabled: boolean, input: BotRow["fillChannels"]) {
  const fillChannels = { nitro: input.nitro.trim(), regular: input.regular.trim(), both: input.both.trim() };
  if (Object.values(fillChannels).some(value => value && !/^\d{17,20}$/.test(value))) return { error: "invalid-channel" };
  const db = getSupabase();
  if (!db) {
    localStorage.setItem(DEMO_FILL_BOT_KEY, JSON.stringify({ notifyFillQueue: enabled, fillChannels }));
    return { error: null };
  }
  const { error } = await db.from("bot_settings").update({ notify_fill_queue: enabled, fill_channels: fillChannels }).eq("id", "discord");
  return { error: error?.message ?? null };
}

export async function loadBots(): Promise<Record<BotId, BotRow>> {
  const db = getSupabase();
  if (!db) return { discord: demoDiscord(), telegram: { ...EMPTY.telegram } };
  const [{ data: rows }, { data: flags }] = await Promise.all([
    db.from("bot_settings").select("*"),
    db.rpc("bot_token_flags"),
  ]);
  const has = new Map((flags ?? []).map((row: { bot_id: string; has_token: boolean }) => [row.bot_id, Boolean(row.has_token)]));
  const found = new Map((rows ?? []).map((row) => [row.id, row]));
  return {
    discord: pack("discord", found.get("discord"), Boolean(has.get("discord"))),
    telegram: pack("telegram", found.get("telegram"), Boolean(has.get("telegram"))),
  };
}

export async function saveBotConfig(
  bot: BotId,
  patch: {
    appName: string;
    appId: string;
    botUsername: string;
    guildId: string;
    noticeChat: string;
    token?: string;
  },
) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db
    .from("bot_settings")
    .update({
      app_name: patch.appName.trim(),
      app_id: patch.appId.trim(),
      bot_username: patch.botUsername.trim(),
      guild_id: patch.guildId.trim(),
      notice_chat: patch.noticeChat.trim(),
    })
    .eq("id", bot);
  if (error) return { error: error.message };
  const token = patch.token?.trim();
  if (token) {
    const { error: tokenError } = await db.rpc("set_bot_token", { p_bot: bot, p_token: token });
    if (tokenError) return { error: tokenError.message };
  }
  return { error: null };
}

export async function saveBotFlag(bot: BotId, column: "notify_mark_removed" | "notify_fill_queue", value: boolean) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.from("bot_settings").update({ [column]: value }).eq("id", bot);
  return { error: error?.message ?? null };
}

export async function sendBotMessage(input: { bot: BotId; target: string; text: string }) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { data, error } = await db.functions.invoke<{ error?: string; sent?: boolean }>("bot-send", {
    body: { bot: input.bot, target: input.target.trim(), text: input.text.trim() },
  });
  if (error) return { error: error.message };
  if (data && "error" in data && data.error) return { error: String(data.error) };
  return { error: null };
}
