"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { approveMember, loadMember, type LiveMember } from "@/lib/session";

type Pending = { id: string; public_code: string; mark_tag: string | null };

export default function AdminPage() {
  const router = useRouter();
  const [member, setMember] = useState<LiveMember | null>(null);
  const [rows, setRows] = useState<Pending[]>([]);

  const reload = () => {
    const db = getSupabase();
    if (!db) return;
    void db
      .from("members")
      .select("id, public_code, mark_tag")
      .eq("access_status", "pending")
      .order("created_at")
      .then(({ data }) => setRows((data as Pending[]) ?? []));
  };

  useEffect(() => {
    void loadMember().then((next) => {
      if (!next) {
        router.replace("/");
        return;
      }
      if (next.role === "member") {
        router.replace("/schedule");
        return;
      }
      setMember(next);
      reload();
    });
  }, [router]);

  if (!member) return null;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--mute)]">заявки</p>
      <h1 className="mt-1 text-2xl font-semibold">Пустить на сетку</h1>
      <p className="mt-2 text-sm text-[var(--mute)]">Тот же список, что в песочнице. После кнопки человек перестаёт видеть экран ожидания.</p>
      <div className="mt-6 space-y-2">
        {rows.length === 0 ? <p className="text-sm text-[var(--mute)]">Новых заявок нет.</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--card)] px-4 py-3">
            <span>
              <b>{row.mark_tag || "—"}</b>
              <small className="ml-2 text-[var(--mute)]">{row.public_code}</small>
            </span>
            <button
              type="button"
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-black"
              onClick={() => {
                void approveMember(row.id).then(reload);
              }}
            >
              Пустить
            </button>
          </div>
        ))}
      </div>
      <Link href="/schedule" className="mt-8 inline-block text-sm text-[var(--mute)]">
        ← К расписанию
      </Link>
    </main>
  );
}
