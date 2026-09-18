import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

type Props = {
  dimPast: boolean;
  hidePastDays: boolean;
  showTables: boolean;
  showTip: boolean;
  editPulse: boolean;
  onDimPast: (value: boolean) => void;
  onHidePastDays: (value: boolean) => void;
  onShowTables: (value: boolean) => void;
  onShowTip: (value: boolean) => void;
  onEditPulse: (value: boolean) => void;
  onOpenLook: () => void;
  onClose: () => void;
};

export function V2Settings({
  dimPast,
  hidePastDays,
  showTables,
  showTip,
  editPulse,
  onDimPast,
  onHidePastDays,
  onShowTables,
  onShowTip,
  onEditPulse,
  onOpenLook,
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
          <div>
            <div className="v2-muted text-[11px] tracking-[0.14em] uppercase">{t("schedule.settings")}</div>
            <h2 className="mt-1 text-[18px] font-semibold">{t("schedule.settingsTitle")}</h2>
            <p className="v2-muted mt-1 text-[12px]">{t("schedule.settingsHint")}</p>
          </div>
          <button type="button" className="v2-ctrl w-8" aria-label="close" onClick={onClose}>
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
          <button type="button" className="v2-settings-row" onClick={onOpenLook}>
            <span className="v2-settings-ico" style={{ color: "var(--primary)" }}>
              <i className="fa-solid fa-palette" />
            </span>
            <span className="v2-settings-copy">
              <b>{t("schedule.slotLookTitle")}</b>
              <small>{t("schedule.slotLookHint")}</small>
            </span>
            <i className="fa-solid fa-chevron-right v2-muted text-[11px]" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
