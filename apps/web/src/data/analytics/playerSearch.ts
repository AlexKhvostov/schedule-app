import { createAnalyticsRequest, type AnalyticsMode } from "./http";
import { playerNameKey } from "./playerNames";
export function parsePlayerSuggestions(raw: unknown, query: string): string[] {
  if (!raw || typeof raw !== "object" || !("players" in raw) || !Array.isArray(raw.players) || raw.players.length > 15) throw Error("invalid-player-search");
  const names = raw.players as unknown[];
  if (names.some(n => typeof n !== "string" || !n.trim() || [...n].length > 80 || /[\x00-\x1f]/.test(n))) throw Error("invalid-player-search");
  const unique = new Map<string, string>();
  for (const n of names as string[]) if (playerNameKey(n).includes(playerNameKey(query))) unique.set(playerNameKey(n), n);
  return [...unique.values()];
}
export async function searchPlayers(mode: AnalyticsMode, query: string, signal: AbortSignal): Promise<string[]> {
  const q = query.trim(); signal.throwIfAborted();
  if ([...q].length < 2 || [...q].length > 80 || mode === "unconfigured") return [];
  if (mode === "demo") return Array.from({ length: 16 }, (_, i) => `Demo ${String(i + 1).padStart(2, "0")}`).filter(n => playerNameKey(n).includes(playerNameKey(q))).slice(0, 15);
  return parsePlayerSuggestions(await createAnalyticsRequest()("/api/players/search", new URLSearchParams({ q }), signal), q);
}
