import type { Page, WebSocketRoute } from "@playwright/test";

/** Phoenix v2 join/heartbeat protocol; never contacts a real Supabase project. */
export async function realtimeFixture(page: Page) {
  const sockets = new Set<WebSocketRoute>();
  const joined = new Map<WebSocketRoute, Map<string, string>>();
  let members: Record<string, { metas: Record<string, unknown>[] }> = {};
  let presenceRevision = 0;
  const state = {
    online: true,
    tracked: [] as Record<string, unknown>[],
    disconnect: () => { state.online = false; sockets.forEach(socket => socket.close()); sockets.clear(); joined.clear(); },
    broadcast: (event: string, payload: Record<string, unknown> = {}) => {
      for (const [socket, topics] of joined) for (const [topic, joinRef] of topics) {
        if (topic === "realtime:app:changes") socket.send(JSON.stringify([joinRef, null, topic, "broadcast", { event, payload }]));
      }
    },
    presence: (rows: { member_id: string; nick: string; profile_name?: string; avatar_url?: string }[]) => {
      ++presenceRevision;
      members = Object.fromEntries(rows.map((row, index) => [`connection-${index}`, { metas: [{ ...row, phx_ref: `ref-${presenceRevision}-${index}` }] }]));
      for (const [socket, topics] of joined) for (const [topic, joinRef] of topics) {
        if (topic === "realtime:app:changes") socket.send(JSON.stringify([joinRef, null, topic, "presence_state", members]));
      }
    },
  };
  await page.routeWebSocket("wss://schedule-fixture.supabase.co/**", socket => {
    if (!state.online) { socket.close(); return; }
    sockets.add(socket);
    joined.set(socket, new Map());
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const [joinRef, ref, topic, event, payload] = JSON.parse(message);
      if (event === "phx_join" || event === "heartbeat" || event === "phx_leave") {
        if (event === "phx_join") joined.get(socket)?.set(topic, joinRef);
        if (event === "phx_leave") joined.get(socket)?.delete(topic);
        socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {
          postgres_changes: (payload?.config?.postgres_changes ?? []).map((filter: object, id: number) => ({ ...filter, id })),
        } }]));
        if (event === "phx_join") socket.send(JSON.stringify([joinRef, null, topic, "presence_state", members]));
      } else if (event === "presence") {
        if (payload?.event === "track") state.tracked.push(payload.payload);
        socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
      }
    });
  });
  return state;
}
