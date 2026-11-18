import { deepStrictEqual, equal, match, notEqual } from "node:assert/strict";
import { deliverFill, type FillDelivery } from "./delivery.ts";
import type { discordRequest } from "../_shared/discord.ts";

const row: FillDelivery = {
  completion_id: "00000001-0000-4000-8000-000000000001",
  destination: "channel",
  channel_id: "999990000000000099",
  discord_id: "999990000000000022",
  completed_name: "A @everyone",
  delegated: true,
  month: "2026-11-01",
  queue: "nitro",
  attempt: 1,
};

Deno.test("channel mentions only the next player and has a stable delivery nonce", async () => {
  const requests: Array<
    {
      path: string;
      body: {
        content: string;
        nonce: string;
        enforce_nonce: boolean;
        allowed_mentions: unknown;
      };
    }
  > = [];
  const request: typeof discordRequest = (_token, path, init) => {
    requests.push({
      path,
      body: init?.body as typeof requests[number]["body"],
    });
    return Promise.resolve(Response.json({ id: "message" }));
  };
  equal(
    (await deliverFill(row, "test-token", "https://schedule.example", request))
      .status,
    "sent",
  );
  await deliverFill(
    { ...row, attempt: 2 },
    "test-token",
    "https://schedule.example",
    request,
  );
  equal(requests[0].path, "/channels/999990000000000099/messages");
  deepStrictEqual(requests[0].body.allowed_mentions, {
    parse: [],
    users: [row.discord_id],
  });
  equal(requests[0].body.enforce_nonce, true);
  equal(requests[0].body.nonce, requests[1].body.nonce);
  const [completion, period, next, link] = requests[0].body.content.split("\n");
  match(completion, /^✅ За игрока \*\*.*\*\* подтвердили завершение\.$/);
  match(period, /^📅 Nitro 50–100 · ноябрь 2026/);
  equal(next, "➡️ <@999990000000000022>, ваш ход!");
  equal(link, "✏️ [Открыть расписание](https://schedule.example)");
});

Deno.test("private delivery opens a DM and records a privacy refusal independently", async () => {
  const calls: Array<
    {
      path: string;
      body: {
        nonce?: string;
        recipient_id?: string;
        content?: string;
        allowed_mentions?: unknown;
      };
    }
  > = [];
  const request: typeof discordRequest = (_token, path, init) => {
    calls.push({ path, body: init?.body as typeof calls[number]["body"] });
    return Promise.resolve(
      path === "/users/@me/channels"
        ? Response.json({ id: "999990000000000044" })
        : Response.json({ code: 50007 }, { status: 403 }),
    );
  };
  const result = await deliverFill(
    { ...row, destination: "dm" },
    "test-token",
    "https://schedule.example",
    request,
  );
  deepStrictEqual(result, {
    status: "failed",
    code: "discord-50007",
    retry: 30,
  });
  equal(calls[0].body.recipient_id, row.discord_id);
  equal(calls[1].path, "/channels/999990000000000044/messages");
  notEqual(calls[1].body.nonce?.slice(-1), "c");
  const [title, period, link] = calls[1].body.content!.split("\n");
  equal(title, "✏️ **Ваш ход!**");
  match(period, /^📅 Nitro 50–100 · ноябрь 2026/);
  equal(link, "➡️ [Открыть расписание](https://schedule.example)");
  deepStrictEqual(calls[1].body.allowed_mentions, { parse: [], users: [] });
});

Deno.test("a rate limit is retried after the platform delay", async () => {
  const result = await deliverFill(
    row,
    "test-token",
    "https://schedule.example",
    () =>
      Promise.resolve(Response.json({ retry_after: 12.5 }, { status: 429 })),
  );
  deepStrictEqual(result, {
    status: "pending",
    code: "discord-429",
    retry: 13,
  });
});
