export const SLOT_LOOK_KEY = "v2-slot-look";
export const SLOT_LOOK_EVENT = "v2-slot-look";

export type SlotLook = {
  futureBg: string;
  futureBorder: string;
  futureBorderW: number;
  pastBg: string;
  pastSat: number;
  pastBright: number;
  markSat: number;
  markBright: number;
};

export const DEFAULT_SLOT_LOOK: SlotLook = {
  futureBg: "#3d4656",
  futureBorder: "#11141a",
  futureBorderW: 0,
  pastBg: "#4a5263",
  pastSat: 0.35,
  pastBright: 0.72,
  markSat: 0.12,
  markBright: 0.46,
};

export function lookToVars(look: SlotLook): Record<string, string> {
  return {
    "--slot-future-bg": look.futureBg,
    "--slot-future-border": look.futureBorder,
    "--slot-future-border-w": `${look.futureBorderW}px`,
    "--slot-past-bg": look.pastBg,
    "--slot-past-sat": String(look.pastSat),
    "--slot-past-bright": String(look.pastBright),
    "--slot-mark-sat": String(look.markSat),
    "--slot-mark-bright": String(look.markBright),
  };
}

export function lookSnippet(look: SlotLook) {
  return JSON.stringify(look, null, 2);
}

export function loadSlotLook(): SlotLook {
  try {
    const raw = localStorage.getItem(SLOT_LOOK_KEY);
    if (!raw) return { ...DEFAULT_SLOT_LOOK };
    const parsed = JSON.parse(raw) as Partial<SlotLook>;
    return { ...DEFAULT_SLOT_LOOK, ...parsed };
  } catch {
    return { ...DEFAULT_SLOT_LOOK };
  }
}

export function saveSlotLook(look: SlotLook) {
  localStorage.setItem(SLOT_LOOK_KEY, JSON.stringify(look));
  window.dispatchEvent(new Event(SLOT_LOOK_EVENT));
}
