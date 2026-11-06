import type { Access } from "./session";

export type ShellPage =
  | "wait"
  | "schedule"
  | "priorities"
  | "dashboard"
  | "cabinet"
  | "admin-people"
  | "admin-distance"
  | "admin-schedule"
  | "admin-root"
  | "root-api"
  | "root-logs"
  | "root-distance"
  | "uikit"
  | "blocks"
  | "guild";

type NavigationContext = {
  isRoot: boolean;
  permissions?: string[];
  access: Access;
};

export function canAccessDashboard(context: NavigationContext): boolean {
  return context.access === "active" && permissionCheck(context)("dashboard");
}

function permissionCheck({ isRoot, permissions = [] }: NavigationContext) {
  const allowed = new Set(permissions);
  return (permission: string) => isRoot || allowed.has(permission);
}

export function defaultShellPage(context: NavigationContext): ShellPage {
  const can = permissionCheck(context);
  if (context.access === "active" && can("schedule")) return "schedule";
  if (can("profile")) return "cabinet";
  if (context.access === "active" && can("priorities")) return "priorities";
  if (canAccessDashboard(context)) return "dashboard";
  if (can("admin.people")) return "admin-people";
  if (can("schedule.manage")) return "admin-schedule";
  if (context.isRoot) return "admin-root";
  return "wait";
}

export function resolveShellPage(context: NavigationContext, hash: string): ShellPage {
  const can = permissionCheck(context);
  if (canAccessDashboard(context) && (hash === "#dashboard" || hash.startsWith("#dashboard/"))) return "dashboard";
  if (context.isRoot && hash === "#blocks") return "blocks";
  if (context.isRoot && hash === "#uikit") return "uikit";
  if (context.isRoot && hash === "#guild") return "guild";
  if (context.isRoot && hash === "#admin-root") return "admin-root";
  if (context.isRoot && hash === "#root-logs") return "root-logs";
  if (context.isRoot && hash === "#root-api") return "root-api";
  if (context.isRoot && (hash === "#root-distance" || hash === "#root-import")) return "root-distance";
  if (can("admin.people") && hash === "#admin-distance") return "admin-distance";
  if (can("schedule.manage") && hash === "#admin-schedule") return "admin-schedule";
  if (can("admin.people") && (hash === "#admin" || hash === "#admin-people")) return "admin-people";
  if (context.access === "active" && can("schedule") && hash === "#schedule") return "schedule";
  if (context.access === "active" && (can("priorities") || can("schedule")) && hash === "#priorities") return "priorities";
  if (can("profile") && (hash === "#cabinet" || hash === "#cabinet-game")) return "cabinet";
  return defaultShellPage(context);
}
