import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("./client", () => ({ getSupabase: () => mock.db }));
const cleanup: (() => void)[] = [];
beforeEach(() => vi.resetModules());
afterEach(() => { cleanup.splice(0).forEach(off => off()); });

function setup() {
  const channels: ReturnType<typeof makeChannel>[] = [];
  function makeChannel() {
    let status!: (value: string) => void;
    const handlers = new Map<string, (payload?: unknown) => void>();
    const live = {
      on: vi.fn((type: string, filter: {event: string}, fn: (payload?: unknown) => void) => { handlers.set(`${type}:${filter.event}`, fn); return live; }),
      subscribe: vi.fn((fn: typeof status) => { status = fn; return live; }),
      track: vi.fn(async () => "ok"), untrack: vi.fn(async () => "ok"),
      presenceState: vi.fn(() => ({})),
      status: (value: string) => status(value), handlers,
    };
    return live;
  }
  let auth!: (event: string, session: {user: {id: string}} | null) => void;
  const db = {
    auth: {
      onAuthStateChange: vi.fn((callback: typeof auth) => { auth = callback; return {data: {subscription: {unsubscribe: vi.fn()}}}; }),
      getSession: vi.fn(async () => ({data: {session: {user: {id: "account-a"}}}})),
    },
    realtime: {stateChangeCallbacks: {open: [] as [string, () => void][]}},
    channel: vi.fn(() => { const live = makeChannel(); channels.push(live); return live; }),
    removeChannel: vi.fn(async () => "ok"),
  };
  mock.db = db;
  return {db, channels, auth: (id: string | null) => auth("SIGNED_IN", id ? {user:{id}} : null)};
}

it("shares one private channel and releases it after the final owner leaves", async () => {
  const {db, channels} = setup();
  const app = await import("./appRealtime");
  const offChange = app.subscribeAppChanges(vi.fn());
  const states = vi.fn(); const offState = app.subscribeAppConnection(states);
  const offPeople = app.subscribeAppPresence(vi.fn());
  await app.getAppAccount();
  expect(db.channel).toHaveBeenCalledExactlyOnceWith("app:changes", {config:{private:true}});
  expect(app.getAppConnection()).toBe("connecting");
  channels[0].status("SUBSCRIBED");
  expect(app.getAppConnection()).toBe("online");
  offChange(); offState(); expect(db.removeChannel).not.toHaveBeenCalled();
  offPeople(); expect(db.removeChannel).toHaveBeenCalledOnce();
  expect(db.realtime.stateChangeCallbacks.open).toHaveLength(0);
});

it("publishes minimal Presence once, deduplicates tabs, and drops stale people on disconnect", async () => {
  const {channels} = setup(); const app = await import("./appRealtime");
  const people = vi.fn(); cleanup.push(app.subscribeAppPresence(people));
  cleanup.push(app.publishAppPresence({member_id:"a",nick:"Alice"}));
  await app.getAppAccount(); channels[0].status("SUBSCRIBED");
  expect(channels[0].track).toHaveBeenCalledExactlyOnceWith({member_id:"a",nick:"Alice"});
  const data = {tab1:[{member_id:"a",nick:"Alice"}],tab2:[{member_id:"a",nick:"Alice"},{member_id:"b",nick:" Bob "},{nick:"bad"}]};
  channels[0].presenceState.mockReturnValue(data);
  channels[0].handlers.get("presence:sync")?.();
  expect(people).toHaveBeenLastCalledWith([{member_id:"a",nick:"Alice"},{member_id:"b",nick:"Bob"}]);
  channels[0].status("CHANNEL_ERROR"); expect(people).toHaveBeenLastCalledWith([]);
});

it("ignores the previous account's events and does not publish its identity into the new channel", async () => {
  const {channels,auth,db} = setup(); const app = await import("./appRealtime");
  const changed = vi.fn(); cleanup.push(app.subscribeAppChanges(changed));
  cleanup.push(app.publishAppPresence({member_id:"a",nick:"Alice"}));
  await app.getAppAccount(); channels[0].status("SUBSCRIBED"); auth("account-b");
  expect(db.removeChannel).toHaveBeenCalledOnce(); expect(channels).toHaveLength(2);
  channels[0].handlers.get("broadcast:config")?.({payload:{}}); expect(changed).not.toHaveBeenCalled();
  channels[1].status("SUBSCRIBED"); expect(channels[1].track).not.toHaveBeenCalled();
  channels[1].handlers.get("broadcast:config")?.({payload:{}}); expect(changed).toHaveBeenCalledWith({domain:"config"});
});

