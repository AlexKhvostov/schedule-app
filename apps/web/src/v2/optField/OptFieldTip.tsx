import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { SchedulePlayer } from "../../data/players";
import { monthGridKey, type MonthGridStore } from "../../data/slots";
import { formatLimit, hoursOf, weekdayOf, type CapacityMap } from "../../schedule/capacity";
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
import { type SlotHit, type TipApi, type TipPoint } from "./types";

const TIP_SLACK = 12;

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
  capacity: CapacityMap;
  showTip: boolean;
  countTables?: boolean;
  players?: SchedulePlayer[];
  waitRef: MutableRefObject<TipApi>;
  skin?: "classic" | "theme";
}) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<SlotHit | null>(null);
  const [theme, setTheme] = useState<UiTheme>(() => (typeof window === "undefined" ? "dark" : loadTheme()));
  const nodeRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<TipPoint | null>(null);
  const clock = usePlayerClock();

  useEffect(() => {
    const sync = () => setTheme(loadTheme());
    window.addEventListener("v2-theme", sync);
    return () => window.removeEventListener("v2-theme", sync);
  }, []);

  useEffect(() => {
    waitRef.current = {
      hide: () => {
        restRef.current = null;
        setHover(null);
      },
      show: (hit, rest, force) => {
        if (!showTip && !hit.busyPairs?.length && !force) {
          restRef.current = null;
          setHover(null);
          return;
        }
        restRef.current = rest ?? null;
        setHover(hit);
      },
    };
  }, [showTip, waitRef]);

  useEffect(() => {
    if (!hover) return;
    const hide = () => {
      restRef.current = null;
      setHover(null);
    };
    let armed = false;
    const arm = window.requestAnimationFrame(() => {
      armed = true;
    });
    const onMove = (event: globalThis.PointerEvent) => {
      if (!armed) return;
      const rest = restRef.current;
      if (!rest) return;
      const dx = event.clientX - rest.x;
      const dy = event.clientY - rest.y;
      if (dx * dx + dy * dy >= TIP_SLACK * TIP_SLACK) hide();
    };
    const capture = { capture: true } as const;
    const quiet = { capture: true, passive: true } as const;
    window.addEventListener("pointermove", onMove, quiet);
    window.addEventListener("pointerdown", hide, capture);
    window.addEventListener("wheel", hide, quiet);
    window.addEventListener("keydown", hide, capture);
    window.addEventListener("blur", hide);
    document.addEventListener("scroll", hide, quiet);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.cancelAnimationFrame(arm);
      window.removeEventListener("pointermove", onMove, quiet);
      window.removeEventListener("pointerdown", hide, capture);
      window.removeEventListener("wheel", hide, quiet);
      window.removeEventListener("keydown", hide, capture);
      window.removeEventListener("blur", hide);
      document.removeEventListener("scroll", hide, quiet);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [hover]);

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
  }, [hover]);

  if (!hover) return null;
  const hoursCaps = hoursOf(capacity, hover.limit, hover.day, weekdayOf(year, monthIndex, hover.day));
  const locked = !levelAllowed(hover.half, hover.level, hoursCaps);
  const mark = seatsOf(
    grids[monthGridKey(hover.variant, hover.limit)]?.[hover.dayIdx]?.[hover.half],
    hover.level + 1,
  )[hover.level];
  const displayMark = mark ? markWithPlayerIdentity(mark, players) : null;
  const player = mark ? playerForMark(mark, players) : null;
  const owner = displayMark ? packOwner(displayMark) : null;
  const profileName = player?.profileName?.trim();
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
              <span><i>{t("v2.tip.discord")}</i><em>{owner.discord}</em></span>
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
          <strong>{t("v2.tip.locked", { n: hover.level + 1 })}</strong>
          <p>{t("v2.tip.lockedHint", { cap, need: hover.level + 1 })}</p>
        </div>
      ) : (
        <div className="v2-opt-tip-note">
          <strong>{t("v2.tip.empty")}</strong>
        </div>
      )}
    </div>,
    document.body,
  );
}
