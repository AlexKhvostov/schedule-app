import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS, formatLimit } from "../schedule/capacity";
import {
  accessKey,
  loadScheduleAccess,
  saveScheduleAccess,
  type ScheduleAccessKey,
} from "../data/scheduleAccess";
import { Chip } from "./cabinetUi";
import { showV2Toast } from "./V2Toast";

type Props = {
  memberId: string;
};

function toSet(rows: ScheduleAccessKey[]) {
  return new Set(rows.map((row) => accessKey(row.variant, row.limit)));
}

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function parseKey(id: string): ScheduleAccessKey | null {
  const [variant, limit] = id.split(":");
  if ((variant !== "nitro" && variant !== "regular") || !limit) return null;
  return { variant, limit };
}

export function ScheduleAccessPanel({ memberId }: Props) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const dirty = !sameSet(keys, saved);

  useEffect(() => {
    let live = true;
    void loadScheduleAccess(memberId).then((rows) => {
      if (!live) return;
      const next = toSet(rows);
      setSaved(next);
      setKeys(new Set(next));
    });
    return () => {
      live = false;
    };
  }, [memberId]);

  const toggle = (variant: "nitro" | "regular", limit: string) => {
    if (busy) return;
    const id = accessKey(variant, limit);
    setKeys((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  const persist = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    const next = [...keys].map(parseKey).filter((row): row is ScheduleAccessKey => Boolean(row));
    const result = await saveScheduleAccess(memberId, next);
    setBusy(false);
    if (result.error) {
      showV2Toast("err", t("admin.people.saveErr"));
      return;
    }
    setSaved(new Set(keys));
    showV2Toast("ok", t("admin.saved"));
  };

  return (
    <section className="v2-block v2-cab-card v2-staff-card">
      <div className="v2-cab-head">
        <h2>{t("admin.access.title")}</h2>
        <span className="v2-staff-only-tag">{t("admin.people.staffOnly")}</span>
      </div>
      <div className="v2-cab-body">
        <div className="v2-staff-only">
          <p className="v2-access-kicker">{t("admin.access.schedule")}</p>
          <p className="v2-cab-hint">{t("admin.access.lead")}</p>
          {(["nitro", "regular"] as const).map((kind) => (
            <div key={kind} className="v2-access-kind">
              <b>{kind === "nitro" ? "Nitro" : "Regular"}</b>
              <div className="v2-cab-pills">
                {LIMIT_OPTIONS.map((limit) => {
                  const id = accessKey(kind, limit);
                  return (
                    <Chip key={id} on={keys.has(id)} disabled={busy} onClick={() => toggle(kind, limit)}>
                      {formatLimit(limit)}
                    </Chip>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="v2-cab-foot">
            <span />
            <div className="v2-cab-foot-act">
              <button type="button" className="v2-cab-ghost" disabled={!dirty || busy} onClick={() => setKeys(new Set(saved))}>
                {t("admin.people.cancel")}
              </button>
              <button type="button" className={`v2-ctrl v2-save px-3${dirty ? " is-dirty" : ""}`} disabled={!dirty || busy} onClick={() => void persist()}>
                {t("admin.save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
