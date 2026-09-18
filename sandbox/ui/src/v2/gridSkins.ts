export const GRID_SKINS = [
  { id: "next", labelKey: "v2.skin.next" },
  { id: "git", labelKey: "v2.skin.git" },
  { id: "table", labelKey: "v2.skin.table" },
  { id: "opt", labelKey: "v2.skin.opt" },
] as const;

export type GridSkinId = (typeof GRID_SKINS)[number]["id"];
