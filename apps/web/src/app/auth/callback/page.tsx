"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { loadMember } from "@/lib/session";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const db = getSupabase();
      const code = new URLSearchParams(window.location.search).get("code");
      if (db && code) await db.auth.exchangeCodeForSession(code);
      else if (db) await db.auth.getSession();
      const member = await loadMember();
      router.replace(!member ? "/" : member.access === "active" ? "/schedule" : "/wait");
    };
    void run();
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center text-sm text-[var(--mute)]">
      Входим…
    </main>
  );
}
