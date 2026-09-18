import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LIMIT_OPTIONS,
  MAX_CAP,
  applyMatrix,
  clampCap,
  defaultHourCaps,
  hoursOf,
  limitTone,
  maxLevels,
  slotsOf,
  profileOf,
  resetLimit,
  setEqualize,
  type CapacityMap,
  type HourCaps,
} from "../schedule/capacity";
import { MARKS, ME } from "../schedule/marks";
import { R } from "./tokens";

const palette = [...MARKS, ME];
const members = [
  { key: "1", id: "PH-014", tag: "NS", request: "pending", status: "school" },
  { key: "2", id: "PH-002", tag: "SV", request: "active", status: "club" },
  { key: "3", id: "PH-009", tag: "YO", request: "active", status: "club" },
  { key: "4", id: "PH-021", tag: "AL", request: "active", status: "school" },
  { key: "5", id: "PH-007", tag: "OK", request: "blocked", status: "club" },
];

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const DEPTH = [
  { bg: "#1c2230", fg: "#8b93a2" },
  { bg: "#0b4f5c", fg: "#67e8f9" },
  { bg: "#5b4310", fg: "#fbbf24" },
  { bg: "#6b2f10", fg: "#fb923c" },
  { bg: "#6b1d24", fg: "#fb7185" },
  { bg: "#6b1a45", fg: "#f472b6" },
];

type MatrixRow = { id: number; label: string; hours: HourCaps };

