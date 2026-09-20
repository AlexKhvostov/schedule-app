import { useEffect, useState } from "react";
import { findInvite } from "./v2/invites";
import { clearSession, readSession, roleFor, takeInviteToken, writeSession, type Session } from "./v2/session";
import { cursorFromPrefs } from "./v2/prefs";
import { loadMembers } from "./schedule/members";
import { V2Login } from "./v2/V2Login";
import { V2Shell } from "./v2/V2Shell";
import { liveAuthReady, loadLiveMember, liveToSession, signOutLive } from "./data/auth";
import { getSupabase } from "./data/client";
import "./v2/theme";

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
  const [session, setSession] = useState<Session | null>(() => (live ? null : bootLocalSession()));
  const [cursor, setCursor] = useState(() => cursorFromPrefs());
  const [booting, setBooting] = useState(live);

  useEffect(() => {
    if (!live) return;
    const db = getSupabase();
    if (!db) {
      setBooting(false);
      return;
    }
    const apply = async () => {
      const member = await loadLiveMember();
      const next = member ? liveToSession(member) : null;
      if (next) writeSession(next);
      else clearSession();
      setSession(next);
      setBooting(false);
    };
    void apply();
    const { data } = db.auth.onAuthStateChange(() => {
      void apply();
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [live]);

  if (booting) return null;

  if (!session) {
    return <V2Login onEnter={setSession} />;
  }

  return (
    <V2Shell
      session={session}
      cursor={cursor}
      onCursorChange={setCursor}
      onSession={setSession}
      onLogout={() => {
        void signOutLive();
        clearSession();
        setSession(null);
      }}
    />
  );
}
