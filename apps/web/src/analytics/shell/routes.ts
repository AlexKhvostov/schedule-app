export const dashboardSections = [
  { id: "points", icon: "fa-chart-line", group: "analysis", blocks: ["pointsMap", "pointsChart"] },
  { id: "profile", icon: "fa-user", group: "analysis", blocks: ["playerSummary", "playerMonth"] },
  { id: "speed", icon: "fa-gauge-high", group: "analysis", blocks: ["speedRanking", "hourlySpeed"] },
  { id: "density", icon: "fa-table-cells", group: "analysis", blocks: ["densityMap", "hourTotals"] },
  { id: "regs", icon: "fa-users", group: "players", blocks: ["ourRegs", "otherRegs"] },
] as const;

export type DashboardSectionId = (typeof dashboardSections)[number]["id"];

export function resolveDashboardSection(hash: string): DashboardSectionId {
  return dashboardSections.find(({ id }) => hash === dashboardHash(id))?.id ?? "points";
}

export function dashboardHash(section: DashboardSectionId): string {
  return `#dashboard/${section}`;
}