type Props = {
  capacity: CapacityMap;
  onCapacityChange: (next: CapacityMap) => void;
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

export function V2Admin({ capacity, onCapacityChange }: Props) {
  const { t, i18n } = useTranslation();
  const [limit, setLimit] = useState("50");
  const [tab, setTab] = useState<"week" | "month">("month");
  const [draft, setDraft] = useState<MatrixRow[] | null>(null);
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(false);
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const paintRef = useRef<number | null>(null);
  const profile = profileOf(capacity, limit);
  const weekLabels = useMemo(() => {
    const loc = i18n.language.startsWith("en") ? "en-US" : "ru-RU";
    return WEEK_ORDER.map((id) => {
      const date = new Date(2026, 5, id === 0 ? 7 : id);
      return { id, label: date.toLocaleDateString(loc, { weekday: "short" }).replace(".", "") };
    });
  }, [i18n.language]);

  useEffect(() => {
    const stop = () => {
      paintRef.current = null;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  useEffect(() => {
    setDraft(null);
    setSaved(false);
    setHoverHour(null);
  }, [limit, tab, weekLabels]);

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

  const matrix = draft ?? baseline;
  const dirty = draft != null && !sameMatrix(draft, baseline);
  const extremes = useMemo(() => extremesOf(matrix), [matrix]);
  const sameDepth = Boolean(extremes.deep && extremes.shallow && extremes.deep.id === extremes.shallow.id);

  const paint = (rowId: number, hour: number, cap: number) => {
    setDraft((prev) =>
      (prev ?? baseline).map((row) => {
        if (row.id !== rowId) return row;
        const hours = row.hours.slice();
        hours[hour] = clampCap(cap);
        return { ...row, hours };
      }),
    );
    setSaved(false);
  };

  const save = () => {
    if (!dirty || !draft) return;
    onCapacityChange(applyMatrix(capacity, limit, tab, draft));
    setSaved(true);
  };

  const reset = () => {
    onCapacityChange(resetLimit(capacity, limit));
    setDraft(loadMatrixAfterReset());
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

  const tone = (request: string) => {
    if (request === "active") return "#34D399";
    if (request === "pending") return R.cyan;
    return "#F87171";
  };

  return (
    <div className="mx-auto w-full px-6 py-8" style={{ color: R.text }}>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">{t("admin.title")}</h1>

      <section className="overflow-hidden rounded-lg" style={{ border: `1px solid ${R.line}`, background: R.header }}>
        <button
          type="button"
          className="v2-cap-fold flex w-full items-start gap-4 border-0 px-5 py-5 text-left"
          style={{ background: "transparent", borderBottom: open ? `1px solid ${R.line}` : "0", color: R.text }}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] tracking-[0.16em] uppercase" style={{ color: R.faint }}>
              {t("admin.capacity.kicker")}
            </span>
            <h2 className="mt-1 text-[18px] font-semibold">{t("admin.capacity.title")}</h2>
            {open && (
              <p className="mt-2 max-w-3xl text-[13px] leading-relaxed" style={{ color: R.muted }}>
                {t("admin.capacity.lead")}
              </p>
            )}
          </span>
          <span className="mt-1 flex shrink-0 items-center gap-2">
            <b className="v2-mono text-[12px] font-semibold" style={{ color: limitTone(limit) }}>
              NL {limit}
            </b>
            <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} style={{ color: R.faint, fontSize: 12 }} aria-hidden />
          </span>
        </button>

        <div className="flex" hidden={!open}>
          <aside className="v2-cap-limits">
            <div className="mb-2 px-1 text-[10px] tracking-[0.14em] uppercase" style={{ color: R.faint }}>
              {t("admin.capacity.limit")}
            </div>
            {LIMIT_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className="v2-cap-limit"
                style={{
                  background: limit === value ? "rgba(34, 211, 238, 0.14)" : "transparent",
                  color: limit === value ? R.cyan : limitTone(value),
                  boxShadow: limit === value ? `inset 0 0 0 1px rgba(34, 211, 238, 0.45)` : undefined,
                }}
                onClick={() => {
                  setLimit(value);
                  setSaved(false);
                }}
              >
                <b>NL {value}</b>
              </button>
            ))}
            <button type="button" className="v2-ctrl mt-4 w-full px-2 text-[11px]" onClick={reset}>
              {t("admin.capacity.resetLimit")}
            </button>
            <p className="mt-2 px-1 text-[10px] leading-relaxed" style={{ color: R.faint }}>
              {t("admin.capacity.resetLimitHint")}
            </p>
          </aside>

          <div className="min-w-0 flex-1 px-5 py-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex overflow-hidden rounded border" style={{ borderColor: R.line }}>
                <button
                  type="button"
                  className="border-0 px-3 py-1.5 text-[12px]"
                  style={{
                    background: tab === "week" ? R.cyan : "transparent",
                    color: tab === "week" ? R.cyanInk : R.muted,
                    fontWeight: tab === "week" ? 600 : 400,
                  }}
                  onClick={() => setTab("week")}
                >
                  {t("admin.capacity.tabWeek")}
                </button>
                <button
                  type="button"
                  className="border-0 px-3 py-1.5 text-[12px]"
                  style={{
                    background: tab === "month" ? R.cyan : "transparent",
                    color: tab === "month" ? R.cyanInk : R.muted,
                    fontWeight: tab === "month" ? 600 : 400,
                  }}
                  onClick={() => setTab("month")}
                >
                  {t("admin.capacity.tabMonth")}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {DEPTH.map((item, i) => (
                  <span key={item.bg} className="v2-cap-legend" style={{ background: item.bg, color: item.fg }}>
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>

            <div className="v2-cap-matrix">
              <div className={`v2-cap-mx${tab === "week" ? " is-week" : ""}`}>
                <div className="v2-cap-mx-head v2-cap-mx-day">CET</div>
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className={`v2-cap-mx-head${hour < 6 || hour >= 22 ? " is-night" : ""}${hoverHour === hour ? " is-col" : ""}`}
                    onMouseEnter={() => setHoverHour(hour)}
                    onMouseLeave={() => setHoverHour(null)}
                  >
                    {hour}
                  </div>
                ))}
                <div className="v2-cap-mx-head v2-cap-mx-slots">{t("admin.capacity.colSlots")}</div>

                {matrix.map((row) => {
                  const slots = slotsOf(row.hours);
                  return (
                    <Fragment key={row.id}>
                      <div className="v2-cap-mx-day">{row.label}</div>
                      {row.hours.map((cap, hour) => {
                        const depth = DEPTH[Math.min(MAX_CAP, Math.max(1, cap)) - 1];
                        return (
                          <button
                            key={`${row.id}-${hour}`}
                            type="button"
                            className={`v2-cap-mx-cell${hour < 6 || hour >= 22 ? " is-night" : ""}${hoverHour === hour ? " is-col" : ""}`}
                            style={{ background: depth.bg, color: depth.fg }}
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
                              paintRef.current = next;
                              paint(row.id, hour, next);
                            }}
                            onMouseEnter={() => {
                              setHoverHour(hour);
                              if (paintRef.current != null) paint(row.id, hour, paintRef.current);
                            }}
                            onMouseLeave={() => setHoverHour(null)}
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

            <p className="mt-2 text-[11px]" style={{ color: R.faint }}>
              {t("admin.capacity.matrixHint")}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: R.soft }}>
              {t("admin.capacity.conflictHint")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="v2-ctrl px-5"
                style={{
                  background: dirty ? R.cyan : R.panel,
                  color: dirty ? R.cyanInk : R.faint,
                  fontWeight: 600,
                }}
                disabled={!dirty}
                onClick={save}
              >
                {saved ? t("admin.capacity.applied") : t("admin.capacity.apply")}
              </button>
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

      <h2 className="mt-10 mb-3 text-[16px] font-semibold">{t("admin.members")}</h2>
      <div className="overflow-hidden rounded-md" style={{ border: `1px solid ${R.line}`, background: R.header }}>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[10px] tracking-[0.14em] uppercase" style={{ color: R.faint }}>
              <th className="px-4 py-3 font-medium">{t("admin.colId")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colTag")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colRequest")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((row) => {
              const mark = palette.find((m) => m.t === row.tag) ?? { t: row.tag, bg: "#3a3d44", fg: R.text };
              return (
                <tr key={row.key} style={{ borderTop: `1px solid ${R.line}` }}>
                  <td className="v2-mono px-4 py-3 text-[12px]" style={{ color: R.muted }}>
                    {row.id}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="v2-mono inline-flex h-6 w-8 items-center justify-center text-[10px] font-bold"
                      style={{ background: mark.bg, color: mark.fg }}
                    >
                      {mark.t}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span style={{ color: tone(row.request) }}>{t(`admin.request.${row.request}`)}</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: R.muted }}>
                    {t(`admin.status.${row.status}`)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
