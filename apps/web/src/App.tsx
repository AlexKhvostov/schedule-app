"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "./i18n";
import { useTranslation } from "react-i18next";
import { LiveEntryRecovery } from "./data/liveEntryRecovery";
import { AuthAvailability } from "./v2/authAvailability";
import { findInvite } from "./v2/invites";
import { clearSession, readSession, roleFor, takeInviteToken, writeSession, type Session } from "./v2/session";
import { cursorFromPrefs } from "./v2/prefs";
import { loadMembers } from "./schedule/members";


import { V2BootScreen } from "./v2/V2BootScreen";
import { liveAuthReady, loadLiveEntry, signOutLive } from "./data/auth";
import { getSupabase } from "./data/client";
import { subscribeAppChanges } from "./data/appRealtime";
import { disableDevSandbox } from "./data/config";
import "./v2/theme";

const V2Login = lazy(() => import("./v2/V2Login").then(module => ({ default: module.V2Login })));
const V2JoinGate = lazy(() => import("./v2/V2JoinGate").then(module => ({ default: module.V2JoinGate })));
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
  const { t } = useTranslation();
  const recovery = useRef<LiveEntryRecovery | null>(null);
  const [authState, setAuthState] = useState({ unavailable: false, checking: false });
  const retryAuth = () => { void recovery.current?.check(); };
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
    let previous: Awaited<ReturnType<typeof loadLiveEntry>> | null = null;
    const controller = new LiveEntryRecovery(loadLiveEntry, state => {
      setAuthState({ unavailable: state.unavailable, checking: state.checking });
      if (state.entry && state.entry !== previous) {
        previous = state.entry;
        const entry = state.entry;
        if (entry.kind === "member") {
          writeSession(entry.session); setSession(entry.session); setGate(null);
        } else {
          clearSession(); setSession(null); setGate(entry.kind === "gate" ? entry : null);
        }
      }
      if (state.entry || state.unavailable) setBooting(false);
    });
    recovery.current = controller;
    const offChanges = subscribeAppChanges(change => {
      if (change.domain === "access") controller.invalidate();
    });
    void controller.check();
    // Defer Supabase calls outside the auth callback's session lock.
    let authEvent: ReturnType<typeof setTimeout> | undefined;
    const { data } = db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || (event === "TOKEN_REFRESHED" && controller.state.unavailable)) {
        clearTimeout(authEvent); authEvent = setTimeout(() => void controller.check(), 0);
      }
      if (event === "SIGNED_OUT") { clearTimeout(authEvent); controller.signedOut(); }
    });
    const resume = () => {
      if (document.visibilityState === "visible" && controller.state.unavailable) void controller.check();
    };
    window.addEventListener("online", resume); window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller.stop(); offChanges(); clearTimeout(authEvent); data.subscription.unsubscribe();
      window.removeEventListener("online", resume); window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      if (recovery.current === controller) recovery.current = null;
    };
  }, [live]);

  if (!hydrated || booting || (authState.unavailable && !session && !gate)) {
    return <V2BootScreen phase={hydrated ? "auth" : "assets"} languageReady={hydrated} unavailable={authState.unavailable} retrying={authState.checking} onRetry={retryAuth} />;
  }

  if (gate) {
    return (
      <Suspense fallback={<V2BootScreen />}><V2JoinGate
        nick={gate.nick}
        requestStatus={gate.requestStatus}
        requestKind={gate.requestKind}
        canRequest={gate.canRequest}
        reason={gate.reason}
        onRequested={() => setGate({ ...gate, requestStatus: "open" })}
        onLogout={() => {
          recovery.current?.signedOut();
          void signOutLive();
          setGate(null);
        }}
      /></Suspense>
    );
  }

  if (!session) {
    return <Suspense fallback={<V2BootScreen />}><V2Login onEnter={setSession} /></Suspense>;
  }

  return (
    <AuthAvailability.Provider value={{ unavailable: authState.unavailable, retry: retryAuth }}>
      {authState.unavailable && <div className="v2-auth-notice" role="status">
        <span>{t("login.temporarilyUnavailable")}</span>
        <button type="button" disabled={authState.checking} onClick={retryAuth}>{t(authState.checking ? "login.checking" : "login.retry")}</button>
      </div>}
    <Suspense fallback={<V2BootScreen />}>
      <V2Shell
        session={session}
        cursor={cursor}
        onCursorChange={setCursor}
        onSession={setSession}
        onLogout={() => {
          recovery.current?.signedOut();
          void signOutLive();
          clearSession();
          disableDevSandbox();
          setSession(null);
        }}
      />
    </Suspense>
    </AuthAvailability.Provider>
  );
}
