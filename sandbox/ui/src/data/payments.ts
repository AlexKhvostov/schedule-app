import { emptyPay, type PayKind, type PayMethod } from "../schedule/members";
import { getSupabase } from "./client";

export const PAY_PRESETS: { kind: Exclude<PayKind, "custom">; title: string }[] = [
  { kind: "usdt_trc20", title: "USDT TRC20" },
  { kind: "skrill", title: "Skrill" },
];

type PayRow = {
  id: string;
  kind?: string | null;
  title: string | null;
  details: string | null;
  comment: string | null;
  is_primary: boolean | null;
  sort_n?: number | null;
};

function isDbId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function isPayPreset(kind?: PayKind): kind is Exclude<PayKind, "custom"> {
  return kind === "usdt_trc20" || kind === "skrill";
}

export function kindFromTitle(title: string): PayKind {
  const t = title.trim().toLowerCase().replace(/[–—]/g, "-");
  if (/usdt/.test(t) && /trc\s*-?\s*20/.test(t)) return "usdt_trc20";
  if (t === "skrill") return "skrill";
  return "custom";
}

function asKind(value: string | null | undefined, title: string): PayKind {
  if (value === "usdt_trc20" || value === "skrill" || value === "custom") return value;
  return kindFromTitle(title);
}

function presetOf(kind: Exclude<PayKind, "custom">, primary: boolean): PayMethod {
  const spec = PAY_PRESETS.find((row) => row.kind === kind)!;
  return {
    id: `pay-preset-${kind}`,
    kind,
    title: spec.title,
    details: "",
    comment: "",
    primary,
  };
}

function asPay(row: PayRow): PayMethod {
  const title = row.title ?? "";
  const kind = asKind(row.kind, title);
  const spec = PAY_PRESETS.find((item) => item.kind === kind);
  return {
    id: row.id,
    kind,
    title: spec?.title ?? title,
    details: row.details ?? "",
    comment: row.comment ?? "",
    primary: Boolean(row.is_primary),
  };
}

export function clonePays(rows: PayMethod[]): PayMethod[] {
  return rows.map((row) => ({ ...row }));
}

export function ensurePresetPays(rows: PayMethod[]): PayMethod[] {
  const tagged = rows.map((row) => ({
    ...row,
    kind: row.kind ?? kindFromTitle(row.title),
  }));
  const taken = new Set<PayKind>();
  const extras: PayMethod[] = [];
  let usdt: PayMethod | undefined;
  let skrill: PayMethod | undefined;
  for (const row of tagged) {
    if (row.kind === "usdt_trc20" && !taken.has("usdt_trc20")) {
      taken.add("usdt_trc20");
      usdt = { ...row, kind: "usdt_trc20", title: "USDT TRC20" };
      continue;
    }
    if (row.kind === "skrill" && !taken.has("skrill")) {
      taken.add("skrill");
      skrill = { ...row, kind: "skrill", title: "Skrill" };
      continue;
    }
    extras.push({ ...row, kind: "custom" });
  }
  const next = [usdt ?? presetOf("usdt_trc20", false), skrill ?? presetOf("skrill", false), ...extras];
  return withPrimary(next);
}

export function withPrimary(pays: PayMethod[]): PayMethod[] {
  const next = pays.map((row) => ({
    ...row,
    kind: row.kind ?? kindFromTitle(row.title),
    title: row.title.trim(),
    details: row.details.trim(),
    comment: row.comment.trim(),
  }));
  if (next.length && !next.some((row) => row.primary)) {
    const usdt = next.find((row) => row.kind === "usdt_trc20");
    if (usdt) usdt.primary = true;
    else next[0].primary = true;
  }
  const primaryId = next.find((row) => row.primary)?.id;
  return next.map((row) => ({ ...row, primary: row.id === primaryId }));
}

export async function loadPays(memberId: string): Promise<PayMethod[]> {
  const db = getSupabase();
  if (!db) return ensurePresetPays([]);
  const { data, error } = await db
    .from("payment_methods")
    .select("id, kind, title, details, comment, is_primary, sort_n")
    .eq("member_id", memberId)
    .order("sort_n", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data) return ensurePresetPays([]);
  return ensurePresetPays((data as PayRow[]).map(asPay));
}

export async function savePays(memberId: string, pays: PayMethod[]) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const, pays: [] as PayMethod[] };
  const next = ensurePresetPays(pays);
  const { data: existing, error: readErr } = await db.from("payment_methods").select("id").eq("member_id", memberId);
  if (readErr) return { error: readErr.message, pays: [] as PayMethod[] };
  const keep = new Set(next.filter((row) => isDbId(row.id)).map((row) => row.id));
  const drop = ((existing ?? []) as { id: string }[]).map((row) => row.id).filter((id) => !keep.has(id));
  if (drop.length) {
    const { error } = await db.from("payment_methods").delete().in("id", drop);
    if (error) return { error: error.message, pays: [] as PayMethod[] };
  }
  if (keep.size) {
    const { error } = await db.from("payment_methods").update({ is_primary: false }).eq("member_id", memberId);
    if (error) return { error: error.message, pays: [] as PayMethod[] };
  }
  const saved: PayMethod[] = [];
  for (let i = 0; i < next.length; i++) {
    const row = next[i];
    const body = {
      member_id: memberId,
      kind: row.kind ?? "custom",
      title: row.title,
      details: row.details,
      comment: row.comment,
      is_primary: false,
      sort_n: i,
    };
    if (isDbId(row.id)) {
      const { data, error } = await db
        .from("payment_methods")
        .update(body)
        .eq("id", row.id)
        .select("id, kind, title, details, comment, is_primary, sort_n")
        .maybeSingle();
      if (error || !data) return { error: error?.message ?? "not-saved", pays: [] as PayMethod[] };
      saved.push(asPay(data as PayRow));
    } else {
      const { data, error } = await db
        .from("payment_methods")
        .insert(body)
        .select("id, kind, title, details, comment, is_primary, sort_n")
        .maybeSingle();
      if (error || !data) return { error: error?.message ?? "not-saved", pays: [] as PayMethod[] };
      saved.push(asPay(data as PayRow));
    }
  }
  const primary = saved.find((_, index) => next[index]?.primary) ?? saved.find((row) => row.kind === "usdt_trc20") ?? saved[0];
  if (primary) {
    const { error } = await db.from("payment_methods").update({ is_primary: true }).eq("id", primary.id);
    if (error) return { error: error.message, pays: [] as PayMethod[] };
    return { error: null, pays: ensurePresetPays(saved.map((row) => ({ ...row, primary: row.id === primary.id }))) };
  }
  return { error: null, pays: ensurePresetPays(saved) };
}

export function blankPay(primary = false): PayMethod {
  return emptyPay(primary);
}
