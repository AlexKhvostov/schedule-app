import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  MARK_CATALOG,
  MARK_CATALOG_INKS,
  MARK_PLAYERS,
  MARK_PREVIEW_TABLES,
  MARK_PREVIEW_TAG,
  comboTaken,
  emptyAssign,
  formatNick,
  nickLabel,
  nickTaken,
  parseNickField,
  resolvedFg,
  saveMarkAssigns,
  tagTaken,
  type MarkAssign,
  type MarkAssignMap,
} from "../schedule/markCatalog";
import { R } from "./tokens";

type Props = {
  assigns: MarkAssignMap;
  onChange: (next: MarkAssignMap) => void;
};

function slotOf(row: MarkAssign | undefined, bg: string, dup: boolean) {
  const letters = row?.t.trim() ? row.t : MARK_PREVIEW_TAG;
  const fg = resolvedFg(row, bg);
  return (
    <span className="v2-mark-preview">
      <span
        className={`v2-opt-cell is-on v2-mark-slot${dup ? " is-dup" : ""}`}
        style={{ ["--mark" as string]: bg, ["--mark-ink" as string]: fg }}
      >
        <span className="v2-opt-face has-n">
          <b>{letters}</b>
          <i>{MARK_PREVIEW_TABLES}</i>
        </span>
      </span>
    </span>
  );
}

export function MarkCatalog({ assigns, onChange }: Props) {
  const { t } = useTranslation();
  const nickOptions = useMemo(() => {
    const extra = Object.values(assigns)
      .filter((row) => row.discord.trim())
      .map((row) => ({ discord: row.discord, room: row.room }));
    const seen = new Set<string>();
    return [...MARK_PLAYERS, ...extra]
      .map((row) => ({ discord: row.discord, room: row.room, label: formatNick(row.discord, row.room) }))
      .filter((row) => {
        const key = row.discord.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return Boolean(row.label);
      });
  }, [assigns]);

  const patch = (id: number, part: Partial<MarkAssign>) => {
    const prev = assigns[id] ?? emptyAssign();
    const bg = MARK_CATALOG[id]?.bg ?? "";
    const nick = part.discord != null || part.room != null
      ? parseNickField(part.discord ?? nickLabel(prev))
      : { discord: prev.discord, room: prev.room };
    const nextRow: MarkAssign = {
      fg: part.fg ?? (prev.fg || resolvedFg(prev, bg)),
      t: part.t != null ? part.t.trim().slice(0, 3).toUpperCase() : prev.t,
      discord: nick.discord,
      room: part.room != null ? part.room.trim().slice(0, 32) : nick.room,
    };
    const next = { ...assigns };
    if (!nextRow.t && !nextRow.discord && !nextRow.fg) delete next[id];
    else next[id] = nextRow;
    onChange(next);
    saveMarkAssigns(next);
  };

  return (
    <div className="px-5 py-4">
      <p className="mb-3 text-[12px]" style={{ color: R.muted }}>
        {t("admin.marks.reserved")}
      </p>
      <datalist id="v2-mark-nicks">
        {nickOptions.map((row) => (
          <option key={row.discord} value={row.label} />
        ))}
      </datalist>
      <div className="v2-mark-wrap">
        <table className="v2-mark-table">
          <thead>
            <tr>
              <th>{t("admin.marks.colNo")}</th>
              <th>{t("admin.marks.colBg")}</th>
              <th>{t("admin.marks.ink")}</th>
              <th>{t("admin.marks.nick")}</th>
              <th>{t("admin.marks.tag")}</th>
              <th>{t("admin.marks.preview")}</th>
            </tr>
          </thead>
          <tbody>
            {MARK_CATALOG.map((color) => {
              const row = assigns[color.id] ?? emptyAssign();
              const fg = resolvedFg(row, color.bg);
              const tagErr = Boolean(row.t) && tagTaken(assigns, row.t, color.id);
              const nickErr = Boolean(row.discord) && nickTaken(assigns, row.discord, color.id);
              const comboErr = Boolean(row.discord || row.t) && comboTaken(assigns, color.id, fg, color.id);
              const inks = MARK_CATALOG_INKS[color.id] ?? [];
              return (
                <tr key={color.id}>
                  <td className="v2-mark-no">{color.id + 1}</td>
                  <td className="v2-mark-bg-cell" style={{ background: color.bg }} title={`#${color.id + 1}`} />
                  <td>
                    <div className="v2-mark-inks">
                      {inks.map((ink) => (
                        <button
                          key={ink.id}
                          type="button"
                          className={`v2-mark-ink-dot${fg === ink.color ? " is-on" : ""}`}
                          style={{ background: ink.color }}
                          title={t(`admin.marks.inkTone.${ink.id}`)}
                          onClick={() => patch(color.id, { fg: ink.color })}
                        />
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      className="v2-ctrl w-full px-2"
                      list="v2-mark-nicks"
                      maxLength={64}
                      value={nickLabel(row)}
                      placeholder={t("admin.marks.nickHint")}
                      onChange={(event) => patch(color.id, { discord: event.target.value })}
                    />
                    {nickErr && <small className="v2-mark-err">{t("admin.marks.dupNick")}</small>}
                  </td>
                  <td>
                    <input
                      className="v2-ctrl v2-mono w-16 px-2"
                      maxLength={3}
                      value={row.t}
                      placeholder={MARK_PREVIEW_TAG}
                      onChange={(event) => patch(color.id, { t: event.target.value })}
                    />
                    {tagErr && <small className="v2-mark-err">{t("admin.marks.dupTag")}</small>}
                  </td>
                  <td>
                    <div className="v2-mark-preview-cell">
                      {slotOf(row, color.bg, comboErr)}
                      {comboErr && <small className="v2-mark-err">{t("admin.marks.dupCombo")}</small>}
                    </div>
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
