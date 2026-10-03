import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  loadMemberTablePresets,
  normalizeTablePresets,
  saveMemberTablePresets,
  tablePresetsToDraft,
  validateTablePresetDraft,
} from "../data/tablePresets";
import { BlockBar, Field } from "./cabinetUi";
import { showV2Toast } from "./V2Toast";

type Props = {
  memberId?: string | null;
  fallback: number;
  live: boolean;
  canEdit?: boolean;
  demoValues?: readonly number[];
  onDemoSave?: (values: number[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type SaveStatus = "idle" | "saved" | "error";

function sameValues(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function TablePresetsPanel({
  memberId,
  fallback,
  live,
  canEdit = true,
  demoValues,
  onDemoSave,
  onDirtyChange,
}: Props) {
  const { t } = useTranslation();
  const initial = useMemo(() => normalizeTablePresets(demoValues, fallback), [demoValues, fallback]);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => tablePresetsToDraft(initial));
  const [loading, setLoading] = useState(live);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const validation = useMemo(() => validateTablePresetDraft(draft), [draft]);
  const values = validation.ok ? validation.values : [];
  const dirty = validation.ok ? !sameValues(values, saved) : draft.some((value) => value.trim()) || saved.length > 0;

  useEffect(() => {
    let active = true;
    if (!live || !memberId) {
      const next = normalizeTablePresets(demoValues, fallback);
      setSaved(next);
      setDraft(tablePresetsToDraft(next));
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setStatus("idle");
    setLoading(true);
    void loadMemberTablePresets(memberId, fallback).then((result) => {
      if (!active) return;
      setSaved(result.presets);
      setDraft(tablePresetsToDraft(result.presets));
      setLoading(false);
      if (result.error) setStatus("error");
    });
    return () => {
      active = false;
    };
  }, [demoValues, fallback, live, memberId]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const save = async () => {
    if (!validation.ok || saving || !canEdit) return;
    setSaving(true);
    setStatus("idle");
    if (live) {
      if (!memberId) {
        setSaving(false);
        setStatus("error");
        return;
      }
      const result = await saveMemberTablePresets(memberId, validation.values);
      setSaving(false);
      if (result.error) {
        setStatus("error");
        showV2Toast("err", t("cabinet.tablePresetsSaveError"));
        return;
      }
      setSaved(result.presets);
      setDraft(tablePresetsToDraft(result.presets));
    } else {
      onDemoSave?.(validation.values);
      setSaved(validation.values);
      setDraft(tablePresetsToDraft(validation.values));
      setSaving(false);
    }
    setStatus("saved");
    showV2Toast("ok", t("cabinet.tablePresetsSaved"));
  };

  const reset = () => {
    setDraft(tablePresetsToDraft(saved));
    setStatus("idle");
  };

  return (
    <section className="v2-block v2-cab-card v2-table-presets">
      <div className="v2-cab-head">
        <h2>{t("cabinet.tablePresetsTitle")}</h2>
      </div>
      <div className="v2-cab-body">
        <p className="v2-cab-hint">{t("cabinet.tablePresetsLead")}</p>
        {loading ? (
          <p className="v2-cab-hint" aria-live="polite">{t("cabinet.tablePresetsLoading")}</p>
        ) : (
          <>
            <div className="v2-table-preset-grid">
              {draft.map((value, index) => (
                <Field key={index} label={t("cabinet.tablePresetLabel", { n: index + 1 })}>
                  <input
                    className="v2-ctrl w-full px-3"
                    aria-label={t("cabinet.tablePresetLabel", { n: index + 1 })}
                    inputMode="numeric"
                    maxLength={2}
                    disabled={!canEdit || saving}
                    placeholder="—"
                    value={value}
                    onChange={(event) => {
                      const next = [...draft];
                      next[index] = event.target.value.replace(/[^\d]/g, "").slice(0, 2);
                      setDraft(next);
                      setStatus("idle");
                    }}
                  />
                </Field>
              ))}
            </div>
            {!validation.ok ? (
              <p className="v2-table-preset-status is-error" role="alert">{t(`cabinet.tablePresetError.${validation.error}`)}</p>
            ) : status === "saved" ? (
              <p className="v2-table-preset-status is-ok" role="status">{t("cabinet.tablePresetsSaved")}</p>
            ) : status === "error" ? (
              <p className="v2-table-preset-status is-error" role="alert">{t("cabinet.tablePresetsSaveError")}</p>
            ) : (
              <p className="v2-table-preset-status">{t("cabinet.tablePresetsOrderHint")}</p>
            )}
            <BlockBar
              editing={canEdit}
              dirty={dirty}
              saveDisabled={!validation.ok || saving}
              saveLabel={saving ? t("cabinet.saving") : t("cabinet.save")}
              cancelLabel={t("cabinet.cancel")}
              onSave={() => void save()}
              onCancel={reset}
            />
          </>
        )}
      </div>
    </section>
  );
}
