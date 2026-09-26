import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { formatLimit } from "../schedule/capacity";
import { weekdayLabelsMonFirst } from "../schedule/formatDate";
import type { Mark } from "../schedule/marks";
import { formatHours } from "../schedule/roster";
import type { SchedulePlayer } from "../data/players";
import { myHoursMatrix } from "./myShifts";
import { PersonAvatar } from "./PersonAvatar";
import { ScheduleSlot } from "./ScheduleSlot";
import { heatFill, rowInitials, whoLines } from "./schedulePresentation";
import { V2Float } from "./V2Float";
import { scheduleZoomPercent } from "./scheduleZoom";

export function BarMark({
  me,
  tables,
  onBump,
  onDraft,
  canActAs,
  players,
  selfId,
  actingId,
  onActAs,
  countTables = false,
  showEdit = false,
  editOn = false,
  onToggleEdit,
  showBusyToggle = false,
  busyOn = false,
  onToggleBusy,
}: {
  me: Mark;
  tables: string;
  onBump: (delta: number) => void;
  onDraft: (value: string) => void;
  canActAs?: boolean;
  players: SchedulePlayer[];
  selfId?: string;
  actingId?: string;
  onActAs: (id: string) => void;
  countTables?: boolean;
  showEdit?: boolean;
  editOn?: boolean;
  onToggleEdit?: () => void;
  showBusyToggle?: boolean;
  busyOn?: boolean;
  onToggleBusy?: () => void;
}) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [whoOpen, setWhoOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const n = Number(tables) || me.tables;
  const isOther = Boolean(actingId && selfId && actingId !== selfId);
  const shown = [...players].sort((a, b) => a.nick.localeCompare(b.nick, undefined, { sensitivity: "base" }));

  useEffect(() => {
    if (!whoOpen) {
      setMenuBox(null);
      return;
    }
    const place = () => {
      const rect = (hitRef.current ?? boxRef.current)?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(280, window.innerWidth - 16);
      const roomBelow = window.innerHeight - rect.bottom - 12;
      const placeAbove = roomBelow < 180;
      const maxH = placeAbove
        ? Math.max(160, Math.min(440, rect.top - 14))
        : Math.max(160, Math.min(440, roomBelow));
      const top = Math.round(placeAbove ? Math.max(8, rect.top - maxH - 6) : rect.bottom + 6);
      let left = Math.round(rect.left);
      if (left + width > window.innerWidth - 8) {
        left = Math.round(Math.max(8, rect.right - width));
      }
      setMenuBox({ top, left, maxH });
    };
    place();
    const close = (event: MouseEvent) => {
      const node = event.target as Node;
      if (boxRef.current?.contains(node) || menuRef.current?.contains(node)) return;
      setWhoOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWhoOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [whoOpen]);

  const slot = (
    <span className="v2-mark-sample">
      <ScheduleSlot letters={me.t} bg={me.bg} fg={me.fg} tables={n} showTables={countTables} />
    </span>
  );

  return (
    <div
      ref={boxRef}
      className={`v2-bar-pack v2-bar-mark${isOther ? " is-proxy" : ""}${countTables ? " is-tables" : ""}${editOn ? " is-edit" : ""}`}
      title={isOther ? t("schedule.actAsWarn") : me.t}
    >
      {canActAs ? (
        <button
          ref={hitRef}
          type="button"
          className={`v2-bar-mark-hit${isOther ? " is-other" : ""}`}
          title={isOther ? t("schedule.actAsWarn") : t("schedule.actAsLabel")}
          aria-label={me.t}
          aria-expanded={whoOpen}
          onClick={() => setWhoOpen((value) => !value)}
        >
          {slot}
        </button>
      ) : (
        <span className="v2-bar-mark-hit">{slot}</span>
      )}
      {showEdit ? (
        <button
          type="button"
          className={`v2-bar-mark-edit${editOn ? " is-on" : ""}`}
          title={t("schedule.editMode")}
          aria-pressed={editOn}
          onClick={onToggleEdit}
        >
          <i className="fa-solid fa-pencil" />
        </button>
      ) : null}
      {showBusyToggle ? (
        <button
          type="button"
          className={`v2-bar-mark-busy${busyOn ? " is-on" : ""}`}
          style={{ ["--busy-mark" as string]: me.bg } as CSSProperties}
          title={t("schedule.busyGlowHint")}
          aria-pressed={busyOn}
          aria-label={t("schedule.busyGlow")}
          onClick={onToggleBusy}
        >
          <span className="v2-bar-mark-busy-knob" aria-hidden />
        </button>
      ) : null}
      {isOther ? (
        <span className="v2-bar-mark-alert">
          <i className="fa-solid fa-triangle-exclamation" title={t("schedule.actAsWarn")} aria-hidden />
          {selfId ? (
            <button
              type="button"
              className="v2-bar-mark-reset"
              title={t("schedule.actAsReset")}
              aria-label={t("schedule.actAsReset")}
              onClick={() => onActAs(selfId)}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          ) : null}
        </span>
      ) : null}
      {countTables ? (
        <div className="v2-mark-dock-step" title={t("schedule.markCardTables")}>
          <button type="button" aria-label="−1" onClick={() => onBump(-1)}>
            <i className="fa-solid fa-minus" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            value={tables}
            onChange={(event) => onDraft(event.target.value)}
          />
          <button type="button" aria-label="+1" onClick={() => onBump(1)}>
            <i className="fa-solid fa-plus" />
          </button>
        </div>
      ) : null}
      {whoOpen && menuBox
        ? createPortal(
            <div
              ref={menuRef}
              className="v2-mark-dock-who-menu v2-bar-mark-who"
              style={{ top: menuBox.top, left: menuBox.left, maxHeight: menuBox.maxH }}
            >
              <ul>
                {shown.length ? (
                  shown.map((row) => {
                    const names = whoLines(row);
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          className={row.id === actingId ? "is-on" : ""}
                          onClick={() => {
                            onActAs(row.id);
                            setWhoOpen(false);
                          }}
                        >
                          <PersonAvatar src={row.avatarUrl} label={rowInitials(names.title, row.markTag)} size="sm" />
                          <span className="v2-mark-sample">
                            <ScheduleSlot letters={row.markTag} bg={row.markBg} fg={row.markFg} tables={row.tables} showTables={countTables} />
                          </span>
                          <span className="v2-mark-dock-who-copy">
                            <b>{names.title}</b>
                            {names.sub ? <small>{names.sub}</small> : null}
                          </span>
                          {row.id === selfId ? <i>{t("schedule.actAsSelf")}</i> : null}
                        </button>
                      </li>
                    );
                  })
                ) : (
                  <li className="is-empty">{t("schedule.actAsEmpty")}</li>
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function MobileScheduleDock({
  cellWidth,
  fitWidth,
  editEnabled,
  editOn,
  onZoomOut,
  onFit,
  onZoomIn,
  onToggleEdit,
  ...markProps
}: Omit<Parameters<typeof BarMark>[0], "showEdit" | "editOn" | "onToggleEdit"> & {
  cellWidth: number;
  fitWidth: number;
  editEnabled: boolean;
  editOn: boolean;
  onZoomOut: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onToggleEdit: () => void;
}) {
  const { t } = useTranslation();
  const fitOn = Math.abs(cellWidth - fitWidth) < 0.02;
  const zoomPercent = scheduleZoomPercent(cellWidth);
  const fitLabel = t("schedule.zoomFit", { percent: scheduleZoomPercent(fitWidth) });

  return (
    <aside className={`v2-mobile-schedule-dock${editOn ? " is-edit" : ""}`} aria-label={t("schedule.mobileTools")}>
      <div className="v2-mobile-edit-row">
        <BarMark {...markProps} showEdit={false} editOn={editOn} />
        <button
          type="button"
          className="v2-mobile-edit"
          disabled={!editOn && !editEnabled}
          aria-pressed={editOn}
          aria-label={editOn ? t("schedule.editDone") : t("schedule.edit")}
          title={!editOn && !editEnabled ? t("schedule.zoomToEdit") : editOn ? t("schedule.editDone") : t("schedule.edit")}
          onClick={onToggleEdit}
        >
          <i className={`fa-solid ${editOn ? "fa-check" : "fa-pencil"}`} />
        </button>
      </div>
      <div className="v2-mobile-zoom" aria-label={t("schedule.zoomControls")}>
        <button type="button" onClick={onZoomOut} disabled={editOn} aria-label={t("schedule.zoomOut")}>
          <i className="fa-solid fa-minus" />
        </button>
        <button
          type="button"
          className={fitOn ? "is-on" : ""}
          onClick={onFit}
          disabled={editOn}
          aria-label={fitLabel}
          title={fitLabel}
        >
          {zoomPercent}%
        </button>
        <button type="button" onClick={onZoomIn} disabled={editOn} aria-label={t("schedule.zoomIn")}>
          <i className="fa-solid fa-plus" />
        </button>
      </div>
    </aside>
  );
}

export function HoursPanel({
  matrix,
  year,
  monthIndex,
  x,
  y,
  z,
  onMove,
  onFocus,
  onClose,
}: {
  matrix: ReturnType<typeof myHoursMatrix>;
  year: number;
  monthIndex: number;
  x: number;
  y: number;
  z: number;
  onMove: (x: number, y: number) => void;
  onFocus: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const cols = matrix.limits;
  const dayMax = Math.max(0, ...matrix.dayTotals);
  const pad = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array.from({ length: pad }, () => null), ...matrix.hours.map((_, i) => i)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const wdays = weekdayLabelsMonFirst(i18n.language);

  return (
    <V2Float
      title={t("schedule.hoursTitle")}
      x={x}
      y={y}
      width={312}
      z={z}
      compact
      className="v2-hours-float"
      onMove={onMove}
      onFocus={onFocus}
      onClose={onClose}
    >
      {cols.length ? (
        <div className="v2-hours-body">
          <table className="v2-hours-summary">
            <thead>
              <tr>
                <th>{t("schedule.hoursStatLimit")}</th>
                <th title={t("schedule.hoursStatMarksHint")}>{t("schedule.hoursStatMarks")}</th>
                <th title={t("schedule.hoursStatHoursHint")}>{t("schedule.hoursStatHours")}</th>
                <th className="is-left" title={t("schedule.hoursStatLeftHint")}>
                  {t("schedule.hoursStatLeft")}
                </th>
              </tr>
            </thead>
            <tbody>
              {cols.map((limit) => (
                <tr key={limit}>
                  <th>{formatLimit(limit)}</th>
                  <td className={matrix.counts[limit] ? "is-on" : ""}>{matrix.counts[limit] || 0}</td>
                  <td className={matrix.totals[limit] ? "is-on" : ""}>{formatHours(matrix.totals[limit] || 0)}</td>
                  <td className={`is-left${matrix.left[limit] ? " is-on" : ""}`}>{formatHours(matrix.left[limit] || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{t("schedule.hoursStatTotal")}</th>
                <td className={matrix.countGrand ? "is-on" : ""}>{matrix.countGrand || 0}</td>
                <td className={matrix.grand ? "is-on" : ""}>{formatHours(matrix.grand || 0)}</td>
                <td className={`is-left is-grand${matrix.leftGrand ? " is-on" : ""}`}>{formatHours(matrix.leftGrand || 0)}</td>
              </tr>
            </tfoot>
          </table>
          <table className="v2-hours-cal">
            <thead>
              <tr>
                {wdays.map((day) => (
                  <th key={day}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map((dayIdx, di) => {
                    if (dayIdx === null) return <td key={`${wi}-${di}`} className="is-out" />;
                    const value = matrix.dayTotals[dayIdx] || 0;
                    return (
                      <td
                        key={dayIdx}
                        className={value ? "is-on" : "is-empty"}
                        style={heatFill(value, dayMax, "day")}
                        title={`${dayIdx + 1}: ${value ? formatHours(value) : "0"}`}
                      >
                        <b>{dayIdx + 1}</b>
                        <em>{value ? formatHours(value) : ""}</em>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="v2-mark-plan-note">{t("schedule.planLimitsEmpty")}</p>
      )}
    </V2Float>
  );
}
