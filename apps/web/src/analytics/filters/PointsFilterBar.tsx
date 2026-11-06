import { useAnalyticsMode } from "../state/source";
import { useId, useState, type Dispatch } from "react";
import { useTranslation } from "react-i18next";
import { pointsFilterFields, filtersKey, validFilters } from "../model/pointsFilters";
import type { PointsAction, PointsState } from "../state/pointsState";
import { DayFilter } from "./DayFilter";
import { LimitFilter } from "./LimitFilter";
import { AudienceFilter } from "./AudienceFilter";
import { PlayersFilter } from "./PlayersFilter";
import styles from "./filters.module.css";
export function PointsFilterBar({ state, dispatch, demo, loading }: { state: PointsState; dispatch: Dispatch<PointsAction>; demo: boolean; loading: boolean }) {
  const enabled = useAnalyticsMode() !== "unconfigured";
  const { t } = useTranslation("analytics");
  const [expanded, setExpanded] = useState(true);
  const fieldsId = useId();
  const dirty = filtersKey(state.draft) !== filtersKey(state.applied);
  const valid = validFilters(state.draft);
  const summary = `${state.applied.day} · ${state.applied.limit} € · ${t(`segments.${state.applied.segment}`)} · ${state.applied.players.length ? t("filters.selectedPlayers", { count: state.applied.players.length }) : t("filters.anyPlayers")}`;
  return <form className={styles.bar} aria-label={t("filters.title")} onSubmit={e => { e.preventDefault(); if (enabled) dispatch({ type: "apply" }); }}>
    <header><h2>{t("filters.title")}</h2><span>{t("filters.bothWidgets")}</span><button type="button" aria-expanded={expanded} aria-controls={fieldsId} onClick={() => setExpanded(value => !value)}>{t(expanded ? "filters.collapse" : "filters.expand")}</button></header>
    <div id={fieldsId} hidden={!expanded}>
    <div className={styles.fields}>
      {pointsFilterFields.map(field => {
        switch (field) {
          case "day": return <DayFilter key={field} value={state.draft.day} onChange={day => dispatch({ type: "edit", value: { day } })} />;
          case "limit": return <LimitFilter key={field} value={state.draft.limit} onChange={limit => dispatch({ type: "edit", value: { limit } })} />;
          case "segment": return <AudienceFilter key={field} value={state.draft.segment} onChange={segment => dispatch({ type: "edit", value: { segment } })} />;
          case "players": return <PlayersFilter key={field} value={state.playersText} demo={demo} onChange={value => dispatch({ type: "players", value })} />;
        }
      })}
    </div>
    </div>
    <div className={styles.footer}>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={!enabled || !valid || !dirty}>{t("filters.apply")}</button>
        <button type="button" onClick={() => dispatch({ type: "reset", now: new Date() })}>{t("filters.reset")}</button>
        <button type="button" disabled={!enabled || loading} onClick={() => dispatch({ type: "refresh" })}>{t("filters.refresh")}</button>
      </div>
      <p className={styles.summary} data-testid="points-applied">{t("filters.current")}: {summary}</p>
      <p role="status" hidden={valid && !dirty}>{!valid ? t("filters.invalid") : dirty ? t("filters.dirty") : t("filters.applied")}</p>
    </div>

  </form>;
}
