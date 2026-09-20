"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { loadMember, signOut, type LiveMember } from "@/lib/session";

type SlotRow = {
  slot_date: string;
  half: number;
  level: number;
  kind_id: string;
  member_id: string;
};

export default function SchedulePage() {
  const router = useRouter();
  const [member, setMember] = useState<LiveMember | null>(null);
  const [rows, setRows] = useState<SlotRow[]>([]);

  useEffect(() => {
    void loadMember().then((next) => {
      if (!next) {
        router.replace("/");
        return;
      }
      if (next.access !== "active") {
        router.replace("/wait");
        return;
      }
      setMember(next);
    });
  }, [router]);

  useEffect(() => {
    const db = getSupabase();
    if (!db || !member) return;
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    void db
      .from("occupancy")
      .select("slot_date, half, level, kind_id, member_id")
      .gte("slot_date", from)
      .order("slot_date")
      .then(({ data }) => setRows((data as SlotRow[]) ?? []));
    const channel = db
      .channel("web-occupancy")
      .on("postgres_changes", { event: "*", schema: "public", table: "occupancy" }, () => {
        void db
          .from("occupancy")
          .select("slot_date, half, level, kind_id, member_id")
          .gte("slot_date", from)
          .order("slot_date")
          .then(({ data }) => setRows((data as SlotRow[]) ?? []));
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [member]);

  if (!member) return null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--mute)]">сетка</p>
          <h1 className="text-2xl font-semibold">Расписание</h1>
          <p className="mt-1 text-sm text-[var(--mute)]">
            {member.markTag ? `${member.markTag} · ` : ""}{member.nick}. Полное поле пока в песочнице, здесь уже живые слоты из базы.
          </p>
        </div>
        <div className="flex gap-2">
          {member.role !== "member" ? (
            <Link href="/admin" className="rounded-md border border-[var(--line)] px-3 py-2 text-sm">
              Админка
            </Link>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            onClick={() => {
              void signOut().then(() => router.replace("/"));
            }}
          >
            Выйти
          </button>
        </div>
      </header>
      <section className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--mute)]">В этом месяце слотов ещё нет. Ставить смены можно в sandbox/ui, когда ключи те же.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((row, index) => (
              <li key={`${row.slot_date}-${row.half}-${row.level}-${index}`} className="flex justify-between gap-3">
                <span>
                  {row.slot_date} · {String(Math.floor(row.half / 2)).padStart(2, "0")}:{row.half % 2 ? "30" : "00"}
                </span>
                <span className="text-[var(--mute)]">ур. {row.level + 1}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
