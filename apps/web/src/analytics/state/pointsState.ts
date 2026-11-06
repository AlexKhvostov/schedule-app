import type { PointsFilters, PointsControls } from "../contracts/points";
import { defaultPointsFilters, filtersKey, normalizeFilters, validFilters, parsePlayerNames } from "../model/pointsFilters";
export type PointsState = { draft: PointsFilters; playersText: string; applied: PointsFilters; controls: PointsControls; revision: number };
export function initialPointsState(now = new Date()): PointsState {
  const filters = defaultPointsFilters(now);
  return { draft: filters, playersText: "", applied: filters, controls: { top: "10", sort: "points" }, revision: 0 };
}
export type PointsAction =
  | { type: "edit"; value: Partial<PointsFilters> }
  | { type: "players"; value: string }
  | { type: "apply" }
  | { type: "reset"; now: Date }
  | { type: "refresh" }
  | { type: "controls"; value: Partial<PointsControls> };
export function pointsReducer(state: PointsState, action: PointsAction): PointsState {
  switch (action.type) {
    case "edit": return { ...state, draft: { ...state.draft, ...action.value } };
    case "players": return { ...state, playersText: action.value, draft: { ...state.draft, players: parsePlayerNames(action.value) } };
    case "apply": return !validFilters(state.draft) || filtersKey(state.draft) === filtersKey(state.applied) ? state : { ...state, applied: normalizeFilters(state.draft), revision: state.revision + 1 };
    case "reset": {
      const next = initialPointsState(action.now);
      const changed = filtersKey(next.applied) !== filtersKey(state.applied) || next.controls.top !== state.controls.top || next.controls.sort !== state.controls.sort;
      return { ...next, revision: state.revision + Number(changed) };
    }
    case "refresh": return { ...state, revision: state.revision + 1 };
    case "controls": {
      const controls = { ...state.controls, ...action.value };
      return controls.top === state.controls.top && controls.sort === state.controls.sort ? state : { ...state, controls, revision: state.revision + 1 };
    }
  }
}
