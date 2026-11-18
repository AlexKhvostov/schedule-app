export function discordRequest(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
) {
  return fetch(`https://discord.com/api/v10${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent":
        "RedPartySchedule (https://github.com/AlexKhvostov/schedule-app, 1.0)",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: init?.signal,
  });
}
