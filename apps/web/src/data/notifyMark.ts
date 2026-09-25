import { getSupabase } from "./client";

function clockOf(half: number) {
  const wrapped = ((half % 48) + 48) % 48;
  const h = Math.floor(wrapped / 2);
  const m = wrapped % 2 ? "30" : "00";
  return `${String(h).padStart(2, "0")}:${m}`;
}

export function slotWhenLabel(slots: { date: string; half: number }[]) {
  if (!slots.length) return "";
  const date = slots[0].date;
  const halves = slots.map((row) => row.half);
  const from = Math.min(...halves);
  const to = Math.max(...halves);
  const [, month, day] = date.split("-");
  const span = from === to ? `${clockOf(from)}–${clockOf(from + 1)}` : `${clockOf(from)}–${clockOf(to + 1)}`;
  return `${day}.${month} ${span} CET`;
}

export async function notifyMarkRemoved(lang: string) {
  const db = getSupabase();
  if (!db) return;
  await db.functions.invoke("notify-mark-removed", {
    body: { lang },
  });
}
