"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadMember, signOut, type LiveMember } from "@/lib/session";

export default function WaitPage() {
  const router = useRouter();
  const [member, setMember] = useState<LiveMember | null>(null);

  useEffect(() => {
    const sync = async () => {
      const next = await loadMember();
      if (!next) {
        router.replace("/");
        return;
      }
      if (next.access === "active") {
        router.replace("/schedule");
        return;
      }
      setMember(next);
    };
    void sync();
    const id = window.setInterval(() => void sync(), 8000);
    return () => window.clearInterval(id);
  }, [router]);

  if (!member) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--mute)]">заявка</p>
      <h1 className="mt-2 text-3xl font-semibold">Ждём одобрения</h1>
      <p className="mt-3 text-sm text-[var(--mute)]">
        {member.nick}{member.markTag ? ` · ${member.markTag}` : ""}. Сетка откроется, когда админ нажмёт «пустить».
      </p>
      <button
        type="button"
        className="mt-6 self-start rounded-md border border-[var(--line)] px-4 py-2 text-sm"
        onClick={() => {
          void signOut().then(() => router.replace("/"));
        }}
      >
        Выйти
      </button>
    </main>
  );
}
