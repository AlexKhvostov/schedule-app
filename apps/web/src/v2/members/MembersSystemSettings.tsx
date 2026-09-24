import { useTranslation } from "react-i18next";

type Props = {
  selfCreate: boolean;
  saving: boolean;
  onChange: (value: boolean) => void;
};

export function MembersSystemSettings({ selfCreate, saving, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <section className="v2-people-section v2-people-system">
      <header className="v2-people-section-head">
        <span className="v2-people-section-icon"><i className="fa-solid fa-sliders" /></span>
        <span>
          <b>{t("admin.people.systemSettingsTitle")}</b>
          <small>{t("admin.people.systemSettingsLead")}</small>
        </span>
      </header>
      <div className="v2-system-content">
        <button
          type="button"
          role="switch"
          aria-checked={selfCreate}
          className={`v2-settings-row${selfCreate ? " is-on" : ""}`}
          disabled={saving}
          onClick={() => onChange(!selfCreate)}
        >
          <span className="v2-settings-copy">
            <b>{t("admin.people.selfCreate")}</b>
            <small>{t("admin.people.selfCreateHint")}</small>
          </span>
          <span className="v2-settings-state">
            {selfCreate ? t("admin.people.enabled") : t("admin.people.disabled")}
          </span>
          <span className={`v2-settings-switch${selfCreate ? " is-on" : ""}`} aria-hidden />
        </button>
      </div>
    </section>
  );
}
