import { getSupabase } from "./client";

export type LiveKind = {
  id: string;
  limitId: string;
  variantId: string | null;
};

let cache: LiveKind[] | null = null;

export async function loadKinds(signal?: AbortSignal): Promise<LiveKind[]> {
  if (cache) return cache;
  const db = getSupabase();
  if (!db) return [];
  const query = db.from("schedule_kinds").select("id, limit_id, variant_id");
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) return [];
  cache = (data ?? []).map((row) => ({
    id: row.id,
    limitId: row.limit_id,
    variantId: row.variant_id,
  }));
  return cache;
}

export async function kindIdOf(limit: string, variant: "nitro" | "regular") {
  const kinds = await loadKinds();
  return kinds.find((row) => row.limitId === limit && row.variantId === variant)?.id ?? null;
}

export function resetKindCache() {
  cache = null;
}
