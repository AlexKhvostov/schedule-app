import type { CetStamp } from "../../schedule/cet";
import { V2Settings } from "../V2Settings";
import { loadPrefs, savePrefs } from "../prefs";
import type { WindowPos } from "../windowPos";
import type { useSchedulePreferences } from "./useSchedulePreferences";

type Props = {
  preferences: ReturnType<typeof useSchedulePreferences>;
  year: number;
  monthIndex: number;
  cetTick: CetStamp;
  countTables: boolean;
  window: {
    settingsPos: WindowPos;
    z: number;
    setSettingsPos: (x: number, y: number) => void;
    onFocus: () => void;
    onClose: () => void;
  };
  onResetDemo?: () => void;
};

export function ScheduleViewSettings({ preferences, year, monthIndex, cetTick, countTables, window, onResetDemo }: Props) {
  const { hideTables, setHideTables, dimPast, setDimPast, hidePastDays, setHidePastDays, displayRange, setDisplayRange, workHours, setWorkHours, showTip, setShowTip, editPulse, setEditPulse, showExtraTz, setShowExtraTz, resetPreferences } = preferences;
  const { settingsPos, z, setSettingsPos, onFocus, onClose } = window;
  return (
    <V2Settings
      dimPast={dimPast}
      hidePastDays={hidePastDays}
      displayRange={displayRange}
      workHours={workHours}
      showDisplayRange={cetTick.year === year && cetTick.monthIndex === monthIndex}
      showTables={!hideTables}
      countTables={countTables}
      showTip={showTip}
      editPulse={editPulse}
      showLocalTime={showExtraTz}
      x={settingsPos.x}
      y={settingsPos.y}
      z={z}
      onMove={setSettingsPos}
      onFocus={onFocus}
      onDimPast={(value) => {
        setDimPast(value);
        savePrefs({ ...loadPrefs(), dimPast: value });
      }}
      onHidePastDays={(value) => {
        setHidePastDays(value);
        savePrefs({ ...loadPrefs(), hidePastDays: value });
      }}
      onDisplayRange={(value) => {
        setDisplayRange(value);
        savePrefs({ ...loadPrefs(), displayRange: value });
      }}
      onWorkHours={(hours) => {
        setWorkHours(hours);
        savePrefs({ ...loadPrefs(), workHours: hours });
      }}
      onShowTables={(value) => {
        setHideTables(!value);
        savePrefs({ ...loadPrefs(), hideTables: !value });
      }}
      onShowTip={(value) => {
        setShowTip(value);
        savePrefs({ ...loadPrefs(), showTip: value });
      }}
      onEditPulse={(value) => {
        setEditPulse(value);
        savePrefs({ ...loadPrefs(), editPulse: value });
      }}
      onShowLocalTime={(value) => {
        setShowExtraTz(value);
        savePrefs({ ...loadPrefs(), showExtraTz: value });
      }}
      onResetPrefs={resetPreferences}
      onResetDemo={onResetDemo}
      onClose={onClose}
    />
  );
}
