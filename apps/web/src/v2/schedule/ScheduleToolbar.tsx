import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { ScheduleVariant } from "../../data/slots";
import { monthShort, monthTitle } from "../../schedule/formatDate";
import { markKey, type Mark } from "../../schedule/marks";
import { BarMark } from "../SchedulePanels";
import { loadPrefs, savePrefs } from "../prefs";
import type { useScheduleBrush } from "./useScheduleBrush";
import type { useScheduleToolbar } from "./useScheduleToolbar";

type Props = {
  controls: ReturnType<typeof useScheduleToolbar>;
  brush: Pick<ReturnType<typeof useScheduleBrush>, "me" | "tablePresets" | "tablePresetOwnerId" | "selectTablePreset" | "loadTablePresetsForPlayer" | "actPlayers" | "selfId" | "actingId" | "applyActAs">;
  filters: {
    year: number;
    monthIndex: number;
    onCursorChange: (value: Date) => void;
    shiftMonth: (delta: number) => void;
    limits: string[];
    kinds: ScheduleVariant[];
    filterOptionLimits: string[];
    toggleLimit: (value: string) => void;
    toggleKind: (value: ScheduleVariant) => void;
    fieldMarks: Mark[];
  };
  display: {
    editGlow: boolean;
    editPulse: boolean;
    touchLayout: boolean;
    mayActAs: boolean;
    paintOn: boolean;
    countTables: boolean;
    editByButton: boolean;
    canEdit: boolean;
    toggleEdit: () => void;
    isKit: boolean;
    busyHint: boolean;
    setBusyHint: Dispatch<SetStateAction<boolean>>;
  };
  tools: { key: string; icon: string; title: string; on: boolean; run: () => void }[];
};

