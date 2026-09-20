export type RoomOption = {
  id: string;
  name: string;
};

export const ROOM_OPTIONS: RoomOption[] = [
  { id: "winamax", name: "Winamax" },
  { id: "pokerstars", name: "PokerStars" },
  { id: "ggpoker", name: "GGPoker" },
];

export function roomName(id: string) {
  return ROOM_OPTIONS.find((row) => row.id === id)?.name ?? id;
}

export function emptyRoomPlay(roomId = "winamax") {
  return {
    id: `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    roomId,
    nick: "",
    limits: [] as string[],
    nitroLimits: [] as string[],
    regularLimits: [] as string[],
    kinds: [] as ("nitro" | "regular")[],
    nickHistory: [] as { nick: string; at: string }[],
  };
}
