import type { Access } from "./session";

export type ShellPage =
  | "wait"
  | "schedule"
  | "priorities"
  | "cabinet"
  | "admin-people"
  | "admin-distance"
  | "admin-schedule"
  | "admin-root"
  | "root-distance"
  | "uikit"
  | "blocks"
  | "guild";

type NavigationContext = {
  isRoot: boolean;
  permissions?: string[];
  access: Access;
};

function permissionCheck({ isRoot, permissions = [] }: NavigationContext) {
  const allowed = new Set(permissions);
  return (permission: string) => isRoot || allowed.has(permission);
}

export function defaultShellPage(context: NavigationContext): ShellPage {
  const can = permissionCheck(context);
  if (context.access === "active" && can("schedule")) return "schedule";
  if (can("profile")) return "cabinet";
  if (context.access === "active" && can("priorities")) return "priorities";
  if (can("admin.people")) return "admin-people";
  if (can("schedule.manage")) return "admin-schedule";
  if (context.isRoot) return "admin-root";
  return "wait";
}

export function resolveShellPage(context: NavigationContext, hash: string): ShellPage {
  const can = permissionCheck(context);
  if (context.isRoot && hash === "#blocks") return "blocks";
  if (context.isRoot && hash === "#uikit") return "uikit";
  if (context.isRoot && hash === "#guild") return "guild";
  if (context.isRoot && hash === "#admin-root") return "admin-root";
  if (context.isRoot && (hash === "#root-distance" || hash === "#root-import")) return "root-distance";
  if (can("admin.people") && hash === "#admin-distance") return "admin-distance";
  if (can("schedule.manage") && hash === "#admin-schedule") return "admin-schedule";
  if (can("admin.people") && (hash === "#admin" || hash === "#admin-people")) return "admin-people";
  if (context.access === "active" && can("schedule") && hash === "#schedule") return "schedule";
  if (context.access === "active" && can("priorities") && hash === "#priorities") return "priorities";
  if (can("profile") && (hash === "#cabinet" || hash === "#cabinet-game")) return "cabinet";
  return defaultShellPage(context);
}
