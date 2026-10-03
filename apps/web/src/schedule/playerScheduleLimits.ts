import { limitsOfKind, type RoomPlay } from "./members";

export function schedulePlayPairKeys(plays: readonly RoomPlay[], roomId = "winamax") {
  const play = plays.find((row) => row.roomId === roomId);
  const keys = new Set<string>();
  if (!play) return keys;
  for (const variant of ["nitro", "regular"] as const) {
    for (const limit of limitsOfKind(play, variant)) keys.add(`${variant}:${limit}`);
  }
  return keys;
}
