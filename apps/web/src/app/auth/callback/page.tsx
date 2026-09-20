"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/data/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const db = getSupabase();
      const code = new URLSearchParams(window.location.search).get("code");
      if (db && code) await db.auth.exchangeCodeForSession(code);
      else if (db) await db.auth.getSession();
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
