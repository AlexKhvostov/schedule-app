import { useTranslation } from "react-i18next";
import { DISPLAY_RANGES, type DisplayRange } from "../schedule/displayRange";
import { DAY_HOURS } from "../schedule/workHours";
import { V2Float } from "./V2Float";

type Props = {
  dimPast: boolean;
  hidePastDays: boolean;
  displayRange: DisplayRange;
  workHours: number[];
  showDisplayRange?: boolean;
  showTables: boolean;
  countTables?: boolean;
  showTip: boolean;
  editPulse: boolean;
  showLocalTime: boolean;
  x: number;
  y: number;
  z: number;
  onMove: (x: number, y: number) => void;
  onFocus: () => void;
  onDimPast: (value: boolean) => void;
  onHidePastDays: (value: boolean) => void;
  onDisplayRange: (value: DisplayRange) => void;
  onWorkHours: (hours: number[]) => void;
  onShowTables: (value: boolean) => void;
  onShowTip: (value: boolean) => void;
  onEditPulse: (value: boolean) => void;
  onShowLocalTime: (value: boolean) => void;
  onResetPrefs: () => void;
  onResetDemo?: () => void;
  onClose: () => void;
};

export function V2Settings({
  dimPast,
  hidePastDays,
  displayRange,
  workHours,
  showDisplayRange = true,
  showTables,
  countTables = false,
  showTip,
  editPulse,
  showLocalTime,
  x,
  y,
  z,
  onMove,
  onFocus,
  onDimPast,
  onHidePastDays,
  onDisplayRange,
  onWorkHours,
  onShowTables,
  onShowTip,
  onEditPulse,
  onShowLocalTime,
  onResetPrefs,
  onResetDemo,
  onClose,
}: Props) {
  const { t } = useTranslation();

  const rows = [
    {
      key: "past",
      on: dimPast,
      toggle: () => onDimPast(!dimPast),
      icon: "fa-circle-half-stroke",
      title: t("schedule.dimPast"),
      hint: t("schedule.dimPastHint"),
    },
    {
      key: "hidePast",
      on: hidePastDays,
      toggle: () => onHidePastDays(!hidePastDays),
      icon: "fa-eye-slash",
      title: t("schedule.hidePastDays"),
      hint: t("schedule.hidePastDaysHint"),
    },
    {
      key: "local",
      on: showLocalTime,
      toggle: () => onShowLocalTime(!showLocalTime),
      icon: "fa-clock",
      title: t("schedule.showLocalTime"),
      hint: t("schedule.showLocalTimeHint"),
    },
    ...(countTables
      ? [
          {
            key: "tables",
            on: showTables,
            toggle: () => onShowTables(!showTables),
            icon: "fa-table-cells",
            title: t("schedule.showTables"),
            hint: t("schedule.showTablesHint"),
          },
        ]
      : []),
    {
      key: "tip",
      on: showTip,
      toggle: () => onShowTip(!showTip),
      icon: "fa-comment-dots",
      title: t("schedule.showTip"),
      hint: t("schedule.showTipHint"),
    },
    {
      key: "pulse",
      on: editPulse,
      toggle: () => onEditPulse(!editPulse),
      icon: "fa-wave-square",
      title: t("schedule.editPulse"),
      hint: t("schedule.editPulseHint"),
    },
  ];

  return (
    <V2Float title={t("schedule.settingsTitle")} x={x} y={y} width={300} z={z} compact onMove={onMove} onFocus={onFocus} onClose={onClose}>
      <div className="v2-settings-list">
        {showDisplayRange ? <section className="v2-settings-range v2-settings-display-range" aria-label={t("schedule.displayRange")}>
          <div className="v2-settings-range-head">
            <b>{t("schedule.displayRange")}</b>
            <small>{t("schedule.displayRangeHint")}</small>
          </div>
          <div className="v2-settings-range-options">
            {DISPLAY_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                className={displayRange === range ? "is-on" : ""}
                aria-pressed={displayRange === range}
                onClick={() => onDisplayRange(range)}
              >
                {t(`schedule.displayRange_${range}`)}
              </button>
            ))}
          </div>
        </section> : null}
        <section className="v2-settings-range" aria-label={t("schedule.workHours")}>
          <div className="v2-settings-range-head">
            <b>{t("schedule.workHours")}</b>
            <small>{t("schedule.workHoursHint")}</small>
          </div>
          <div className="v2-settings-work-hours" role="group" aria-label={t("schedule.workHours")}>
            {Array.from({ length: DAY_HOURS }, (_, hour) => {
              const selected = workHours.includes(hour);
              const label = `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`;
              return (
                <button
                  key={hour}
                  type="button"
                  className={selected ? "is-on" : ""}
                  aria-label={label}
                  aria-pressed={selected}
                  disabled={selected && workHours.length === 1}
                  onClick={() => onWorkHours(
                    selected
                      ? workHours.filter((value) => value !== hour)
                      : [...workHours, hour].sort((a, b) => a - b),
                  )}
                >
                  {String(hour).padStart(2, "0")}
                </button>
              );
            })}
          </div>
        </section>
        {rows.map((row) => (
          <button key={row.key} type="button" className={`v2-settings-row${row.on ? " is-on" : ""}`} title={row.hint} onClick={row.toggle}>
            <span className="v2-settings-ico">
              <i className={`fa-solid ${row.icon}`} />
            </span>
            <span className="v2-settings-copy">
              <b>{row.title}</b>
              <small>{row.hint}</small>
            </span>
            <span className={`v2-settings-switch${row.on ? " is-on" : ""}`} aria-hidden />
          </button>
        ))}
        <button type="button" className="v2-settings-reset" onClick={onResetPrefs}>
          <span className="v2-settings-ico"><i className="fa-solid fa-filter-circle-xmark" /></span>
          <span className="v2-settings-copy">
            <b>{t("schedule.resetView")}</b>
            <small>{t("schedule.resetViewHint")}</small>
          </span>
        </button>
        {onResetDemo ? (
          <button type="button" className="v2-settings-reset" onClick={onResetDemo}>
            <span className="v2-settings-ico"><i className="fa-solid fa-rotate-left" /></span>
            <span className="v2-settings-copy">
              <b>{t("schedule.demoReset")}</b>
              <small>{t("schedule.demoResetHint")}</small>
            </span>
          </button>
        ) : null}
      </div>
    </V2Float>
  );
}
