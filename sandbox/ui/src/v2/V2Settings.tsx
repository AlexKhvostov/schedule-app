import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { R } from "./tokens";

type Props = {
  dimPast: boolean;
  showTables: boolean;
  showTip: boolean;
  onDimPast: (value: boolean) => void;
  onShowTables: (value: boolean) => void;
  onShowTip: (value: boolean) => void;
  onClose: () => void;
};

export function V2Settings({ dimPast, showTables, showTip, onDimPast, onShowTables, onShowTip, onClose }: Props) {
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
  ];

  return createPortal(
    <div className="v2-mine-back" onClick={onClose}>
      <div
        className="v2-settings"
        style={{ background: R.header, borderColor: R.line2 }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="v2-settings-top" style={{ borderColor: R.line }}>
          <div>
            <div className="text-[11px] tracking-[0.14em] uppercase" style={{ color: R.faint }}>
              {t("schedule.settings")}
            </div>
            <h2 className="mt-1 text-[18px] font-semibold" style={{ color: R.text }}>
              {t("schedule.settingsTitle")}
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: R.muted }}>
              {t("schedule.settingsHint")}
            </p>
          </div>
          <button type="button" className="v2-ctrl w-8" aria-label="close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </header>
        <div className="v2-settings-list">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              className={`v2-settings-row${row.on ? " is-on" : ""}`}
              style={{ borderColor: R.line, background: row.on ? "rgba(34, 211, 238, 0.08)" : R.panel }}
              onClick={row.toggle}
            >
              <span className="v2-settings-ico" style={{ color: row.on ? R.cyan : R.faint }}>
                <i className={`fa-solid ${row.icon}`} />
              </span>
              <span className="v2-settings-copy">
                <b style={{ color: R.text }}>{row.title}</b>
                <small style={{ color: R.muted }}>{row.hint}</small>
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
