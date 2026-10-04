import { memo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

const HELP_GROUPS = [
  { id: "marks", items: ["edit", "place", "remove", "tables"] as const },
  { id: "read", items: ["cursor", "tip"] as const },
  { id: "screen", items: ["search", "settings"] as const },
];

export const OptHelp = memo(function OptHelp({ countTables = false, tools }: { countTables?: boolean; tools?: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section className={`v2-opt-help${open ? " is-open" : ""}${tools ? " has-tools" : ""}`}>
      <div className="v2-opt-help-bar">
        <button
          type="button"
          className="v2-opt-help-toggle"
          aria-expanded={open}
          aria-controls="v2-opt-help-body"
          aria-label={t("v2.help.title")}
          onClick={() => setOpen((value) => !value)}
        >
          <i className="fa-regular fa-circle-question" aria-hidden />
          <span>{t("v2.help.title")}</span>
          <i className={`fa-solid fa-angle-down${open ? " is-open" : ""}`} aria-hidden />
        </button>
        {tools ? <div className="v2-opt-help-tools">{tools}</div> : null}
      </div>
      {open ? (
        <div className="v2-opt-help-body" id="v2-opt-help-body">
          <p className="v2-opt-help-lead">{t("v2.help.lead")}</p>
          <div className="v2-opt-help-groups">
            {HELP_GROUPS.map((group) => (
              <article key={group.id} className="v2-opt-help-card">
                <h4>{t(`v2.help.groups.${group.id}`)}</h4>
                {group.items
                  .filter((key) => countTables || key !== "tables")
                  .map((key) => (
                    <div key={key} className="v2-opt-help-item">
                      <b>{t(`v2.help.${key}.h`)}</b>
                      <p>{t(`v2.help.${key}.p`)}</p>
                    </div>
                  ))}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
});
