import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./client";

export type AppConnection = "connecting" | "online" | "offline";
export type AppChange = { domain: "slots" | "config" | "directory" | "priorities" | "access"; target?: { date: string; kind_id: string } };
export type ConnectedMember = { member_id: string; nick: string; profile_name?: string; avatar_url?: string };

function presenceMember(value: unknown): ConnectedMember | null {
  const row = value as Partial<ConnectedMember> | null;
  if (!row || typeof row.member_id !== "string" || !row.member_id || row.member_id.length > 128
    || typeof row.nick !== "string" || !row.nick.trim()) return null;
  const member: ConnectedMember = { member_id: row.member_id, nick: row.nick.trim().slice(0, 100) };
  if (typeof row.profile_name === "string" && row.profile_name.trim()) member.profile_name = row.profile_name.trim().slice(0, 100);
  if (typeof row.avatar_url === "string" && row.avatar_url.length <= 2048) {
    try {
      const url = new URL(row.avatar_url);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) member.avatar_url = url.href;
    } catch { /* Invalid optional avatars fall back to initials. */ }
  }
  return member;
}

/** Presence is presentation-only; never use a client-published identity for access checks. */
export function connectedMembers(state: Record<string, unknown[]>): ConnectedMember[] {
  const people = new Map<string, ConnectedMember>();
  for (const entries of Object.values(state)) for (const value of entries) {
    const member = presenceMember(value);
    if (member) people.set(member.member_id, member);
  }
  return [...people.values()].sort((a, b) => a.nick.localeCompare(b.nick) || a.member_id.localeCompare(b.member_id));
}

const changes = new Set<(change: AppChange) => void>();
const connections = new Set<(state: AppConnection) => void>();
const presenceListeners = new Set<(members: ConnectedMember[]) => void>();
const accounts = new Set<(key: string | null) => void>();
let channel: RealtimeChannel | undefined;
let authCleanup: (() => void) | undefined;
let socketCleanup: (() => void) | undefined;
let connection: AppConnection = "offline";
let members: ConnectedMember[] = [];
let account: string | null = null;
let accountKnown = false;
let epoch = 0;
let presence: { token: symbol; member: ConnectedMember } | undefined;
let starting = false;
let accountEpoch = 0;

const listenersExist = () => Boolean(changes.size || connections.size || presenceListeners.size || accounts.size || presence);
function setConnection(next: AppConnection) {
  if (connection === next) return;
  connection = next;
  if (next !== "online") { members = []; presenceListeners.forEach(listener => listener(members)); }
  connections.forEach(listener => listener(next));
}
function updateAccount(next: string | null) {
  if (accountKnown && account === next) return;
  const changed = accountKnown && account !== next;
  accountKnown = true; account = next;
  ++accountEpoch;
  if (changed) {
    presence = undefined;
    stopChannel();
  }
  accounts.forEach(listener => listener(next));
  if (listenersExist() && next && !channel && !starting) startChannel();
}
function stopChannel() {
  ++epoch;
  const previous = channel;
  channel = undefined;
  socketCleanup?.(); socketCleanup = undefined;
  members = []; presenceListeners.forEach(listener => listener(members));
  setConnection("offline");
  if (previous) void getSupabase()?.removeChannel(previous);
}
function startChannel() {
  const db = getSupabase();
  if (!db || channel || !account) return;
  const ticket = ++epoch;
  setConnection("connecting");
  const live = db.channel("app:changes", { config: { private: true } });
  channel = live;
  const isCurrent = () => channel === live && ticket === epoch;
  // The SDK exposes socket lifecycle callbacks. A newly opened transport is
  // still connecting until the private channel has acknowledged its join.
  const callbacks = db.realtime.stateChangeCallbacks.open;
  const entry: (typeof callbacks)[number] = ["app-changes-status", () => {
    if (isCurrent()) setConnection("connecting");
  }];
  callbacks.push(entry);
  socketCleanup = () => { const index = callbacks.indexOf(entry); if (index >= 0) callbacks.splice(index, 1); };
  for (const domain of ["slots", "config", "directory", "priorities", "access"] as const) {
    live.on("broadcast", { event: domain }, ({ payload }) => {
      if (!isCurrent()) return;
      if (domain === "slots") {
        if (typeof payload?.date !== "string" || typeof payload?.kind_id !== "string") return;
        changes.forEach(listener => listener({ domain, target: { date: payload.date, kind_id: payload.kind_id } }));
      } else changes.forEach(listener => listener({ domain }));
    });
  }
  live.on("presence", { event: "sync" }, () => {
    if (!isCurrent() || connection !== "online") return;
    members = connectedMembers(live.presenceState());
    presenceListeners.forEach(listener => listener(members));
  });
  live.subscribe(status => {
    if (!isCurrent()) return;
    setConnection(status === "SUBSCRIBED" ? "online" : "offline");
    if (status === "SUBSCRIBED" && presence) void live.track(presence.member);
  });
}
function ensureStarted() {
  const db = getSupabase();
  if (!db || authCleanup || starting) return;
  starting = true;
  const { data } = db.auth.onAuthStateChange((_event, session) => {
    // Do not await SDK auth methods in this callback: they share its auth lock.
    updateAccount(session?.user.id ?? null);
  });
  authCleanup = () => data.subscription.unsubscribe();
  starting = false;
  void getAppAccount().then(() => { if (listenersExist()) startChannel(); }).catch(() => {
    if (!channel) setConnection("offline");
  });
}
function releaseUnused() {
  if (listenersExist()) return;
  stopChannel(); authCleanup?.(); authCleanup = undefined;
  accountKnown = false; account = null;
  ++accountEpoch;
}

export function getAppConnection() { return connection; }
export function getAppAccountKey() { return account; }
/** getSession reads the SDK's existing local session; no extra getUser request. */
export async function getAppAccount(): Promise<string | null> {
  if (accountKnown) return account;
  const db = getSupabase();
  if (!db) return null;
  const ticket = accountEpoch;
  const { data } = await db.auth.getSession();
  if (ticket === accountEpoch) updateAccount(data.session?.user.id ?? null);
  return account;
}
export function subscribeAppAccount(listener: (key: string | null) => void) {
  accounts.add(listener); ensureStarted(); listener(account);
  return () => { accounts.delete(listener); releaseUnused(); };
}
export function subscribeAppChanges(listener: (change: AppChange) => void) {
  changes.add(listener); ensureStarted();
  return () => { changes.delete(listener); releaseUnused(); };
}
/** A metadata checkpoint found a missed event; notify local consumers only. */
export function notifyAppDataChanged(domain: Exclude<AppChange["domain"], "slots">) {
  changes.forEach(listener => listener({ domain }));
}
export function subscribeAppConnection(listener: (state: AppConnection) => void) {
  connections.add(listener); ensureStarted(); listener(connection);
  return () => { connections.delete(listener); releaseUnused(); };
}
export function subscribeAppPresence(listener: (people: ConnectedMember[]) => void) {
  presenceListeners.add(listener); ensureStarted(); listener(members);
  return () => { presenceListeners.delete(listener); releaseUnused(); };
}
export function publishAppPresence(member: ConnectedMember) {
  const token = Symbol("presence-owner");
  const payload = presenceMember(member);
  if (!payload) return () => {};
  presence = { token, member: payload };
  ensureStarted();
  if (connection === "online") void channel?.track(presence.member);
  return () => {
    if (presence?.token !== token) return;
    presence = undefined;
    void channel?.untrack(); releaseUnused();
  };
}
