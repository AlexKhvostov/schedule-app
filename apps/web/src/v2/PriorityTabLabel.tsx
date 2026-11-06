import { priorityGroupLimits, type PriorityKind } from "../schedule/priorities";
import { PairLabel } from "./PairLabel";

export const priorityTabs = ["nitro", "regular", "both"] as const;
export type PriorityTab = PriorityKind | "both";

export function PriorityTabLabel({ tab }: { tab: PriorityTab }) {
  const high = tab === "both";
  const [first, last] = priorityGroupLimits[high ? "250" : "50-100"];
  return <>{!high && <PairLabel label={tab === "nitro" ? "N" : "E"} />}<span style={{ color: `var(--limit-${first})` }}>{first}</span>-<span style={{ color: `var(--limit-${last})` }}>{last}</span></>;
}
