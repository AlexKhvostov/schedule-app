import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

type Props = {
  dimPast: boolean;
  hidePastDays: boolean;
  showTables: boolean;
  showTip: boolean;
  editPulse: boolean;
  showLocalTime: boolean;
  onDimPast: (value: boolean) => void;
  onHidePastDays: (value: boolean) => void;
  onShowTables: (value: boolean) => void;
  onShowTip: (value: boolean) => void;
  onEditPulse: (value: boolean) => void;
  onShowLocalTime: (value: boolean) => void;
  onClose: () => void;
};

export function V2Settings({
  dimPast,
  hidePastDays,
  showTables,
  showTip,
  editPulse,
  showLocalTime,
  onDimPast,
  onHidePastDays,
  onShowTables,
  onShowTip,
  onEditPulse,
  onShowLocalTime,
  onClose,
}: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    {
      key: "tables",
      on: showTables,
      toggle: () => onShowTables(!showTables),
      icon: "fa-table-cells",
      title: t("schedule.showTables"),
      hint: t("schedule.showTablesHint"),
    },
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

  return createPortal(
    <div className="v2-mine-back" onClick={onClose}>
      <div className="v2-settings" onClick={(event) => event.stopPropagation()}>
        <header className="v2-settings-top">
          <h2>{t("schedule.settingsTitle")}</h2>
          <button type="button" className="v2-ctrl w-7 h-7" aria-label="close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </header>
        <div className="v2-settings-list">
          {rows.map((row) => (
            <button key={row.key} type="button" className={`v2-settings-row${row.on ? " is-on" : ""}`} onClick={row.toggle}>
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
