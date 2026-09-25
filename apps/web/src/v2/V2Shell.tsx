import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CET, formatHm, tzFromUtcOffset, savePlayerUtc } from "../schedule/cet";
import { loadMembers, memberOfSession } from "../schedule/members";
import { defaultCapacity, loadCapacity, saveCapacity, type CapacityMap } from "../schedule/capacity";
import { defaultHourLoad, loadHourLoad, saveHourLoad, type HourLoadMap } from "../schedule/hourLoad";
import { isLiveData } from "../data/config";
import { loadMyCabinet } from "../data/people";
import { loadCapacityLive, saveCapacityLive } from "../data/capacityLive";
import { loadPrefs } from "./prefs";
import { setAppLanguage } from "../i18n";
import { V2Home } from "./V2Home";
import { V2Wait } from "./V2Wait";
import { writeSession, type Session } from "./session";
import { PersonAvatar } from "./PersonAvatar";
import { CompactMenu, CompactMenuGroup, CompactMenuItem } from "@/components/ui/compact-menu";
import { loadTheme, saveTheme, type UiTheme } from "./theme";
import { loadSlotTheme, SLOT_THEME_EVENT, slotThemeVars } from "../schedule/slotTheme";
import { usePlayerClock } from "./usePlayerClock";
import "./v2.css";

const V2Schedule = lazy(() => import("./V2Schedule").then((module) => ({ default: module.V2Schedule })));
const V2Priorities = lazy(() => import("./V2Priorities").then((module) => ({ default: module.V2Priorities })));
const V2Admin = lazy(() => import("./V2Admin").then((module) => ({ default: module.V2Admin })));
const V2Distances = lazy(() => import("./V2Distances").then((module) => ({ default: module.V2Distances })));
const V2DistanceBook = lazy(() => import("./V2DistanceBook").then((module) => ({ default: module.V2DistanceBook })));
const V2Cabinet = lazy(() => import("./V2Cabinet").then((module) => ({ default: module.V2Cabinet })));
const V2Guild = lazy(() => import("./V2Guild").then((module) => ({ default: module.V2Guild })));
const V2ShadcnKit = lazy(() => import("./V2ShadcnKit").then((module) => ({ default: module.V2ShadcnKit })));
const V2BlocksKit = lazy(() => import("./V2BlocksKit").then((module) => ({ default: module.V2BlocksKit })));

type Props = {
  session: Session;
  cursor: Date;
  onCursorChange: (value: Date) => void;
  onSession: (session: Session) => void;
  onLogout: () => void;
};

function V2HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  const clock = usePlayerClock();

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="v2-clock" title="CET">
      <span className="v2-clock-time v2-mono">{formatHm(now, CET)}</span>
      <span className="v2-clock-tag">CET</span>
      {clock.showLocal ? (
        <>
          <span className="v2-clock-extra v2-mono">{formatHm(now, tzFromUtcOffset(clock.utc))}</span>
          <span className="v2-clock-extra is-label">{clock.label}</span>
        </>
      ) : null}
    </div>
  );
}

type StaffItem = { key: string; label: string; icon: string; hint?: string };

function bootPage(isRoot: boolean, permissions: string[] = []) {
  const allowed = new Set(permissions);
  const can = (permission: string) => isRoot || allowed.has(permission);
  if (typeof window !== "undefined") {
    const hash = window.location.hash;
    if (isRoot && hash === "#blocks") return "blocks";
    if (isRoot && hash === "#uikit") return "uikit";
    if (isRoot && hash === "#guild") return "guild";
    if (isRoot && hash === "#admin-root") return "admin-root";
    if (isRoot && (hash === "#root-distance" || hash === "#root-import")) return "root-distance";
    if (can("admin.people") && hash === "#admin-distance") return "admin-distance";
    if (can("schedule.manage") && hash === "#admin-schedule") return "admin-schedule";
    if (can("admin.people") && (hash === "#admin" || hash === "#admin-people")) return "admin-people";
    if (can("schedule") && hash === "#schedule") return "schedule";
    if (can("priorities") && hash === "#priorities") return "priorities";
    if (can("profile") && hash === "#cabinet") return "cabinet";
  }
  return "home";
}

