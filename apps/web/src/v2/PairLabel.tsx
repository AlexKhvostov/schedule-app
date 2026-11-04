/** Keep the accessible N/E label intact while coloring its tournament prefix. */
export function PairLabel({ label }: { label: string }) {
  const match = /^([NE])(?=\d|$)/.exec(label);
  if (!match) return label;
  return <><span className="v2-pair-kind" data-variant={match[1] === "N" ? "nitro" : "regular"}>{match[1]}</span>{label.slice(1)}</>;
}
