// The legacy SQL filters match nicknames without letter case; preserve the original display name.
export function playerNameKey(name: string): string { return name.trim().normalize("NFC").toLowerCase(); }
export function includesPlayer(names: string[], name: string): boolean { return names.some(item => playerNameKey(item) === playerNameKey(name)); }

export function restoreRegSides(report: unknown, registry: unknown): unknown {
  if (!report || typeof report !== "object" || !("rows" in report) || !Array.isArray(report.rows)) throw new Error("invalid-response");
  if (!registry || typeof registry !== "object" || !("regs" in registry) || !Array.isArray(registry.regs)) throw new Error("invalid-registry");
  const sides = new Map<string, "ours" | "theirs" | "ambiguous">();
  for (const reg of registry.regs) {
    if (!reg || typeof reg.player_name !== "string" || !reg.player_name.trim() || !["ours", "theirs"].includes(reg.side)) throw new Error("invalid-registry");
    const key = playerNameKey(reg.player_name), previous = sides.get(key);
    sides.set(key, previous && previous !== reg.side ? "ambiguous" : reg.side);
  }
  return { ...report, rows: report.rows.map(row => {
    if (!row || typeof row.player_name !== "string") throw new Error("invalid-response");
    if (row.reg_side != null) return row;
    const side = sides.get(playerNameKey(row.player_name));
    if (side === "ambiguous") throw new Error("ambiguous-registry");
    return { ...row, reg_side: side ?? null };
  }) };
}
