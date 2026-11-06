import type { Page, WebSocketRoute } from "@playwright/test";

/** Phoenix v2 join/heartbeat protocol; never contacts a real Supabase project. */
export async function realtimeFixture(page: Page) {
  const sockets = new Set<WebSocketRoute>();
  const state = { online: true, disconnect: () => { state.online = false; sockets.forEach(socket => socket.close()); sockets.clear(); } };
  await page.routeWebSocket("wss://schedule-fixture.supabase.co/**", socket => {
    if (!state.online) { socket.close(); return; }
    sockets.add(socket);
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const [joinRef, ref, topic, event, payload] = JSON.parse(message);
      if (event === "phx_join" || event === "heartbeat" || event === "phx_leave") {
        socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {
          postgres_changes: (payload?.config?.postgres_changes ?? []).map((filter: object, id: number) => ({ ...filter, id })),
        } }]));
      }
    });
  });
  return state;
}
