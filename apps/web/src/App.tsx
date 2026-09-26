"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import "./i18n";
import { findInvite } from "./v2/invites";
import { clearSession, readSession, roleFor, takeInviteToken, writeSession, type Session } from "./v2/session";
import { cursorFromPrefs } from "./v2/prefs";
import { loadMembers } from "./schedule/members";
import { V2Login } from "./v2/V2Login";
import { V2JoinGate } from "./v2/V2JoinGate";
import { V2BootScreen } from "./v2/V2BootScreen";
import { liveAuthReady, loadLiveEntry, signOutLive } from "./data/auth";
import { getSupabase } from "./data/client";
import { disableDevSandbox } from "./data/config";
import "./v2/theme";
import "./v2/v2.css";

const V2Shell = lazy(() => import("./v2/V2Shell").then((module) => ({ default: module.V2Shell })));

function bootLocalSession(): Session | null {
  if (typeof window === "undefined") return null;
  const token = takeInviteToken();
  if (token) {
    const invite = findInvite(token);
    if (invite) {
      const member = loadMembers().find((row) => row.id === invite.memberId);
      const session: Session = {
        nick: member?.discord || member?.email.split("@")[0] || "guest",
        access: "profile",
        via: "magic",
        memberId: invite.memberId,
        role: roleFor(member?.discord || "guest", invite.memberId),
      };
      writeSession(session);
      return session;
    }
  }
  return readSession();
}

export function App() {
  const live = liveAuthReady();
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session | null>(() => (live ? null : bootLocalSession()));
  const [gate, setGate] = useState<Extract<Awaited<ReturnType<typeof loadLiveEntry>>, { kind: "gate" }> | null>(null);
  const [cursor, setCursor] = useState(() => cursorFromPrefs());
  const [booting, setBooting] = useState(live);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!live) return;
    const db = getSupabase();
    if (!db) {
      setBooting(false);
      return;
    }
    const apply = async () => {
      const entry = await loadLiveEntry();
      if (entry.kind === "member") {
        writeSession(entry.session);
        setSession(entry.session);
        setGate(null);
      } else if (entry.kind === "gate") {
        clearSession();
        setSession(null);
        setGate(entry);
      } else {
        clearSession();
        setSession(null);
        setGate(null);
      }
      setBooting(false);
    };
    void apply();
    const { data } = db.auth.onAuthStateChange((event) => {
      // INITIAL_SESSION and TOKEN_REFRESHED are already covered by the first
      // apply and must not repeat the application/Discord access checks.
      if (event === "SIGNED_IN" || event === "USER_UPDATED") void apply();
      if (event === "SIGNED_OUT") {
        clearSession();
        setSession(null);
        setGate(null);
        setBooting(false);
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [live]);

  if (!hydrated || booting) {
    return <V2BootScreen />;
  }

  if (gate) {
    return (
      <V2JoinGate
        nick={gate.nick}
        requestStatus={gate.requestStatus}
        requestKind={gate.requestKind}
        canRequest={gate.canRequest}
        reason={gate.reason}
        onRequested={() => setGate({ ...gate, requestStatus: "open" })}
        onLogout={() => {
          void signOutLive();
          setGate(null);
        }}
      />
    );
  }

  if (!session) {
    return <V2Login onEnter={setSession} />;
  }

  return (
    <Suspense fallback={<V2BootScreen />}>
      <V2Shell
        session={session}
        cursor={cursor}
        onCursorChange={setCursor}
        onSession={setSession}
        onLogout={() => {
          void signOutLive();
          clearSession();
          disableDevSandbox();
          setSession(null);
        }}
      />
    </Suspense>
  );
}
