import { QuickRegsPanel } from "./widgets/QuickRegsPanel";
import { useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardHeader } from "./shell/DashboardHeader";
import { DashboardNavigation } from "./shell/DashboardNavigation";
import { useDashboardSection } from "./shell/useDashboardSection";
import { RegsPanel } from "./widgets/RegsPanel";
import { DetailDialog } from "./ui/DetailDialog";
import { RegistryContext, useRegistry } from "./state/useRegistry";
import { PointsPage } from "./pages/PointsPage";
import { initialPointsState, pointsReducer } from "./state/pointsState";
import { isDevSandboxEnabled } from "../data/config";
import { AnalyticsSourceContext } from "./state/source";
import { resolveAnalyticsMode } from "../data/analytics/http";
import styles from "./dashboard.module.css";
import { MonthlyPage } from "./pages/MonthlyPage";
import { initialMonthlyState, monthlyReducer } from "./state/monthlyState";
import { dashboardHash } from "./shell/routes";
import type { AnalyticsLimit } from "./contracts/points";

export function Dashboard() {
  const { t } = useTranslation("analytics");
  const active = useDashboardSection();
  const [selection, setSelection] = useState(() => typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("analytics-source"));
  const mode = resolveAnalyticsMode(process.env.NODE_ENV === "development", isDevSandboxEnabled(), selection);
  const registry = useRegistry(mode);
  const [regsDialog, setRegsDialog] = useState<{kind:"all"}|{kind:"quick";names:string[]}|null>(null);
  const changeSource = (value: "demo" | "live") => { if (registry.busy) return; setRegsDialog(null); sessionStorage.setItem("analytics-source", value); setSelection(value); };
  const [pointsState, pointsDispatch] = useReducer(pointsReducer, undefined, initialPointsState);
  const [profileState, profileDispatch] = useReducer(monthlyReducer, undefined, initialMonthlyState);
  const [speedState, speedDispatch] = useReducer(monthlyReducer, undefined, initialMonthlyState);
  const [densityState, densityDispatch] = useReducer(monthlyReducer, undefined, initialMonthlyState);
  const openPlayer = (name: string, month: string, limit: AnalyticsLimit) => {
    profileDispatch({ type: "openPlayer", name, month, limit });
    window.location.hash = dashboardHash("profile");
  };
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [active]);

  return (
    <AnalyticsSourceContext.Provider value={mode}><RegistryContext.Provider value={registry}><div className={styles.root} data-testid="dashboard">
      <DashboardNavigation active={active} onRegs={() => setRegsDialog({kind:"all"})} />
      <div className={styles.content} ref={contentRef}>
        <div className={styles.contentInner}>
          <DashboardHeader section={active} headingRef={headingRef} mode={mode} onSource={process.env.NODE_ENV === "development" ? changeSource : undefined} />
          {active === "points" ? <PointsPage onRegs={names => setRegsDialog({kind:"quick",names})} state={pointsState} dispatch={pointsDispatch} demo={mode === "demo"} onPlayer={name => openPlayer(name, pointsState.applied.day.slice(0,7), pointsState.applied.limit)} />
          : active === "profile" ? <MonthlyPage key="profile" section="profile" state={profileState} dispatch={profileDispatch} demo={mode === "demo"} onPlayer={name => openPlayer(name, profileState.applied.month, profileState.applied.limit)} />
          : active === "speed" ? <MonthlyPage key="speed" section="speed" state={speedState} dispatch={speedDispatch} demo={mode === "demo"} onPlayer={name => openPlayer(name, speedState.applied.month, speedState.applied.limit)} />
          : active === "density" ? <MonthlyPage key="density" section="density" state={densityState} dispatch={densityDispatch} demo={mode === "demo"} onPlayer={name => openPlayer(name, densityState.applied.month, densityState.applied.limit)} />
          : <RegsPanel key={mode} onPlayer={name => openPlayer(name, profileState.applied.month, profileState.applied.limit)} />}
          {regsDialog && <DetailDialog wide={regsDialog.kind === "all"} compact={regsDialog.kind === "quick"} title={regsDialog.kind === "all" ? t("sections.regs.title") : t("regs.quickTitle",{count:regsDialog.names.length})} onClose={() => setRegsDialog(null)}>{regsDialog.kind === "quick" ? <QuickRegsPanel names={regsDialog.names} /> : <RegsPanel key={mode} onPlayer={name => { setRegsDialog(null); openPlayer(name, pointsState.applied.day.slice(0,7), pointsState.applied.limit); }} />}</DetailDialog>}
        </div>
      </div>
    </div></RegistryContext.Provider></AnalyticsSourceContext.Provider>
  );
}
