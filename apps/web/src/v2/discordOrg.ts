const KEY = "v2-discord-org";

export type DiscordOrg = {
  appName: string;
  appId: string;
  botToken: string;
  guildId: string;
  guildName: string;
};

export const EMPTY_ORG: DiscordOrg = {
  appName: "Red Party",
  appId: "",
  botToken: "",
  guildId: "",
  guildName: "",
};

export function loadDiscordOrg(): DiscordOrg {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_ORG };
    const parsed = JSON.parse(raw) as Partial<DiscordOrg>;
    return {
      appName: parsed.appName ?? EMPTY_ORG.appName,
      appId: parsed.appId ?? "",
      botToken: parsed.botToken ?? "",
      guildId: parsed.guildId ?? "",
      guildName: parsed.guildName ?? "",
    };
  } catch {
    return { ...EMPTY_ORG };
  }
}

export function saveDiscordOrg(next: DiscordOrg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}
