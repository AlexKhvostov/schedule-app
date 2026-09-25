"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/data/client";
import { markFreshDiscordLogin } from "@/data/auth";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const db = getSupabase();
      const code = new URLSearchParams(window.location.search).get("code");
      if (db && code) {
        const { data, error } = await db.auth.exchangeCodeForSession(code);
        if (!error && data.session) markFreshDiscordLogin();
      } else if (db) {
        const { data } = await db.auth.getSession();
        if (data.session) markFreshDiscordLogin();
      }
      router.replace("/");
    };
    void run();
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center text-sm text-[var(--muted-foreground)]">
      Входим…
    </main>
  );
}
