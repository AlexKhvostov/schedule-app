import { useState } from "react";
import { loadClubOrder, saveClubOrder } from "../../data/clubOrder";
import { moveClubOrder, validClubOrder, type ClubOrderRow, type ClubOrderSnapshot } from "../../schedule/clubOrder";

export function useClubOrderEditor(onSaved: () => Promise<void>) {
  const [snapshot, setSnapshot] = useState<ClubOrderSnapshot | null>(null);
  const [rows, setRows] = useState<ClubOrderRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = Boolean(rows && validClubOrder(rows));
  const report = (cause: unknown) => setError(cause instanceof Error && cause.message.includes("club-order-stale") ? "stale" : "failed");
  return {
    editing: Boolean(snapshot), busy, error, valid, rows,
    start: async (firstMove?: { memberId: string; direction: -1 | 1 }) => {
      setBusy(true); setError("");
      try {
        const next = await loadClubOrder();
        setSnapshot(next);
        setRows(firstMove ? moveClubOrder(next.rows, firstMove.memberId, firstMove.direction) : next.rows);
        return next;
      } catch (cause) { report(cause); return null; }
      finally { setBusy(false); }
    },
    cancel: () => { setSnapshot(null); setRows(null); setError(""); },
    move: (memberId: string, direction: -1 | 1) => {
      if (rows) setRows(moveClubOrder(rows, memberId, direction));
    },
    save: async (nextRows = rows) => {
      if (!snapshot || !nextRows || !validClubOrder(nextRows)) return;
      setBusy(true); setError("");
      try { await saveClubOrder(snapshot, nextRows); setSnapshot(null); setRows(null); await onSaved(); }
      catch (cause) { report(cause); }
      finally { setBusy(false); }
    },
  };
}
