import { type ReactNode } from "react";
import type { SchedulePlayer } from "../../data/players";
import { type MonthGridStore, type ScheduleVariant } from "../../data/slots";
import { type CapacityMap } from "../../schedule/capacity";
import { type DisplayRange } from "../../schedule/displayRange";
import { type HourLoadMap } from "../../schedule/hourLoad";
import { type Mark } from "../../schedule/marks";
import { type Occupancy } from "../../schedule/plan";
import type { OccupiedPairMatrix, OccupiedSchedulePair } from "../myShifts";
import {
  type OverwriteAsk
} from "../optFieldModel";
import type { SchedulePairRow } from "../variantSchedule";

export type OptFieldProps = {
  year: number;
  monthIndex: number;
  me: Mark;
  self?: Mark;
  showTables: boolean;
  countTables?: boolean;
  mergeAdjacentSlots?: boolean;
  dimPast: boolean;
  hidePastDays?: boolean;
  displayRange?: DisplayRange;
  workHours?: number[];
  showTip: boolean;
  canEdit: boolean;
  quietEdit?: boolean;
  focus: string;
  kinds: ScheduleVariant[];
  limits: string[];
  pairRows?: SchedulePairRow[];
  capacity: CapacityMap;
  grids: MonthGridStore;
  hourLoad?: HourLoadMap;
  onGridChange: (variant: ScheduleVariant, limit: string, next: Occupancy) => void;
  skin?: "classic" | "theme";
  busy?: OccupiedPairMatrix;
  canRemoveForeign?: boolean;
  onOverwriteAsk?: (ask: OverwriteAsk) => void;
  onForeignKept?: () => void;
  cellWidth?: number;
  zoomEnabled?: boolean;
  onCellWidthChange?: (value: number) => void;
  onFitWidthChange?: (value: number) => void;
  footerTools?: ReactNode;
  players?: SchedulePlayer[];
};

export type SlotHit = {
  cell: HTMLElement;
  dayIdx: number;
  day: number;
  half: number;
  hour: number;
  level: number;
  variant: ScheduleVariant;
  limit: string;
  lane: string;
  busyPairs?: OccupiedSchedulePair[];
  rangeStartHalf?: number;
  rangeEndHalf?: number;
  mergedStartHalf?: number;
  mergedEndHalf?: number;
  x: number;
  y: number;
};

export type TipPoint = { x: number; y: number };

export type TipApi = {
  show: (hit: SlotHit, rest?: TipPoint, force?: boolean) => void;
  hide: () => void;
};
