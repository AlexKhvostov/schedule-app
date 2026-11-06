import { parsePlayerNames } from "./pointsFilters";
import { playerNameKey } from "../../data/analytics/playerNames";
export function playerToken(value: string, cursor: number, single = false) {
  const caret = Math.max(0, Math.min(cursor, value.length));
  const before = value.slice(0, caret);
  let start = single ? 0 : Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf("\n"), before.lastIndexOf("\r")) + 1;
  const next = single ? -1 : value.slice(caret).search(/[,;\r\n]/);
  let end = next < 0 ? value.length : caret + next;
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;
  return { start, end, query: value.slice(start, end), excluded: single ? [] : parsePlayerNames(value.slice(0, start) + "," + value.slice(end)).map(playerNameKey) };
}
export function pickPlayer(value: string, cursor: number, name: string, single = false) {
  if (single) return { value: name, cursor: name.length };
  const token = playerToken(value, cursor);
  const prefix = value.slice(0, token.start), suffix = value.slice(token.end);
  const tail = suffix.trim() ? suffix : ", ";
  return { value: prefix + name + tail, cursor: prefix.length + name.length + (suffix.trim() ? 0 : 2) };
}
