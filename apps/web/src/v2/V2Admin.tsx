import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LIMIT_OPTIONS,
  MAX_CAP,
  applyMatrix,
  clampCap,
  defaultHourCaps,
  hoursOf,
  formatLimit,
  limitTone,
  maxLevels,
  slotsOf,
  profileOf,
  resetLimit,
  setEqualize,
  setRuleFlags,
  type CapacityMap,
  type HourCaps,
} from "../schedule/capacity";
import { weekdayShort } from "../schedule/formatDate";
import { LOAD_PASTELS, cloneHourLoad, emptyLoadRow, sameHourLoad, type HourLoadMap } from "../schedule/hourLoad";
import { MembersAdmin } from "./MembersAdmin";
import { FoldHead } from "./FoldHead";
import { V2Root } from "./V2Root";
import { V2SaveButton } from "./V2SaveButton";
import { showV2Toast } from "./V2Toast";
import { loadScheduleSettings, saveActAs, saveCountTables, saveEditByButton, saveOverwriteMarks, subscribeScheduleSettings } from "../data/scheduleSettings";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

type MatrixRow = { id: number; label: string; hours: HourCaps };
type CapRange = { r0: number; h0: number; r1: number; h1: number };

function inCapRange(ri: number, hour: number, range: CapRange | null) {
  if (!range) return false;
  const rMin = Math.min(range.r0, range.r1);
  const rMax = Math.max(range.r0, range.r1);
  const hMin = Math.min(range.h0, range.h1);
  const hMax = Math.max(range.h0, range.h1);
  return ri >= rMin && ri <= rMax && hour >= hMin && hour <= hMax;
}

type AdminSection = "people" | "schedule" | "root";

type Props = {
  capacity: CapacityMap;
  hourLoad: HourLoadMap;
  isRoot?: boolean;
  section?: AdminSection;
  variant: "nitro" | "regular";
  onVariantChange: (variant: "nitro" | "regular") => void;
  onCapacityChange: (next: CapacityMap) => void;
  onHourLoadChange: (next: HourLoadMap) => void;
};

function nextCap(cap: number, down: boolean) {
  if (down) return Math.max(1, cap - 1);
  return cap >= MAX_CAP ? 1 : cap + 1;
}

function sameMatrix(a: MatrixRow[], b: MatrixRow[]) {
  return a.length === b.length && a.every((row, i) => row.id === b[i]?.id && row.hours.every((cap, hour) => cap === b[i]?.hours[hour]));
}

function depthScore(hours: HourCaps) {
  return maxLevels(hours) * 1000 + slotsOf(hours);
}

function extremesOf(rows: MatrixRow[]) {
  if (!rows.length) return { deep: null as MatrixRow | null, shallow: null as MatrixRow | null };
  let deep = rows[0];
  let shallow = rows[0];
  for (const row of rows) {
    if (depthScore(row.hours) > depthScore(deep.hours)) deep = row;
    if (depthScore(row.hours) < depthScore(shallow.hours)) shallow = row;
  }
  return { deep, shallow };
}

