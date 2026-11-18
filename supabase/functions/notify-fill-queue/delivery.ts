import { discordRequest } from "../_shared/discord.ts";

export type FillDelivery = {
  completion_id: string;
  destination: "channel" | "dm";
  channel_id: string | null;
  discord_id: string;
  completed_name: string;
  delegated: boolean;
  month: string;
  queue: "nitro" | "regular" | "both";
  attempt: number;
};

type Result = {
  status: "pending" | "sent" | "failed";
  code: string | null;
  retry: number;
};
const titles = {
  nitro: "Nitro 50–100",
  regular: "Expresso 50–100",
  both: "250–500",
};
const discordId = /^[0-9]{17,20}$/;
const safeName = (name: string) =>
  name.replace(/[\r\n<>@]/g, " ").replace(/[\\*_~`|]/g, "\\$&").slice(0, 120);
const periodLabel = (month: string) =>
  new Intl.DateTimeFormat("ru", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month));

export function formatFillMessage(
  row: Pick<
    FillDelivery,
    | "destination"
    | "discord_id"
    | "completed_name"
    | "delegated"
    | "month"
    | "queue"
  >,
  scheduleUrl: string,
) {
  const context = `📅 ${titles[row.queue]} · ${periodLabel(row.month)}`;
  const link = `[Открыть расписание](${scheduleUrl})`;
  if (row.destination === "dm") {
    return `✏️ **Ваш ход!**\n${context}\n➡️ ${link}`;
  }
  const player = safeName(row.completed_name);
  const completed = row.delegated
    ? `За игрока **${player}** подтвердили завершение.`
    : `**${player}** завершил планирование.`;
  return `✅ ${completed}\n${context}\n➡️ <@${row.discord_id}>, ваш ход!\n✏️ ${link}`;
}

async function rejected(response: Response): Promise<Result> {
  const body = await response.json().catch(() => ({})) as {
    code?: number;
    retry_after?: number;
  };
  const code = `discord-${
    Number.isInteger(body.code) ? body.code : response.status
  }`;
  const retry = Math.ceil(
    Number(body.retry_after ?? response.headers.get("Retry-After")) || 30,
  );
  return {
    status: response.status === 429 || response.status >= 500
      ? "pending"
      : "failed",
    code,
    retry,
  };
}

export async function deliverFill(
  row: FillDelivery,
  token: string,
  scheduleUrl: string,
  request = discordRequest,
): Promise<Result> {
  if (!token) return { status: "failed", code: "bot-not-configured", retry: 0 };
  if (!discordId.test(row.discord_id)) {
    return { status: "failed", code: "invalid-recipient", retry: 0 };
  }
  let channel = row.channel_id;
  try {
    if (row.destination === "dm") {
      const result = await request(token, "/users/@me/channels", {
        method: "POST",
        body: { recipient_id: row.discord_id },
        signal: AbortSignal.timeout(8000),
      });
      if (!result.ok) return await rejected(result);
      channel = ((await result.json()) as { id?: string }).id ?? null;
    }
    if (!channel || !discordId.test(channel)) {
      return { status: "failed", code: "invalid-channel", retry: 0 };
    }
    const response = await request(token, `/channels/${channel}/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      body: {
        content: formatFillMessage(row, scheduleUrl),
        nonce: row.completion_id.replaceAll("-", "").slice(0, 24) +
          (row.destination === "channel" ? "c" : "d"),
        enforce_nonce: true,
        allowed_mentions: {
          parse: [],
          users: row.destination === "channel" ? [row.discord_id] : [],
        },
      },
    });
    return response.ok
      ? { status: "sent", code: null, retry: 0 }
      : await rejected(response);
  } catch {
    return { status: "pending", code: "discord-network", retry: 30 };
  }
}
