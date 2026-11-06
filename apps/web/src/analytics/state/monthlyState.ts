import type { MonthlyQuery, MonthlySection } from "../contracts/monthly";
import { defaultMonthQuery, validMonthQuery } from "../model/monthly";
import { parsePlayerNames } from "../model/pointsFilters";
export type MonthlyState = { draft: MonthlyQuery; applied: MonthlyQuery; playersText: string; revision: number };
export type MonthlyAction = { type: "edit"; value: Partial<MonthlyQuery> } | { type: "players"; value: string; single?: boolean } | { type: "apply"; section: MonthlySection } | { type: "refresh" } | { type: "top"; value: MonthlyQuery["top"] } | { type: "reset"; now: Date } | { type: "openPlayer"; name: string; month: string; limit: MonthlyQuery["limit"] };
export function initialMonthlyState(): MonthlyState { const query = defaultMonthQuery(); return { draft: query, applied: query, playersText: "", revision: 0 }; }
export function monthlyReducer(state: MonthlyState, action: MonthlyAction): MonthlyState {
  switch (action.type) {
    case "edit": return { ...state, draft: { ...state.draft, ...action.value } };
    case "players": return { ...state, playersText: action.value, draft: { ...state.draft, players: action.single ? (action.value.trim() ? [action.value.trim()] : []) : parsePlayerNames(action.value) } };
    case "apply": return validMonthQuery(state.draft, action.section) ? { ...state, applied: state.draft, revision: state.revision + 1 } : state;
    case "refresh": return { ...state, revision: state.revision + 1 };
    case "top": return { ...state, draft: { ...state.draft, top: action.value }, applied: { ...state.applied, top: action.value }, revision: state.revision + 1 };
    case "reset": { const query = defaultMonthQuery(action.now); return { draft: query, applied: query, playersText: "", revision: state.revision + 1 }; }
    case "openPlayer": { const query = { ...defaultMonthQuery(), month: action.month, limit: action.limit, players: [action.name] }; return { draft: query, applied: query, playersText: action.name, revision: state.revision + 1 }; }
  }
}