export function V2Shell({ session, cursor, onCursorChange, onSession, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const nick = session.nick;
  const permissions = session.permissions ?? [];
  const isRoot = session.role === "root";
  const menuPermissions = useMemo(
    () => (!isLiveData() && !isRoot ? [...new Set([...permissions, "profile", "schedule", "priorities"])] : permissions),
    [isRoot, permissions],
  );
  const can = (permission: string) => isRoot || menuPermissions.includes(permission);
  const canGrid = session.access === "active" && can("schedule");
  const canProfile = can("profile");
  const canPriorities = session.access === "active" && can("priorities");
  const canPeople = can("admin.people");
  const canScheduleAdmin = can("schedule.manage");
  const isAdmin = isRoot || canPeople || canScheduleAdmin;
  const [page, setPage] = useState(() => bootPage(isRoot, menuPermissions));
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [theme, setTheme] = useState<UiTheme>(() => (typeof window === "undefined" ? "dark" : loadTheme()));
  const [slotTheme, setSlotTheme] = useState(() => (typeof window === "undefined" ? null : loadSlotTheme()));
  const [capacity, setCapacity] = useState<CapacityMap>(() => (typeof window === "undefined" ? defaultCapacity() : loadCapacity()));
  const [adminCapacity, setAdminCapacity] = useState<CapacityMap>(() => (typeof window === "undefined" ? defaultCapacity() : loadCapacity()));
  const [adminVariant, setAdminVariant] = useState<"nitro" | "regular">(() => (typeof window === "undefined" ? "nitro" : loadPrefs().kind));
  const [hourLoad, setHourLoad] = useState<HourLoadMap>(() => (typeof window === "undefined" ? defaultHourLoad() : loadHourLoad()));
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const demoAvatar = !isLiveData() ? memberOfSession(loadMembers(), session)?.avatar : "";
  const avatarUrl = session.avatarUrl || demoAvatar || null;

  const menuRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const adminRef = useRef<HTMLDivElement>(null);
  const adminPaneRef = useRef<HTMLDivElement>(null);

  const goPage = (key: string) => {
    setPage(key);
    setMenuOpen(false);
    setAdminOpen(false);
    if (typeof window === "undefined") return;
    const hashes: Record<string, string> = {
      home: "home",
      schedule: "schedule",
      priorities: "priorities",
      cabinet: "cabinet",
      uikit: "uikit",
      blocks: "blocks",
      guild: "guild",
      "admin-people": "admin",
      "root-distance": "root-distance",
      "admin-distance": "admin-distance",
      "admin-schedule": "admin-schedule",
      "admin-root": "admin-root",
    };
    const nextHash = hashes[key];
    if (nextHash) window.location.hash = nextHash;
    else if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  };

  const pages: StaffItem[] = [
    { key: "home", label: t("nav.home"), icon: "fa-house" },
    ...(canGrid ? [{ key: "schedule", label: t("nav.schedule"), icon: "fa-calendar-days" }] : []),
    ...(canPriorities ? [{ key: "priorities", label: t("nav.priorities"), icon: "fa-ranking-star" }] : []),
  ];

  const clubItems: StaffItem[] = [
    ...(canPeople ? [{ key: "admin-people", label: t("nav.adminPeople"), icon: "fa-users", hint: t("nav.adminPeopleHint") }] : []),
    ...(canPeople ? [{ key: "admin-distance", label: t("nav.adminDistance"), icon: "fa-chart-column", hint: t("nav.adminDistanceHint") }] : []),
    ...(canScheduleAdmin ? [{ key: "admin-schedule", label: t("nav.adminSchedule"), icon: "fa-sliders", hint: t("nav.adminScheduleHint") }] : []),
  ];
  const rootItems: StaffItem[] = isRoot
    ? [
        { key: "admin-root", label: t("nav.root"), icon: "fa-key", hint: t("nav.adminRootHint") },
        { key: "root-distance", label: t("nav.rootImport"), icon: "fa-file-csv", hint: t("nav.rootImportHint") },
        { key: "uikit", label: t("nav.uikit"), icon: "fa-swatchbook" },
        { key: "blocks", label: t("nav.uikitBlocks"), icon: "fa-layer-group" },
        { key: "guild", label: t("nav.guild"), icon: "fa-brands fa-discord" },
      ]
    : [];
  const staffOn = page.startsWith("admin") || page === "root-distance" || page === "uikit" || page === "blocks" || page === "guild";

  useEffect(() => {
    if (page === "wait" && session.access === "active") setPage("home");
    if (page === "cabinet" && !canProfile) setPage("home");
    if (page === "schedule" && !canGrid) setPage("home");
    if (page === "priorities" && !canPriorities) setPage("home");
    if (page === "admin-distance" && !canPeople) setPage("home");
  }, [session.access, page, canProfile, canGrid, canPriorities]);

  useEffect(() => {
    const sync = () => setPage(bootPage(isRoot, menuPermissions));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [isRoot, menuPermissions]);

  useEffect(() => {
    if (isLiveData()) {
      if (!session.memberId) return;
      void loadMyCabinet(session.memberId).then((card) => {
        if (card) savePlayerUtc(card.extraUtc);
      });
      return;
    }
    const mine = memberOfSession(loadMembers(), session);
    savePlayerUtc(mine?.extraUtc ?? 3);
  }, [session]);

  useEffect(() => {
    if (!isLiveData()) return;
    void loadCapacityLive(loadPrefs().kind).then((next) => {
      if (next) {
        setCapacity(next);
        setAdminCapacity(next);
      }
    });
  }, []);

  useEffect(() => {
    const sync = () => setSlotTheme(loadSlotTheme());
    window.addEventListener(SLOT_THEME_EVENT, sync);
    return () => window.removeEventListener(SLOT_THEME_EVENT, sync);
  }, []);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!menuRef.current?.contains(node) && !paneRef.current?.contains(node)) setMenuOpen(false);
      if (!adminRef.current?.contains(node) && !adminPaneRef.current?.contains(node)) setAdminOpen(false);
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

  return (
    <div className="v2-stage">
      <div
        className={`v2-root is-kit-base theme-${theme} flex min-h-0 flex-col overflow-hidden`}
        style={(slotTheme ? slotThemeVars(slotTheme) : undefined) as CSSProperties | undefined}
      >
        <header className="v2-top">
          <div className="v2-top-start">
            <div className="v2-brand">
              <span className="v2-brand-mark v2-mono">RP</span>
              <span className="v2-brand-name">Red Party</span>
            </div>
            <nav className="v2-nav" aria-label={t("nav.menu")}>
              {pages.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`v2-nav-link${page === item.key ? " is-on" : ""}`}
                  onClick={() => goPage(item.key)}
                >
                  <i className={`fa-solid ${item.icon}`} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
          <V2HeaderClock />
          <div className="v2-top-end">
            {isAdmin ? (
              <div className="v2-staff" ref={adminRef}>
                <button
                  type="button"
                  className={`v2-staff-hit${adminOpen || staffOn ? " is-on" : ""}`}
                  aria-expanded={adminOpen}
                  aria-label={t("nav.adminOpen")}
                  onClick={() => {
                    setAdminOpen((open) => !open);
                    setMenuOpen(false);
                  }}
                >
                  <i className="fa-solid fa-shield-halved" />
                  <span>{t("nav.adminMenu")}</span>
                </button>
                {adminOpen &&
                  createPortal(
                    <CompactMenu
                      ref={adminPaneRef}
                      className={`is-kit theme-${theme}`}
                      style={{
                        position: "fixed",
                        top: (adminRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
                        right: window.innerWidth - (adminRef.current?.getBoundingClientRect().right ?? 0),
                      }}
                    >
                      <CompactMenuGroup label={t("nav.club")}>
                        {clubItems.map((item) => (
                          <CompactMenuItem
                            key={item.key}
                            icon={item.icon}
                            label={item.label}
                            hint={item.hint}
                            active={page === item.key}
                            onClick={() => goPage(item.key)}
                          />
                        ))}
                      </CompactMenuGroup>
                      {rootItems.length ? (
                        <CompactMenuGroup label={t("nav.root")} tone="root">
                          {rootItems.map((item) => (
                            <CompactMenuItem
                              key={item.key}
                              icon={item.icon}
                              label={item.label}
                              hint={item.hint}
                              active={page === item.key}
                              onClick={() => goPage(item.key)}
                            />
                          ))}
                        </CompactMenuGroup>
                      ) : null}
                    </CompactMenu>,
                    document.body,
                  )}
              </div>
            ) : null}
            <div className="v2-account" ref={menuRef}>
              <button
                type="button"
                className={`v2-account-hit${menuOpen || page === "cabinet" ? " is-on" : ""}`}
                aria-label={nick}
                onClick={() => {
                  setMenuOpen((open) => !open);
                  setAdminOpen(false);
                }}
              >
                <PersonAvatar src={avatarUrl} label={nick} size="sm" />
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
                    <div className="v2-account-who">
                      <b>{nick}</b>
                      <small>{t(isRoot ? "account.roleRoot" : isAdmin ? "account.roleAdmin" : session.role === "staff" ? "account.roleStaff" : "account.roleMember")}</small>
                    </div>
                    {canProfile ? (
                    <button type="button" className={`v2-account-cab${page === "cabinet" ? " is-on" : ""}`} onClick={() => goPage("cabinet")}>
                      <i className="fa-solid fa-id-card" />
                      <span>{t("nav.cabinet")}</span>
                      <i className="fa-solid fa-angle-right" />
                    </button>
                    ) : null}
                    <div className="v2-account-prefs">
                      <div className="v2-account-pref">
                        <span>{t("account.theme")}</span>
                        <div className="v2-toggle" role="group" aria-label={t("account.theme")}>
                          <button
                            type="button"
                            className={theme === "dark" ? "is-on" : ""}
                            aria-pressed={theme === "dark"}
                            title={t("theme.toDark")}
                            onClick={() => theme !== "dark" && toggleTheme()}
                          >
                            <i className="fa-solid fa-moon" />
                          </button>
                          <button
                            type="button"
                            className={theme === "light" ? "is-on" : ""}
                            aria-pressed={theme === "light"}
                            title={t("theme.toLight")}
                            onClick={() => theme !== "light" && toggleTheme()}
                          >
                            <i className="fa-solid fa-sun" />
                          </button>
                        </div>
                      </div>
                      <div className="v2-account-pref">
                        <span>{t("account.language")}</span>
                        <div className="v2-toggle" role="group" aria-label={t("account.language")}>
                          {(["ru", "en"] as const).map((code) => (
                            <button
                              key={code}
                              type="button"
                              className={lang === code ? "is-on" : ""}
                              aria-pressed={lang === code}
                              onClick={() => setAppLanguage(code)}
                            >
                              {code.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>,
                  document.body,
                )}
            </div>
          </div>
        </header>
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <Suspense fallback={<div className="min-h-0 flex-1" aria-busy="true" />}>
          {page === "home" && <V2Home nick={nick} />}
          {page === "wait" && <V2Wait session={session} onSession={onSession} onCabinet={() => goPage(canProfile ? "cabinet" : "home")} />}
          {canProfile && page === "cabinet" && (
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
            <V2Schedule
              skin="theme"
              cursor={cursor}
              onCursorChange={onCursorChange}
              capacity={capacity}
              hourLoad={hourLoad}
              memberId={session.memberId}
              canActAs={isAdmin}
              onKindChange={(kind) => {
                if (!isLiveData()) return;
                void loadCapacityLive(kind).then((next) => {
                  if (next) setCapacity(next);
                });
              }}
            />
          )}
          {isRoot && page === "uikit" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <V2ShadcnKit theme={theme} />
            </div>
          )}
          {isRoot && page === "blocks" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <V2BlocksKit />
            </div>
          )}
          {canPriorities && page === "priorities" && <V2Priorities />}
          {isRoot && page === "guild" && <V2Guild />}
          {canPeople && page === "admin-distance" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <V2DistanceBook />
            </div>
          )}
          {isRoot && page === "root-distance" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <V2Distances />
            </div>
          )}
          {((page === "admin-people" && canPeople) || (page === "admin-schedule" && canScheduleAdmin) || (page === "admin-root" && isRoot)) && (
            <div className="min-h-0 flex-1 overflow-auto">
              <V2Admin
                isRoot={isRoot}
                section={page === "admin-root" ? "root" : page === "admin-schedule" ? "schedule" : "people"}
                variant={adminVariant}
                capacity={adminCapacity}
                hourLoad={hourLoad}
                onVariantChange={(next) => {
                  setAdminVariant(next);
                  if (isLiveData()) {
                    void loadCapacityLive(next).then((map) => {
                      if (map) setAdminCapacity(map);
                    });
                  }
                }}
                onCapacityChange={(next) => {
                  setAdminCapacity(next);
                  saveCapacity(next);
                  if (adminVariant === loadPrefs().kind) setCapacity(next);
                  if (isLiveData()) void saveCapacityLive(adminVariant, next);
                }}
                onHourLoadChange={(next) => {
                  setHourLoad(next);
                  saveHourLoad(next);
                }}
              />
            </div>
          )}
          </Suspense>
        </div>
        <footer className="v2-app-foot">Red Party</footer>
      </div>
    </div>
  );
}
