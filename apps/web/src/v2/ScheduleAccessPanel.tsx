import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS, formatLimit } from "../schedule/capacity";
import {
  accessKey,
  loadScheduleAccess,
  type ScheduleAccessKey,
} from "../data/scheduleAccess";
import { Chip } from "./cabinetUi";

type Props = {
  memberId: string;
};

function toSet(rows: ScheduleAccessKey[]) {
  return new Set(rows.map((row) => accessKey(row.variant, row.limit)));
}

export function ScheduleAccessPanel({ memberId }: Props) {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    void loadScheduleAccess(memberId).then((rows) => {
      if (!live) return;
      const next = toSet(rows);
      setKeys(new Set(next));
    });
    return () => {
      live = false;
    };
  }, [memberId]);

  return (
    <section className="v2-block v2-cab-card v2-staff-card">
      <div className="v2-cab-head">
        <h2>{t("admin.access.title")}</h2>
        <span className="v2-staff-only-tag">{t("admin.people.staffOnly")}</span>
      </div>
      <div className="v2-cab-body">
        <div className="v2-staff-only">
          <p className="v2-access-kicker">{t("admin.access.schedule")}</p>
          <p className="v2-cab-hint">{t("admin.people.roleManagedAccess")}</p>
          {(["nitro", "regular"] as const).map((kind) => (
            <div key={kind} className="v2-access-kind">
              <b>{kind === "nitro" ? "Nitro" : "Regular"}</b>
              <div className="v2-cab-pills">
                {LIMIT_OPTIONS.map((limit) => {
                  const id = accessKey(kind, limit);
                  return (
                    <Chip key={id} on={keys.has(id)} disabled onClick={() => undefined}>
                      {formatLimit(limit)}
                    </Chip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
