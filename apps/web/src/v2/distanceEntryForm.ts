/** Empty cells mean zero; grouped numbers pasted from a table are accepted. */
export function readDistanceValues(values: Record<string, string>) {
  const numeric: Record<string, number> = {};
  const invalid: string[] = [];
  for (const [limit, raw] of Object.entries(values)) {
    const text = raw.replace(/\s/g, "");
    const value = text === "" ? 0 : Number(text);
    if ((text !== "" && !/^\d+$/.test(text)) || !Number.isSafeInteger(value) || value > 2147483647) invalid.push(limit);
    else numeric[limit] = value;
  }
  return { numeric, invalid, total: Object.values(numeric).reduce((sum, value) => sum + value, 0),
    filled: Object.values(numeric).filter((value) => value > 0).length };
}
