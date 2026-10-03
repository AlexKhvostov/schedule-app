import { getSupabase } from "./client";

export const TABLE_PRESET_COUNT = 5;
export const TABLE_PRESET_MIN = 1;
export const TABLE_PRESET_MAX = 30;

export type TablePresetValidationError = "required" | "integer" | "range" | "duplicate";

export type TablePresetValidation =
  | { ok: true; values: number[] }
  | { ok: false; error: TablePresetValidationError };

function clampFallback(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return TABLE_PRESET_MIN;
  return Math.min(TABLE_PRESET_MAX, Math.max(TABLE_PRESET_MIN, Math.round(number)));
}

export function validateTablePresetDraft(draft: readonly string[]): TablePresetValidation {
  const values: number[] = [];
  for (const raw of draft.slice(0, TABLE_PRESET_COUNT)) {
    const text = raw.trim();
    if (!text) continue;
    if (!/^\d+$/.test(text)) return { ok: false, error: "integer" };
    const value = Number(text);
    if (!Number.isInteger(value)) return { ok: false, error: "integer" };
    if (value < TABLE_PRESET_MIN || value > TABLE_PRESET_MAX) return { ok: false, error: "range" };
    if (values.includes(value)) return { ok: false, error: "duplicate" };
    values.push(value);
  }
  return values.length ? { ok: true, values } : { ok: false, error: "required" };
}

export function normalizeTablePresets(values: readonly unknown[] | null | undefined, fallback: unknown): number[] {
  const normalized: number[] = [];
  for (const raw of values ?? []) {
    const number = Number(raw);
    if (!Number.isInteger(number) || number < TABLE_PRESET_MIN || number > TABLE_PRESET_MAX || normalized.includes(number)) continue;
    normalized.push(number);
    if (normalized.length === TABLE_PRESET_COUNT) break;
  }
  return normalized.length ? normalized : [clampFallback(fallback)];
}

export function tablePresetsToDraft(values: readonly number[]): string[] {
  return Array.from({ length: TABLE_PRESET_COUNT }, (_, index) => (values[index] == null ? "" : String(values[index])));
}

export async function loadMemberTablePresets(memberId: string, fallback: unknown) {
  const safeFallback = normalizeTablePresets([], fallback);
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const, presets: safeFallback };
  const { data, error } = await db
    .from("member_table_presets")
    .select("tables")
    .eq("member_id", memberId)
    .order("position", { ascending: true });
  if (error) return { error: error.message, presets: safeFallback };
  return { error: null, presets: normalizeTablePresets((data ?? []).map((row) => row.tables), fallback) };
}

export async function saveMemberTablePresets(memberId: string, presets: readonly number[]) {
  const validation = validateTablePresetDraft(presets.map(String));
  if (!validation.ok) return { error: validation.error as string, presets: [] as number[] };
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const, presets: [] as number[] };
  const { error } = await db.rpc("save_member_table_presets", {
    p_member_id: memberId,
    p_presets: validation.values,
  });
  if (error) return { error: error.message, presets: [] as number[] };
  return loadMemberTablePresets(memberId, validation.values[0]);
}

export function subscribeMemberTablePresets(memberId: string, onChange: () => void) {
  const db = getSupabase();
  if (!db || !memberId) return () => {};
  const channel = db
    .channel(`member-table-presets-${memberId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "member_table_presets", filter: `member_id=eq.${memberId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