export function V2Admin({ capacity, hourLoad, isRoot, section = "people", variant, onVariantChange, onCapacityChange, onHourLoadChange }: Props) {
  const { t, i18n } = useTranslation();
  const [limit, setLimit] = useState("50");
  const [tab, setTab] = useState<"week" | "month">("month");
  const [draft, setDraft] = useState<MatrixRow[] | null>(null);
  const [open, setOpen] = useState(true);
  const [controlOpen, setControlOpen] = useState(true);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [overwriteSaving, setOverwriteSaving] = useState(false);
  const [allowActAs, setAllowActAs] = useState(false);
  const [actAsSaving, setActAsSaving] = useState(false);
  const [countTables, setCountTables] = useState(false);
  const [tablesSaving, setTablesSaving] = useState(false);
  const [editByButton, setEditByButton] = useState(true);
  const [editByButtonSaving, setEditByButtonSaving] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [loadDraft, setLoadDraft] = useState<HourLoadMap | null>(null);
  const [loadSaved, setLoadSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null);
  const [range, setRange] = useState<CapRange | null>(null);
  const [weekOn, setWeekOn] = useState(true);
  const [monthOn, setMonthOn] = useState(true);
  const paintRef = useRef<(CapRange & { cap: number }) | null>(null);
  const baselineRef = useRef<MatrixRow[]>([]);
  const profile = profileOf(capacity, limit);
  const weekLabels = useMemo(
    () => WEEK_ORDER.map((id) => ({ id, label: weekdayShort(id, i18n.language) })),
    [i18n.language],
  );

  useEffect(() => {
    const stop = () => {
      const drag = paintRef.current;
      if (!drag) return;
      paintRef.current = null;
      const rMin = Math.min(drag.r0, drag.r1);
      const rMax = Math.max(drag.r0, drag.r1);
      const hMin = Math.min(drag.h0, drag.h1);
      const hMax = Math.max(drag.h0, drag.h1);
      setDraft((prev) =>
        (prev ?? baselineRef.current).map((row, ri) => {
          if (ri < rMin || ri > rMax) return row;
          const hours = row.hours.slice();
          for (let hour = hMin; hour <= hMax; hour += 1) hours[hour] = clampCap(drag.cap);
          return { ...row, hours };
        }),
      );
      setRange(null);
      setSaved(false);
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  useEffect(() => {
    if (section !== "schedule") return;
    let live = true;
    const apply = () => {
      void loadScheduleSettings().then((next) => {
        if (!live) return;
        setAllowOverwrite(next.allowOverwriteMarks);
        setAllowActAs(next.allowActAs);
        setCountTables(next.countTables);
        setEditByButton(next.editByButton);
      });
    };
    apply();
    const off = subscribeScheduleSettings(apply);
    return () => {
      live = false;
      off();
    };
  }, [section]);

  useEffect(() => {
    setDraft(null);
    setSaved(false);
    setHover(null);
    setRange(null);
    const next = profileOf(capacity, limit);
    setWeekOn(next.weekOn);
    setMonthOn(next.monthOn);
  }, [limit, tab, variant, weekLabels]);

  const baseline = useMemo(() => {
    if (tab === "week") {
      return weekLabels.map((item) => ({
        id: item.id,
        label: item.label,
        hours: hoursOf(capacity, limit, undefined, item.id).slice(),
      }));
    }
    return Array.from({ length: 31 }, (_, i) => i + 1).map((day) => ({
      id: day,
      label: String(day),
      hours: hoursOf(capacity, limit, day).slice(),
    }));
  }, [capacity, limit, tab, weekLabels]);
  baselineRef.current = baseline;

  const matrix = draft ?? baseline;
  const flagsDirty = weekOn !== profile.weekOn || monthOn !== profile.monthOn;
  const dirty = (draft != null && !sameMatrix(draft, baseline)) || flagsDirty;
  const extremes = useMemo(() => extremesOf(matrix), [matrix]);
  const sameDepth = Boolean(extremes.deep && extremes.shallow && extremes.deep.id === extremes.shallow.id);

  const save = () => {
    if (!dirty) return;
    let next = capacity;
    if (draft != null && !sameMatrix(draft, baseline)) next = applyMatrix(next, limit, tab, draft);
    if (flagsDirty) next = setRuleFlags(next, limit, { weekOn, monthOn });
    onCapacityChange(next);
    setDraft(null);
    setSaved(true);
  };

  const reset = () => {
    onCapacityChange(resetLimit(capacity, limit));
    setDraft(loadMatrixAfterReset());
    setWeekOn(true);
    setMonthOn(true);
    setSaved(false);
  };

  const loadMatrixAfterReset = () => {
    if (tab === "week") {
      return weekLabels.map((item) => ({ id: item.id, label: item.label, hours: defaultHourCaps() }));
    }
    return Array.from({ length: 31 }, (_, i) => i + 1).map((day) => ({
      id: day,
      label: String(day),
      hours: defaultHourCaps(),
    }));
  };

  const resetMatrix = () => {
    setDraft(
      (tab === "week" ? weekLabels.map((item) => item.id) : Array.from({ length: 31 }, (_, i) => i + 1)).map((id, index) => ({
        id,
        label: tab === "week" ? weekLabels[index]?.label ?? String(id) : String(id),
        hours: defaultHourCaps(),
      })),
    );
    setSaved(false);
  };

  const loadMatrix = loadDraft ?? hourLoad;
  const loadDirty = loadDraft != null && !sameHourLoad(loadDraft, hourLoad);

  const paintLoad = (hour: number, color: string | null) => {
    setLoadDraft((prev) => {
      const base = cloneHourLoad(prev ?? hourLoad);
      const row = (base[limit] ?? Array.from({ length: 24 }, () => null)).slice();
      row[hour] = color;
      base[limit] = row;
      return base;
    });
    setLoadSaved(false);
  };

  const saveLoad = () => {
    if (!loadDirty || !loadDraft) return;
    onHourLoadChange(loadDraft);
    setLoadDraft(null);
    setLoadSaved(true);
  };

  const resetLoad = () => {
    setLoadDraft(null);
    setLoadSaved(false);
  };

  const clearLoad = () => {
    setLoadDraft((prev) => {
      const base = cloneHourLoad(prev ?? hourLoad);
      base[limit] = emptyLoadRow();
      return base;
    });
    setLoadSaved(false);
  };

  return (
    <div className="v2-ink v2-admin-page">
      {section !== "people" ? (
      <header className="v2-admin-page-head">
        <span className="v2-admin-kicker">{section === "root" ? t("nav.root") : t("nav.club")}</span>
        <h1>
          {section === "schedule" ? t("nav.adminSchedule") : t("admin.root.title")}
        </h1>
        <p>
          {section === "schedule" ? t("admin.scheduleLead") : t("admin.root.lead")}
        </p>
      </header>
      ) : null}

      {section === "root" && isRoot ? <V2Root /> : null}

      {section === "schedule" ? (
        <>
      <section className="v2-admin-card">
        <FoldHead
          kicker={t("admin.control.kicker")}
          title={t("admin.control.title")}
          lead={t("admin.control.lead")}
          open={controlOpen}
          onToggle={() => setControlOpen((value) => !value)}
        />
        <div className="px-1 pb-3" hidden={!controlOpen}>
          <button
            type="button"
            className={`v2-settings-row${allowOverwrite ? " is-on" : ""}`}
            disabled={overwriteSaving}
            title={t("admin.control.overwriteHint")}
            onClick={() => {
              const next = !allowOverwrite;
              setAllowOverwrite(next);
              setOverwriteSaving(true);
              void saveOverwriteMarks(next).then((result) => {
                setOverwriteSaving(false);
                if (result.error) {
                  setAllowOverwrite(!next);
                  showV2Toast("err", t("admin.people.saveErr"));
                  return;
                }
                showV2Toast("ok", t("admin.saved"));
              });
            }}
          >
            <span className="v2-settings-ico">
              <i className="fa-solid fa-eraser" />
            </span>
            <span className="v2-settings-copy">
              <b>{t("admin.control.overwrite")}</b>
              <small>{t("admin.control.overwriteHint")}</small>
            </span>
            <span className={`v2-settings-switch${allowOverwrite ? " is-on" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            className={`v2-settings-row${allowActAs ? " is-on" : ""}`}
            disabled={actAsSaving}
            title={t("admin.control.actAsHint")}
            onClick={() => {
              const next = !allowActAs;
              setAllowActAs(next);
              setActAsSaving(true);
              void saveActAs(next).then((result) => {
                setActAsSaving(false);
                if (result.error) {
                  setAllowActAs(!next);
                  showV2Toast("err", t("admin.people.saveErr"));
                  return;
                }
                showV2Toast("ok", t("admin.saved"));
              });
            }}
          >
            <span className="v2-settings-ico">
              <i className="fa-solid fa-user-pen" />
            </span>
            <span className="v2-settings-copy">
              <b>{t("admin.control.actAs")}</b>
              <small>{t("admin.control.actAsHint")}</small>
            </span>
            <span className={`v2-settings-switch${allowActAs ? " is-on" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            className={`v2-settings-row${countTables ? " is-on" : ""}`}
            disabled={tablesSaving}
            title={t("admin.control.tablesHint")}
            onClick={() => {
              const next = !countTables;
              setCountTables(next);
              setTablesSaving(true);
              void saveCountTables(next).then((result) => {
                setTablesSaving(false);
                if (result.error) {
                  setCountTables(!next);
                  showV2Toast("err", t("admin.people.saveErr"));
                  return;
                }
                showV2Toast("ok", t("admin.saved"));
              });
            }}
          >
            <span className="v2-settings-ico">
              <i className="fa-solid fa-table-cells" />
            </span>
            <span className="v2-settings-copy">
              <b>{t("admin.control.tables")}</b>
              <small>{t("admin.control.tablesHint")}</small>
            </span>
            <span className={`v2-settings-switch${countTables ? " is-on" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            className={`v2-settings-row${!editByButton ? " is-on" : ""}`}
            disabled={editByButtonSaving}
            title={t("admin.control.editByButtonHint")}
            onClick={() => {
              const next = !editByButton;
              setEditByButton(next);
              setEditByButtonSaving(true);
              void saveEditByButton(next).then((result) => {
                setEditByButtonSaving(false);
                if (result.error) {
                  setEditByButton(!next);
                  showV2Toast("err", t("admin.people.saveErr"));
                  return;
                }
                showV2Toast("ok", t("admin.saved"));
              });
            }}
          >
            <span className="v2-settings-ico">
              <i className="fa-solid fa-pencil" />
            </span>
            <span className="v2-settings-copy">
              <b>{t("admin.control.editByButton")}</b>
              <small>{t("admin.control.editByButtonHint")}</small>
            </span>
            <span className={`v2-settings-switch${!editByButton ? " is-on" : ""}`} aria-hidden />
          </button>
        </div>
      </section>
      <section className="v2-admin-card">
        <FoldHead
          kicker={t("admin.capacity.kicker")}
          title={t("admin.capacity.title")}
          lead={t("admin.capacity.lead")}
          open={open}
          onToggle={() => setOpen((value) => !value)}
        />

        <div className="flex" hidden={!open}>
          <aside className="v2-cap-limits">
            <div className="v2-admin-kicker mb-2 px-1 text-[10px] tracking-[0.14em] uppercase">{t("admin.capacity.kind")}</div>
            {(["nitro", "regular"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`v2-cap-limit${variant === value ? " is-on" : ""}`}
                onClick={() => {
                  if (value === variant) return;
                  onVariantChange(value);
                  setSaved(false);
                }}
              >
                <b>{value === "nitro" ? "Nitro" : "Regular"}</b>
              </button>
            ))}
            <div className="v2-admin-kicker mb-2 mt-5 px-1 text-[10px] tracking-[0.14em] uppercase">{t("admin.capacity.limit")}</div>
            {LIMIT_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={`v2-cap-limit${limit === value ? " is-on" : ""}`}
                style={limit === value ? undefined : { color: limitTone(value) }}
                onClick={() => {
                  setLimit(value);
                  setSaved(false);
                }}
              >
                <b>{formatLimit(value)}</b>
              </button>
            ))}
            <button type="button" className="v2-ctrl mt-4 w-full px-2 text-[11px]" onClick={reset}>
              {t("admin.capacity.resetLimit")}
            </button>
            <p className="v2-muted mt-2 px-1 text-[10px] leading-relaxed">{t("admin.capacity.resetLimitHint")}</p>
          </aside>

          <div className="min-w-0 flex-1 v2-cap-body">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="v2-seg">
                <button type="button" className={tab === "week" ? "is-on" : ""} onClick={() => setTab("week")}>
                  {t("admin.capacity.tabWeek")}
                </button>
                <button type="button" className={tab === "month" ? "is-on" : ""} onClick={() => setTab("month")}>
                  {t("admin.capacity.tabMonth")}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {Array.from({ length: MAX_CAP }, (_, i) => (
                  <span key={i} className={`v2-cap-legend v2-cap-d${i + 1}`}>
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>

            <div className="v2-cap-matrix" onMouseLeave={() => setHover(null)}>
              <div className={`v2-cap-mx${tab === "week" ? " is-week" : ""}`}>
                <div className="v2-cap-mx-head v2-cap-mx-day">CET</div>
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className={`v2-cap-mx-head${hour < 6 || hour >= 22 ? " is-night" : ""}${hover?.hour === hour ? " is-col" : ""}`}
                  >
                    {hour}
                  </div>
                ))}
                <div className="v2-cap-mx-head v2-cap-mx-slots">{t("admin.capacity.colSlots")}</div>

                {matrix.map((row, ri) => {
                  const slots = slotsOf(row.hours);
                  return (
                    <Fragment key={row.id}>
                      <div className={`v2-cap-mx-day${hover?.day === row.id ? " is-row" : ""}`}>{row.label}</div>
                      {row.hours.map((cap, hour) => {
                        const depth = Math.min(MAX_CAP, Math.max(1, cap));
                        const selected = inCapRange(ri, hour, range);
                        const cursor = hover?.day === row.id && hover.hour === hour;
                        return (
                          <button
                            key={`${row.id}-${hour}`}
                            type="button"
                            className={`v2-cap-mx-cell v2-cap-d${depth}${hour < 6 || hour >= 22 ? " is-night" : ""}${cursor ? " is-cursor" : ""}${selected ? " is-range" : ""}`}
                            title={t("admin.capacity.cellTip", {
                              day: row.label,
                              start: hour,
                              end: hour + 1,
                              cap,
                              slots,
                            })}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              const next = nextCap(cap, event.button === 2);
                              const box = { r0: ri, h0: hour, r1: ri, h1: hour, cap: next };
                              paintRef.current = box;
                              setRange(box);
                              setHover({ day: row.id, hour });
                            }}
                            onMouseEnter={() => {
                              setHover({ day: row.id, hour });
                              const drag = paintRef.current;
                              if (!drag) return;
                              const next = { ...drag, r1: ri, h1: hour };
                              paintRef.current = next;
                              setRange(next);
                            }}
                            onContextMenu={(event) => event.preventDefault()}
                          >
                            {cap}
                          </button>
                        );
                      })}
                      <div className="v2-cap-mx-slots">{slots}</div>
                    </Fragment>
                  );
                })}
              </div>
            </div>

            {extremes.deep && extremes.shallow && (
              <div className="v2-cap-peek">
                <div className="v2-cap-peek-head">
                  <span>{t("admin.capacity.previewTitle")}</span>
                  <small>{sameDepth ? t("admin.capacity.previewSame") : t("admin.capacity.previewLook")}</small>
                </div>
                <div className="v2-cap-peek-hours">
                  <i />
                  {HOURS.map((hour) => (
                    <b key={hour} className={hour < 6 || hour >= 22 ? "is-night" : undefined}>
                      {hour}
                    </b>
                  ))}
                </div>
                {(sameDepth ? [extremes.deep] : [extremes.deep, extremes.shallow]).map((row, index) => {
                  const own = maxLevels(row.hours);
                  const deepMax = maxLevels(extremes.deep?.hours ?? row.hours);
                  const shown = profile.equalize ? deepMax : own;
                  return (
                    <div key={`${row.id}-${index}`} className="v2-cap-peek-day">
                      <div className="v2-cap-peek-meta">
                        {!sameDepth && (
                          <em>{index === 0 ? t("admin.capacity.previewDeep") : t("admin.capacity.previewShallow")}</em>
                        )}
                        <b>{row.label}</b>
                        <small>{slotsOf(row.hours)}</small>
                      </div>
                      <div className="v2-cap-peek-lanes">
                        {Array.from({ length: shown }, (_, level) => (
                          <div key={level} className="v2-cap-peek-lane">
                            <span className="v2-limit-chip" style={{ color: limitTone(limit) }}>
                              {limit}
                            </span>
                            <div className="v2-cap-peek-track">
                              {row.hours.map((cap, hour) => (
                                <span key={hour} className="v2-cap-peek-hour">
                                  {[0, 1].map((half) => (
                                    <i
                                      key={half}
                                      className={level < cap ? "v2-cap-peek-open" : "v2-cap-peek-lock"}
                                    />
                                  ))}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="v2-muted mt-2 text-[11px]">{t("admin.capacity.matrixHint")}</p>
            <div className="mt-4 flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={weekOn}
                  onChange={(event) => {
                    setWeekOn(event.target.checked);
                    setSaved(false);
                  }}
                />
                <span>{t("admin.capacity.useWeek")}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={monthOn}
                  onChange={(event) => {
                    setMonthOn(event.target.checked);
                    setSaved(false);
                  }}
                />
                <span>{t("admin.capacity.useMonth")}</span>
              </label>
              {weekOn && monthOn ? (
                <p className="v2-muted max-w-2xl text-[12px]">{t("admin.capacity.conflictHint")}</p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <V2SaveButton
                dirty={dirty}
                saved={saved}
                label={t("admin.save")}
                doneLabel={t("admin.saved")}
                onClick={save}
              />
              <button type="button" className="v2-ctrl px-4" onClick={resetMatrix}>
                {t("admin.capacity.matrixReset")}
              </button>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]" title={t("admin.capacity.equalizeHint")}>
                <input
                  type="checkbox"
                  checked={profile.equalize}
                  onChange={(event) => onCapacityChange(setEqualize(capacity, limit, event.target.checked))}
                />
                <span>{t("admin.capacity.equalize")}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="v2-admin-card mt-6">
        <FoldHead
          kicker={t("admin.load.kicker")}
          title={t("admin.load.title")}
          lead={t("admin.load.lead")}
          open={loadOpen}
          onToggle={() => setLoadOpen((value) => !value)}
        />
        {loadOpen && (
        <div className="flex">
          <aside className="v2-cap-limits">
            <div className="v2-admin-kicker mb-2 px-1 text-[10px] tracking-[0.14em] uppercase">{t("admin.capacity.limit")}</div>
            {LIMIT_OPTIONS.map((value) => (
              <button
                key={`load-${value}`}
                type="button"
                className={`v2-cap-limit${limit === value ? " is-on" : ""}`}
                style={limit === value ? undefined : { color: limitTone(value) }}
                onClick={() => setLimit(value)}
              >
                <b>{formatLimit(value)}</b>
              </button>
            ))}
          </aside>
          <div className="min-w-0 flex-1 v2-cap-body">
            <div className="v2-load-legend v2-muted">
              <span>{t("admin.load.legend")}</span>
              {LOAD_PASTELS.filter((tone) => tone.color).map((tone) => (
                <span key={tone.id} className="v2-load-chip">
                  <i style={{ background: tone.swatch }} />
                  {t(`admin.load.tone.${tone.id}`)}
                </span>
              ))}
            </div>
            <div className="v2-load-timeline v2-mono">
              {HOURS.map((hour) => {
                const wash = loadMatrix[limit]?.[hour];
                return (
                  <span
                    key={hour}
                    className="v2-load-tick"
                    style={wash ? { backgroundImage: `linear-gradient(${wash}, ${wash})` } : undefined}
                  >
                    {hour}
                  </span>
                );
              })}
            </div>
            <div className="v2-load-hours">
              {HOURS.map((hour) => (
                <div key={hour} className="v2-load-col">
                  <b>{hour}</b>
                  <div className="v2-load-swatches">
                    {LOAD_PASTELS.map((tone) => {
                      const on = (loadMatrix[limit]?.[hour] ?? null) === tone.color;
                      return (
                        <button
                          key={`${hour}-${tone.id}`}
                          type="button"
                          className={`v2-load-dot${on ? " is-on" : ""}${tone.id === "clear" ? " is-clear" : ""}`}
                          style={{ background: tone.swatch }}
                          title={t(`admin.load.tone.${tone.id}`)}
                          onClick={() => paintLoad(hour, tone.color)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <V2SaveButton
                dirty={loadDirty}
                saved={loadSaved}
                label={t("admin.save")}
                doneLabel={t("admin.saved")}
                onClick={saveLoad}
              />
              <button type="button" className="v2-ctrl px-4" onClick={resetLoad}>
                {t("admin.load.reset")}
              </button>
              <button type="button" className="v2-ctrl px-4" onClick={clearLoad}>
                {t("admin.load.clear")}
              </button>
            </div>
          </div>
        </div>
        )}
      </section>
        </>
      ) : null}

      {section === "people" ? (
      <section className="v2-admin-card">
        <MembersAdmin />
      </section>
      ) : null}
    </div>
  );
}
