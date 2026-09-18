import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CET, formatClock, tzFromUtcOffset, utcLabel } from "../schedule/cet";
import { loadMembers, memberOfSession } from "../schedule/members";
import { defaultCapacity, loadCapacity, saveCapacity, type CapacityMap } from "../schedule/capacity";
import { defaultHourLoad, loadHourLoad, saveHourLoad, type HourLoadMap } from "../schedule/hourLoad";
import { setAppLanguage } from "../i18n";
import { V2Schedule } from "./V2Schedule";
import { V2Priorities } from "./V2Priorities";
import { V2Admin } from "./V2Admin";
import { V2Cabinet } from "./V2Cabinet";
import { V2Wait } from "./V2Wait";
import { writeSession, type Session } from "./session";
import { V2ShadcnKit } from "./V2ShadcnKit";
import { loadTheme, saveTheme, type UiTheme } from "./theme";
import { loadSlotTheme, SLOT_THEME_EVENT, slotThemeVars } from "../schedule/slotTheme";
import "./v2.css";

type Props = {
  session: Session;
  cursor: Date;
  onCursorChange: (value: Date) => void;
  onSession: (session: Session) => void;
  onLogout: () => void;
};

export function V2Shell({ session, cursor, onCursorChange, onSession, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const nick = session.nick;
  const clock = (() => {
    const mine = memberOfSession(loadMembers(), session);
    return { extra: mine?.showExtraTz === true, utc: mine?.extraUtc ?? 3 };
  })();
  const canGrid = session.access === "active";
  const isRoot = session.role === "root";
  const isAdmin = isRoot || session.role === "admin";
  const [page, setPage] = useState(() => {
    if (typeof window !== "undefined" && window.location.hash === "#uikit") return "uikit";
    return canGrid ? "schedule" : session.access === "profile" ? "cabinet" : "wait";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<UiTheme>(() => (typeof window === "undefined" ? "dark" : loadTheme()));
  const [slotTheme, setSlotTheme] = useState(() => (typeof window === "undefined" ? null : loadSlotTheme()));
  const [capacity, setCapacity] = useState<CapacityMap>(() => (typeof window === "undefined" ? defaultCapacity() : loadCapacity()));
  const [hourLoad, setHourLoad] = useState<HourLoadMap>(() => (typeof window === "undefined" ? defaultHourLoad() : loadHourLoad()));
  const [now, setNow] = useState(() => new Date());
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const mark = nick.slice(0, 2).toUpperCase();

  const menuRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  const goPage = (key: string) => {
    setPage(key);
    setMenuOpen(false);
    if (typeof window === "undefined") return;
    if (key === "uikit") window.location.hash = "uikit";
    else if (window.location.hash === "#uikit") window.history.replaceState(null, "", window.location.pathname);
  };

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const sync = () => setSlotTheme(loadSlotTheme());
    window.addEventListener(SLOT_THEME_EVENT, sync);
    return () => window.removeEventListener(SLOT_THEME_EVENT, sync);
  }, []);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      const node = event.target as Node;
      if (menuRef.current?.contains(node) || paneRef.current?.contains(node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.uiTheme = theme;
  }, [theme]);

  const toggleTheme = () => {
    const next: UiTheme = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    setTheme(next);
  };

  const nav = canGrid
    ? [
        { key: "schedule", label: t("nav.schedule"), icon: "fa-calendar-days" },
        { key: "grid", label: t("nav.grid"), icon: "fa-table-cells" },
        { key: "priorities", label: t("nav.priorities"), icon: "fa-ranking-star" },
      ]
    : [
        { key: "wait", label: t("nav.wait"), icon: "fa-hourglass-half" },
        { key: "cabinet", label: t("nav.cabinet"), icon: "fa-user" },
      ];

  return (
    <div className="v2-stage">
      <div
        className={`v2-root is-kit-base theme-${theme} flex min-h-0 flex-col overflow-hidden`}
        style={(slotTheme ? slotThemeVars(slotTheme) : undefined) as CSSProperties | undefined}
      >
        <header className="v2-top z-30 flex h-10 w-full shrink-0 items-center border-b px-4">
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <div className="flex items-center gap-2 font-semibold">
              <span className="v2-brand-mark v2-mono grid h-6 w-6 place-items-center rounded text-[11px]">
                RP
              </span>
              <span className="v2-brand-name">Red Party</span>
            </div>
            <nav className="v2-nav">
              {nav.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`v2-nav-link${page === item.key ? " is-on" : ""}`}
                  onClick={() => goPage(item.key)}
                >
                  <i className={`fa-solid ${item.icon}`} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-baseline gap-2 px-3">
            <span className="v2-cet v2-mono text-[18px] font-semibold tabular-nums">
              {formatClock(now, CET)}
            </span>
            <span className="v2-cet text-[11px] font-semibold tracking-[0.14em] uppercase">
              CET
            </span>
            {clock.extra ? (
              <>
                <span className="v2-cet-extra ml-2 v2-mono text-[12px] italic tabular-nums">
                  {formatClock(now, tzFromUtcOffset(clock.utc))}
                </span>
                <span className="v2-cet-extra text-[8px] font-medium tracking-[0.08em] uppercase italic">
                  {utcLabel(clock.utc)}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <button
              type="button"
              className="v2-theme-hit"
              title={t(theme === "dark" ? "theme.toLight" : "theme.toDark")}
              aria-label={t(theme === "dark" ? "theme.toLight" : "theme.toDark")}
              onClick={toggleTheme}
            >
              <i className={`fa-solid ${theme === "dark" ? "fa-sun" : "fa-moon"} text-[12px]`} />
            </button>
            <div className="v2-lang">
              {(["ru", "en"] as const).map((code) => (
                <button key={code} type="button" className={lang === code ? "is-on" : ""} onClick={() => setAppLanguage(code)}>
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="v2-account" ref={menuRef}>
              <button
                type="button"
                className={`v2-account-hit${menuOpen ? " is-on" : ""}`}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="v2-account-mark v2-mono grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold">
                  {mark}
                </span>
                <span className="v2-account-name">
                  <b>{nick}</b>
                  <small>{t(isRoot ? "account.roleRoot" : isAdmin ? "account.roleAdmin" : "account.roleMember")}</small>
                </span>
                <i className="fa-solid fa-angle-down text-[10px]" />
              </button>
              {menuOpen &&
                createPortal(
                  <div
                    ref={paneRef}
                    className={`v2-account-menu is-kit theme-${theme}`}
                    style={{
                      position: "fixed",
                      top: (menuRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
                      right: window.innerWidth - (menuRef.current?.getBoundingClientRect().right ?? 0),
                    }}
                  >
                    <button type="button" onClick={() => goPage("cabinet")}>
                      <i className="fa-regular fa-user" />
                      {t("nav.cabinet")}
                    </button>
                    {canGrid ? (
                      <button type="button" onClick={() => goPage("uikit")}>
                        <i className="fa-solid fa-swatchbook" />
                        {t("nav.uikit")}
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button type="button" onClick={() => goPage("admin")}>
                        <i className="fa-solid fa-sliders" />
                        {t("nav.admin")}
                      </button>
                    ) : null}
                  </div>,
                  document.body,
                )}
            </div>
          </div>
        </header>
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          {page === "wait" && <V2Wait session={session} onCabinet={() => setPage("cabinet")} />}
          {page === "cabinet" && (
            <div className="v2-cab-stage min-h-0 flex-1 overflow-auto">
              <V2Cabinet
                session={session}
                onLogout={onLogout}
                onSent={() => {
                  if (session.access === "active") return;
                  const next = { ...session, access: "pending" as const };
                  writeSession(next);
                  onSession(next);
                  setPage("wait");
                }}
              />
            </div>
          )}
          {canGrid && page === "schedule" && (
            <V2Schedule cursor={cursor} onCursorChange={onCursorChange} capacity={capacity} hourLoad={hourLoad} />
          )}
          {canGrid && page === "grid" && (
            <V2Schedule
              skin="theme"
              cursor={cursor}
              onCursorChange={onCursorChange}
              capacity={capacity}
              hourLoad={hourLoad}
            />
          )}
          {canGrid && page === "uikit" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <V2ShadcnKit theme={theme} />
            </div>
          )}
          {canGrid && page === "priorities" && <V2Priorities />}
          {isAdmin && page === "admin" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <V2Admin
                isRoot={isRoot}
                capacity={capacity}
                hourLoad={hourLoad}
                onCapacityChange={(next) => {
                  setCapacity(next);
                  saveCapacity(next);
                }}
                onHourLoadChange={(next) => {
                  setHourLoad(next);
                  saveHourLoad(next);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
