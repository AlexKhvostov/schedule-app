"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isConfigured } from "@/lib/supabase";
import { loadMember, signInDiscord } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const ready = isConfigured();

  useEffect(() => {
    void loadMember().then((member) => {
      if (!member) return;
      router.replace(member.access === "active" ? "/schedule" : "/wait");
    });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--mute)]">Red Party</p>
      <h1 className="mt-2 text-3xl font-semibold">Вход</h1>
      <p className="mt-3 text-sm text-[var(--mute)]">
        {ready
          ? "С улицы зарегистрироваться нельзя. Discord создаёт заявку, админ открывает сетку."
          : "Нет ключей Supabase. Скопируй apps/web/.env.example в .env.local."}
      </p>
      <button
        type="button"
        disabled={!ready}
        className="mt-6 rounded-md bg-[#5865f2] px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
        onClick={() => {
          void signInDiscord().then((result) => {
            if (result.error) setError(result.error);
          });
        }}
      >
        Войти через Discord
      </button>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </main>
  );
}
