import type { TFunction } from "i18next";
import { Button } from "../../components/ui/button";
import type { MonthLoadProgress } from "../../data/slots";

export function ScheduleLoading({ error, progress, onRetry, t }: {
  error: boolean;
  progress?: MonthLoadProgress;
  onRetry: () => void;
  t: TFunction;
}) {
  const total = progress?.totalPages;
  const completed = progress?.completedPages ?? 0;
  const known = total != null && total > 0;
  const percent = known ? Math.min(100, Math.floor(completed / total * 100)) : undefined;
  return (
    <div className="v2-sched-load">
      <div className="v2-sched-load-card" role={error ? "alert" : "status"} aria-live="polite">
        {!error ? <span className="v2-sched-spin" aria-hidden /> : null}
        <b>{t(error ? "schedule.loadErrorTitle" : "schedule.loading")}</b>
        <p>{t(error ? "schedule.loadErrorHint" : known ? "schedule.loadingHint" : "schedule.loadingCount")}</p>
        {!error ? <>
          <div className="v2-sched-progress" role="progressbar" aria-label={t("schedule.loading")}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span className={known ? undefined : "is-indeterminate"} style={known ? { width: `${percent}%` } : undefined} />
          </div>
          <span className="v2-sched-pages">{t(known ? "schedule.loadingPages" : "schedule.loadingPagesUnknown", { completed, total })}</span>
        </> : <Button onClick={onRetry}>{t("schedule.retryLoad")}</Button>}
      </div>
    </div>
  );
}