it("does not let a delayed session read resurrect a signed-out account", async () => {
  const {db,auth} = setup(); let finish!: (value: Awaited<ReturnType<typeof db.auth.getSession>>) => void;
  db.auth.getSession.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const app = await import("./appRealtime"); cleanup.push(app.subscribeAppConnection(vi.fn()));
  auth(null); finish({data:{session:{user:{id:"old-account"}}}}); await Promise.resolve();
  expect(app.getAppAccountKey()).toBeNull(); expect(db.channel).not.toHaveBeenCalled();
});

it("shows reconnect only after the transport opens and online only after channel acknowledgement", async () => {
  const {db,channels} = setup(); const app = await import("./appRealtime");
  cleanup.push(app.subscribeAppConnection(vi.fn())); await app.getAppAccount();
  channels[0].status("SUBSCRIBED"); channels[0].status("CHANNEL_ERROR"); expect(app.getAppConnection()).toBe("offline");
  db.realtime.stateChangeCallbacks.open.forEach(([,fn]) => fn()); expect(app.getAppConnection()).toBe("connecting");
  channels[0].status("SUBSCRIBED"); expect(app.getAppConnection()).toBe("online");
});

it("accepts optional profile details, bounds strings and rejects unsafe avatar URLs", async () => {
  setup(); const {connectedMembers} = await import("./appRealtime");
  expect(connectedMembers({tabs:[
    {member_id:"a",nick:" Discord ",profile_name:" Name ",avatar_url:"https://cdn.discordapp.com/avatar.png"},
    {member_id:"b",nick:"Legacy",avatar_url:"javascript:alert(1)"},
    {member_id:"c",nick:"Long",profile_name:"x".repeat(200),avatar_url:"data:image/png;base64,abc"},
    {member_id:"d",nick:"Credentials",avatar_url:"https://user:pass@example.com/a.png"},
  ]})).toEqual([
    {member_id:"d",nick:"Credentials"},
    {member_id:"a",nick:"Discord",profile_name:"Name",avatar_url:"https://cdn.discordapp.com/avatar.png"},
    {member_id:"b",nick:"Legacy"},
    {member_id:"c",nick:"Long",profile_name:"x".repeat(100)},
  ]);
});

it("publishes profile details through the existing Presence channel without unrelated fields", async () => {
  const {channels,db} = setup(); const app = await import("./appRealtime");
  cleanup.push(app.publishAppPresence({member_id:"a",nick:"PublicDiscord",profile_name:"Profile Name",avatar_url:"https://example.test/avatar.png"}));
  await app.getAppAccount(); channels[0].status("SUBSCRIBED");
  expect(channels[0].track).toHaveBeenCalledExactlyOnceWith({member_id:"a",nick:"PublicDiscord",profile_name:"Profile Name",avatar_url:"https://example.test/avatar.png"});
  expect(db.channel).toHaveBeenCalledOnce();
});

it("reuses only the own player's Winamax read, retains it during profile refresh and clears it on account change", async () => {
  const {channels,auth} = setup(); const app = await import("./appRealtime");
  cleanup.push(app.subscribeAppChanges(vi.fn()));
  const off = app.publishAppPresence({member_id:"a",nick:"Discord"});
  await app.getAppAccount(); channels[0].status("SUBSCRIBED");
  app.updateAppPresenceWinamax("other-player","NotMine"); expect(channels[0].track).toHaveBeenCalledTimes(1);
  app.updateAppPresenceWinamax("a"," WinaNick ");
  expect(channels[0].track).toHaveBeenLastCalledWith({member_id:"a",nick:"Discord",winamax_nick:"WinaNick"});
  app.updateAppPresenceWinamax("a","WinaNick"); expect(channels[0].track).toHaveBeenCalledTimes(2);
  off(); cleanup.push(app.publishAppPresence({member_id:"a",nick:"Discord",profile_name:"Name"}));
  expect(channels[0].track).toHaveBeenLastCalledWith({member_id:"a",nick:"Discord",profile_name:"Name",winamax_nick:"WinaNick"});
  auth("account-b"); cleanup.push(app.publishAppPresence({member_id:"b",nick:"Other"})); channels[1].status("SUBSCRIBED");
  app.updateAppPresenceWinamax("a","LateOldRead");
  expect(channels[1].track).toHaveBeenCalledExactlyOnceWith({member_id:"b",nick:"Other"});
});

it("bounds the optional Winamax nickname and supports legacy Presence without it", async () => {
  setup(); const app = await import("./appRealtime");
  expect(app.connectedMembers({tabs:[{member_id:"a",nick:"A",winamax_nick:" "+"x".repeat(200)},{member_id:"b",nick:"B"}]}))
    .toEqual([{member_id:"a",nick:"A",winamax_nick:"x".repeat(100)},{member_id:"b",nick:"B"}]);
});