export function ScheduleToolbar({ controls, brush, filters, display, tools }: Props) {
  const { t, i18n } = useTranslation();
  const { limitsOpen, setLimitsOpen, kindOpen, setKindOpen, monthOpen, setMonthOpen, pickYear, setPickYear, focus, setFocus, toolsOpen, setToolsOpen, searchOpen, setSearchOpen, limitsRef, kindRef, monthRef, toolsRef, searchRef } = controls;
  const { me, tablePresets, tablePresetOwnerId, selectTablePreset, loadTablePresetsForPlayer, actPlayers, selfId, actingId, applyActAs } = brush;
  const { year, monthIndex, onCursorChange, shiftMonth, limits, kinds, filterOptionLimits, toggleLimit, toggleKind, fieldMarks } = filters;
  const { editGlow, editPulse, touchLayout, mayActAs, paintOn, countTables, editByButton, canEdit, toggleEdit, isKit, busyHint, setBusyHint } = display;
  return (
    <section
      className={`v2-sched-bar flex h-10 shrink-0 items-center border-b${editGlow ? " is-edit" : ""}${editGlow && editPulse ? "" : " is-quiet"}`}
      style={{ borderColor: editGlow ? "transparent" : undefined }}
    >
      <div className="v2-filters">
        <button type="button" className="v2-ctrl w-8 v2-month-shift" onClick={() => shiftMonth(-1)} aria-label="prev">
          <i className="fa-solid fa-chevron-left" />
        </button>
        <div className="relative" ref={monthRef}>
          <button
            type="button"
            className="v2-ctrl v2-month-hit"
            aria-expanded={monthOpen}
            aria-haspopup="dialog"
            aria-label={t("schedule.pickMonth")}
            onClick={() => {
              setMonthOpen((open) => {
                const next = !open;
                if (next) setPickYear(year);
                return next;
              });
              setLimitsOpen(false);
              setKindOpen(false);
              setToolsOpen(false);
              setSearchOpen(false);
            }}
          >
            <span className="v2-month-full">{monthTitle(year, monthIndex, i18n.language)}</span>
            <span className="v2-month-short">
              {monthShort(monthIndex, i18n.language)} {year}
            </span>
            <i className="fa-regular fa-calendar v2-muted ml-2" />
          </button>
          {monthOpen && (
            <div className="v2-month-pop" role="dialog" aria-label={t("schedule.pickMonth")}>
              <div className="v2-month-pop-year">
                <button type="button" aria-label={t("schedule.prevYear")} onClick={() => setPickYear((value) => value - 1)}>
                  <i className="fa-solid fa-chevron-left" />
                </button>
                <b>{pickYear}</b>
                <button type="button" aria-label={t("schedule.nextYear")} onClick={() => setPickYear((value) => value + 1)}>
                  <i className="fa-solid fa-chevron-right" />
                </button>
              </div>
              <div className="v2-month-pop-grid">
                {Array.from({ length: 12 }, (_, index) => {
                  const on = pickYear === year && index === monthIndex;
                  const now = new Date();
                  const isNow = pickYear === now.getFullYear() && index === now.getMonth();
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`${on ? "is-on" : ""}${isNow ? " is-now" : ""}`}
                      onClick={() => {
                        onCursorChange(new Date(pickYear, index, 1));
                        setMonthOpen(false);
                      }}
                    >
                      {monthShort(index, i18n.language)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button type="button" className="v2-ctrl w-8 v2-month-shift" onClick={() => shiftMonth(1)} aria-label="next">
          <i className="fa-solid fa-chevron-right" />
        </button>
        <div className="v2-field-wide">
          <div className="v2-limit-wrap relative" ref={limitsRef}>
            <button
              type="button"
              className={`v2-ctrl v2-field-hit v2-limit-hit${limits.length > 1 ? " is-many" : ""}`}
              title={limits.join(" · ")}
              onClick={() => {
                setLimitsOpen((open) => !open);
                setKindOpen(false);
                setMonthOpen(false);
              }}
            >
              <span className="v2-field-lab">{t("schedule.limit")}: </span>
              <span className="v2-mono v2-limit-vals">{limits.join("·")}</span>
              <i className="fa-solid fa-angle-down v2-muted" />
            </button>
            {limitsOpen && (
              <div className="v2-bar-menu">
                {filterOptionLimits.map((value) => {
                  const on = limits.includes(value);
                  return (
                    <button key={value} type="button" className={on ? "is-on" : ""} onClick={() => toggleLimit(value)}>
                      <i className={`fa-solid ${on ? "fa-check-square" : "fa-square"}`} />
                      <span className="v2-mono">{value}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="relative" ref={kindRef}>
            <button
              type="button"
              className="v2-ctrl v2-field-hit"
              onClick={() => {
                setKindOpen((open) => !open);
                setLimitsOpen(false);
                setMonthOpen(false);
              }}
            >
              {kinds.map((variant) => variant === "nitro" ? "Nitro" : "Regular").join(" · ")}
              <i className="fa-solid fa-angle-down v2-muted ml-2" />
            </button>
            {kindOpen && (
              <div className="v2-bar-menu">
                {(
                  [
                    ["nitro", "Nitro"],
                    ["regular", "Regular"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={kinds.includes(value) ? "is-on" : ""}
                    aria-pressed={kinds.includes(value)}
                    onClick={() => {
                      toggleKind(value);
                    }}
                  >
                    <i className={`fa-solid ${kinds.includes(value) ? "fa-check-square" : "fa-square"}`} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <form className="v2-mark-find v2-mark-find-wide relative shrink-0" onSubmit={(e) => e.preventDefault()}>
          <input
            className={`v2-ctrl v2-mark-find-input${focus.trim() ? " has-q" : ""}`}
            list="v2-marks"
            maxLength={4}
            placeholder="Aa"
            title={t("v2.search.hint")}
            aria-label={t("v2.search.hint")}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
          {focus.trim() ? (
            <button
              type="button"
              className="v2-muted absolute top-1/2 right-0.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[10px] hover:text-[var(--foreground)]"
              title={t("v2.search.clear")}
              aria-label={t("v2.search.clear")}
              onClick={() => setFocus("")}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          ) : null}
        </form>
        <div className="v2-mark-pick" ref={searchRef}>
          <button
            type="button"
            className={`v2-ctrl v2-mark-pick-hit${searchOpen || focus.trim() ? " is-on" : ""}`}
            title={t("v2.search.hint")}
            aria-label={t("v2.search.hint")}
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open);
              setMonthOpen(false);
              setLimitsOpen(false);
              setKindOpen(false);
              setToolsOpen(false);
            }}
          >
            <span className="v2-mono">{focus.trim() || t("schedule.searchAll")}</span>
            <i className="fa-solid fa-angle-down v2-muted" />
          </button>
          {searchOpen ? (
            <div className="v2-bar-menu">
              <button
                type="button"
                className={!focus.trim() ? "is-on" : ""}
                onClick={() => {
                  setFocus("");
                  setSearchOpen(false);
                }}
              >
                {t("schedule.searchAll")}
              </button>
              {fieldMarks
                .filter((mark) => mark.t)
                .map((mark) => (
                  <button
                    key={markKey(mark)}
                    type="button"
                    className={focus.trim().toLowerCase() === mark.t.toLowerCase() ? "is-on" : ""}
                    onClick={() => {
                      setFocus(mark.t);
                      setSearchOpen(false);
                    }}
                  >
                    <span className="v2-mono">{mark.t}</span>
                  </button>
                ))}
            </div>
          ) : null}
        </div>
        <datalist id="v2-marks">
          {fieldMarks.filter((mark) => mark.t).map((mark) => (
            <option key={markKey(mark)} value={mark.t} />
          ))}
        </datalist>
      </div>
      {!touchLayout ? <BarMark
        me={me}
        tables={me.tables}
        tablePresets={tablePresets}
        tablePresetOwnerId={tablePresetOwnerId}
        onTableSelect={selectTablePreset}
        onLoadTablePresets={loadTablePresetsForPlayer}
        canActAs={mayActAs && paintOn}
        players={actPlayers}
        selfId={selfId}
        actingId={actingId || selfId}
        onActAs={applyActAs}
        countTables={countTables}
        showEdit={editByButton}
        editOn={canEdit}
        onToggleEdit={toggleEdit}
        showBusyToggle={isKit}
        busyOn={busyHint}
        onToggleBusy={() => {
          const next = !busyHint;
          setBusyHint(next);
          savePrefs({ ...loadPrefs(), busyHint: next });
        }}
      /> : null}
      <div className="v2-tools" ref={toolsRef}>
        <div className="v2-bar-pack v2-tools-pack">
          {tools.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`v2-ctrl w-8${item.on ? " is-on" : ""}`}
              title={item.title}
              aria-pressed={item.on}
              onClick={item.run}
            >
              <i className={item.icon} />
            </button>
          ))}
        </div>
        <div className="v2-tools-fold">
          <button
            type="button"
            className={`v2-tools-fold-hit${toolsOpen ? " is-on" : ""}`}
            title={t("schedule.tools")}
            aria-label={t("schedule.toolsMenu")}
            aria-expanded={toolsOpen}
            onClick={() => {
              setToolsOpen((open) => !open);
              setMonthOpen(false);
              setLimitsOpen(false);
              setKindOpen(false);
              setSearchOpen(false);
            }}
          >
            <i className="fa-solid fa-ellipsis" />
          </button>
          {toolsOpen ? (
            <div className="v2-tools-fold-menu">
              {tools.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={item.on ? "is-on" : ""}
                  onClick={item.run}
                >
                  <i className={item.icon} />
                  {item.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
