import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { SchedulePlayer } from "../../data/players";
import { monthGridKey, type MonthGridStore } from "../../data/slots";
import { formatLimit, hoursOf, weekdayOf, type VariantCapacityMap } from "../../schedule/capacity";
import { levelAllowed, seatsOf } from "../../schedule/plan";
import {
  displayNick,
  markWithPlayerIdentity,
  packOwner,
  playerForMark,
  slotHoursValue,
  slotRangeSpan,
  tablesLabel,
  tipDate
} from "../optFieldModel";
import { PersonAvatar } from "../PersonAvatar";
import { MarkFace } from "../ScheduleSlot";
import { loadTheme, type UiTheme } from "../theme";
import { usePlayerClock } from "../usePlayerClock";
import { type SlotHit, type TipApi } from "./types";
import { useClubLimitPalette } from "../ClubLimitPalette";
import { SlotHistoryDialog } from "./SlotHistoryDialog";
import type { SlotHistoryTarget } from "../../data/slotHistory";
import type { Mark } from "../../schedule/marks";

const TIP_CLOSE_DELAY = 200;

export function OptTip({
  year,
  monthIndex,
  grids,
  capacity,
  showTip,
  countTables = false,
  players = [],
  waitRef,
  skin,
}: {
  year: number;
  monthIndex: number;
  grids: MonthGridStore;
  capacity: VariantCapacityMap;
  showTip: boolean;
  countTables?: boolean;
  players?: SchedulePlayer[];
  waitRef: MutableRefObject<TipApi>;
  skin?: "classic" | "theme";
}) {
  const { t, i18n } = useTranslation();
  const { lockedAppearance } = useClubLimitPalette();
  const [hover, setHover] = useState<SlotHit | null>(null);
  const [theme, setTheme] = useState<UiTheme>(() => (typeof window === "undefined" ? "dark" : loadTheme()));
  const nodeRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [history, setHistory] = useState<{ target: SlotHistoryTarget; mark: Mark | null; cell: HTMLElement } | null>(null);
  const keepOpen = useCallback(() => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const hide = useCallback(() => { keepOpen(); setHover(null); }, [keepOpen]);
  const hideSoon = useCallback(() => {
    if (nodeRef.current?.contains(document.activeElement) || closeTimer.current !== null) return;
    closeTimer.current = setTimeout(() => { closeTimer.current = null; setHover(null); }, TIP_CLOSE_DELAY);
  }, []);
  const clock = usePlayerClock();

  useEffect(() => {
    const sync = () => setTheme(loadTheme());
    window.addEventListener("v2-theme", sync);
    return () => window.removeEventListener("v2-theme", sync);
  }, []);

  useEffect(() => {
    waitRef.current = {
      hide, hideSoon,
      show: (hit, _rest, force) => {
        keepOpen();
        if (!showTip && !hit.busyPairs?.length && !force) { setHover(null); return; }
        setHover(hit);
      },
    };
    return keepOpen;
  }, [showTip, waitRef, hide, hideSoon, keepOpen]);

  useEffect(() => {
    if (!hover) return;
    const inside = (target: EventTarget | null) => target instanceof Node
      && (nodeRef.current?.contains(target) || hover.cell.contains(target));
    const onMove = (event: globalThis.PointerEvent) => { if (inside(event.target)) keepOpen(); else hideSoon(); };
    const onDown = (event: globalThis.PointerEvent) => { if (!nodeRef.current?.contains(event.target as Node)) hide(); };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { hide(); hover.cell.focus({ preventScroll: true }); }
    };
    const onScroll = (event: Event) => { if (!nodeRef.current?.contains(event.target as Node)) hide(); };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", hide);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("visibilitychange", hide);
    return () => {
      keepOpen();
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", hide);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [hover, hide, hideSoon, keepOpen]);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const pad = 8;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    let left = Number.parseFloat(node.style.left) || 0;
    let top = Number.parseFloat(node.style.top) || 0;
    if (left + width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - width - pad);
    if (top + height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - height - pad);
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
    if (hover?.focusHistory) node.querySelector<HTMLButtonElement>("button")?.focus();
  }, [hover]);

  if (history) return createPortal(<SlotHistoryDialog target={history.target} mark={history.mark} returnFocus={history.cell} onClose={() => setHistory(null)} />, document.body);
  if (!hover) return null;
  const hoursCaps = hoursOf(capacity[hover.variant], hover.limit, hover.day, weekdayOf(year, monthIndex, hover.day));
  const locked = !levelAllowed(hover.half, hover.level, hoursCaps);
  const mark = seatsOf(
    grids[monthGridKey(hover.variant, hover.limit)]?.[hover.dayIdx]?.[hover.half],
    hover.level + 1,
  )[hover.level];
  const displayMark = mark ? markWithPlayerIdentity(mark, players) : null;
  const owner = displayMark ? packOwner(displayMark) : null;
  const profileName = displayMark ? playerForMark(displayMark, players)?.profileName?.trim() : undefined;
  const cap = hoursCaps[Math.floor(hover.half / 2)] ?? 1;
  const rangeStartHalf = hover.rangeStartHalf ?? hover.half;
  const rangeEndHalf = hover.rangeEndHalf ?? hover.half + 1;
  const mergedRange = rangeEndHalf - rangeStartHalf > 1;
  const timeSpan = slotRangeSpan(rangeStartHalf, rangeEndHalf - 1);

  return createPortal(
    <div
      ref={nodeRef}
      className={`v2-opt-tip theme-${theme}${skin === "theme" ? " is-kit" : ""}`}
      style={{ left: hover.x, top: hover.y }}
      role="dialog"
      aria-label={t("slotHistory.slotInfo")}
      onPointerEnter={keepOpen}
      onPointerLeave={hideSoon}
      onFocusCapture={keepOpen}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) hideSoon(); }}
    >
      <div className="v2-opt-tip-context">
        <div className="v2-opt-tip-meta">
          <span className="v2-opt-tip-kind" data-variant={hover.variant}>
            {t(`v2.tip.${hover.variant}`)}
          </span>
          <span className="v2-opt-tip-limit">{formatLimit(hover.limit)}</span>
        </div>
        <b>{tipDate(year, monthIndex, hover.day, i18n.language)}</b>
      </div>
      <div className="v2-opt-tip-times">
        <div className="v2-opt-tip-time is-cet">
          <i>{t("v2.tip.cet")}</i>
          <b>{timeSpan}</b>
          {mergedRange ? <small>{t("v2.tip.duration", { hours: slotHoursValue(rangeStartHalf, rangeEndHalf, i18n.language) })}</small> : null}
        </div>
        {clock.showLocal ? (
          <div className="v2-opt-tip-time is-local">
            <i>{clock.label}</i>
            <b>{slotRangeSpan(rangeStartHalf, rangeEndHalf - 1, clock.offset)}</b>
          </div>
        ) : null}
      </div>
      {hover.busyPairs?.length ? (
        <div className="v2-opt-tip-note">
          <strong>{t("v2.tip.busy", {
            limit: hover.busyPairs
              .map((item) => `${t(`v2.tip.${item.variant}`)} · ${formatLimit(item.limit)}`)
              .join(", "),
          })}</strong>
          <p>{t("v2.tip.busyHint")}</p>
        </div>
      ) : displayMark && owner ? (
        <div className="v2-opt-tip-who">
          <PersonAvatar src={owner.avatarUrl} label={owner.discord} size="md" />
          <div className="v2-opt-tip-person">
            {profileName ? <b>{profileName}</b> : null}
            <div className="v2-opt-tip-nicks">
              <span><i>{t("v2.tip.discord")}</i><em>{displayNick(owner.discord)}</em></span>
              <span><i>{t("v2.tip.gameNick")}</i><em>{displayNick(owner.room)}</em></span>
            </div>
            {countTables ? <small>{tablesLabel(displayMark.tables, i18n.language)}</small> : null}
          </div>
          <span
            className="v2-opt-tip-mark"
            style={{ ["--mark" as string]: displayMark.bg, ["--mark-ink" as string]: displayMark.fg }}
          >
            <MarkFace letters={displayMark.t.trim() || "—"} tables={displayMark.tables} showTables={countTables} />
          </span>
        </div>
      ) : locked ? (
        <div className="v2-opt-tip-note">
          <strong>{lockedAppearance.short.trim() || t("v2.tip.locked", { n: hover.level + 1 })}</strong>
          {lockedAppearance.long.trim() && <p>{lockedAppearance.long}</p>}
          <p>{t("v2.tip.lockedHint", { cap, need: hover.level + 1 })}</p>
        </div>
      ) : (
        <div className="v2-opt-tip-note">
          <strong>{t("v2.tip.empty")}</strong>
        </div>
      )}
      <div className="v2-opt-tip-actions"><button type="button" onClick={() => {
        const target: SlotHistoryTarget = { date: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(hover.day).padStart(2, "0")}`, half: hover.half, level: hover.level, variant: hover.variant, limit: hover.limit };
        setHistory({ target, mark: displayMark, cell: hover.cell });
        hide();
      }}><i className="fa-solid fa-clock-rotate-left" aria-hidden />{t("slotHistory.open")}</button></div>
    </div>,
    document.body,
  );
}
