import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS, formatLimit } from "../schedule/capacity";
import {
  deadTimeIntervalsEqual,
  formatHalfTime,
  loadDeadTimeIntervals,
  nextDeadTimeInterval,
  saveDeadTimeIntervals,
  validateDeadTimeIntervals,
  type DeadTimeInterval,
  type ScheduleVariant,
} from "../data/deadTime";
import { V2SaveButton } from "./V2SaveButton";
import { showV2Toast } from "./V2Toast";

const START_HALVES = Array.from({ length: 48 }, (_, index) => index);
const END_HALVES = Array.from({ length: 48 }, (_, index) => index + 1);

export function DeadTimeEditor() {
  const { t } = useTranslation();
  const [variant, setVariant] = useState<ScheduleVariant>("nitro");
  const [limit, setLimit] = useState("50");
  const [saved, setSaved] = useState<DeadTimeInterval[]>([]);
  const [draft, setDraft] = useState<DeadTimeInterval[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSignal, setSavedSignal] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void loadDeadTimeIntervals()
      .then((items) => {
        if (!live) return;
        setSaved(items);
        setDraft(items);
        setLoadFailed(false);
      })
      .catch(() => {
        if (live) setLoadFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, []);

  const current = useMemo(
    () => draft.filter((item) => item.variant === variant && item.limit === limit)
      .sort((left, right) => left.startHalf - right.startHalf),
    [draft, limit, variant],
  );
  const validationError = validateDeadTimeIntervals(draft);
  const dirty = !deadTimeIntervalsEqual(draft, saved);

  const changeInterval = (id: string, patch: Partial<DeadTimeInterval>) => {
    setDraft((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
    setSavedSignal(false);
  };

  return (
    <section className="v2-admin-card">
      <div className="v2-admin-section-head">
        <span className="v2-admin-kicker">{t("admin.deadTime.kicker")}</span>
        <h2>{t("admin.deadTime.title")}</h2>
        <p>{t("admin.deadTime.lead")}</p>
      </div>
      <div className="v2-dead-time-editor" aria-busy={loading || saving}>
        <div className="v2-dead-time-pair">
          <div className="v2-seg" aria-label={t("admin.deadTime.variant") }>
            {(["nitro", "regular"] as const).map((value) => (
              <button key={value} type="button" className={variant === value ? "is-on" : ""} onClick={() => setVariant(value)}>
                {value === "nitro" ? "Nitro" : "Regular"}
              </button>
            ))}
          </div>
          <label>
            <span>{t("admin.deadTime.limit")}</span>
            <select value={limit} onChange={(event) => setLimit(event.target.value)}>
              {LIMIT_OPTIONS.map((value) => <option key={value} value={value}>{formatLimit(value)}</option>)}
            </select>
          </label>
        </div>

        {loadFailed ? <p className="v2-dead-time-error" role="alert">{t("admin.deadTime.loadErr")}</p> : null}
        {!loading && !loadFailed ? (
          <div className="v2-dead-time-list">
            {current.length ? current.map((item) => (
              <div key={item.id} className="v2-dead-time-row">
                <label>
                  <span>{t("admin.deadTime.from")}</span>
                  <select value={item.startHalf} onChange={(event) => changeInterval(item.id, { startHalf: Number(event.target.value) })}>
                    {START_HALVES.map((half) => <option key={half} value={half}>{formatHalfTime(half)}</option>)}
                  </select>
                </label>
                <span className="v2-dead-time-arrow" aria-hidden>→</span>
                <label>
                  <span>{t("admin.deadTime.to")}</span>
                  <select value={item.endHalf} onChange={(event) => changeInterval(item.id, { endHalf: Number(event.target.value) })}>
                    {END_HALVES.map((half) => <option key={half} value={half}>{formatHalfTime(half)}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className="v2-dead-time-remove"
                  title={t("admin.deadTime.remove")}
                  aria-label={`${t("admin.deadTime.remove")} ${formatHalfTime(item.startHalf)}–${formatHalfTime(item.endHalf)}`}
                  onClick={() => {
                    setDraft((items) => items.filter((candidate) => candidate.id !== item.id));
                    setSavedSignal(false);
                  }}
                >
                  <i className="fa-solid fa-trash-can" />
                </button>
              </div>
            )) : <p className="v2-muted text-[11px]">{t("admin.deadTime.empty")}</p>}
          </div>
        ) : null}

        {validationError ? (
          <p className="v2-dead-time-error" role="alert">
            {t(`admin.deadTime.${validationError === "overlap" ? "overlap" : "bounds"}`)}
          </p>
        ) : null}

        <div className="v2-dead-time-actions">
          <button
            type="button"
            className="v2-ctrl"
            disabled={loading || loadFailed || saving}
            onClick={() => {
              const next = nextDeadTimeInterval(draft, variant, limit);
              if (!next) {
                showV2Toast("err", t("admin.deadTime.full"));
                return;
              }
              setDraft((items) => [...items, next]);
              setSavedSignal(false);
            }}
          >
            <i className="fa-solid fa-plus" aria-hidden /> {t("admin.deadTime.add")}
          </button>
          <V2SaveButton
            dirty={dirty}
            saved={savedSignal}
            disabled={loading || loadFailed || saving || Boolean(validationError)}
            label={saving ? t("admin.deadTime.saving") : t("admin.save")}
            doneLabel={t("admin.saved")}
            onClick={() => {
              setSaving(true);
              void saveDeadTimeIntervals(draft).then((result) => {
                setSaving(false);
                if (result.error) {
                  showV2Toast("err", t("admin.deadTime.saveErr"));
                  return;
                }
                setSaved(draft);
                setSavedSignal(true);
                showV2Toast("ok", t("admin.saved"));
              });
            }}
          />
          <span className="v2-muted text-[11px]">{t("admin.deadTime.timezone")}</span>
        </div>
      </div>
    </section>
  );
}
