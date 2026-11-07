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

  // This brief callback needs neither application CSS nor the translation runtime.
  return (
    <main style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "var(--background, #0e1118)", color: "var(--muted-foreground, #9ca3af)", font: "14px system-ui, sans-serif" }}>
      Входим…
    </main>
  );
}
