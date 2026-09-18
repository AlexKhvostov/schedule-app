import { useState } from "react";
import { useTranslation } from "react-i18next";
import { loadMembers, saveMembers } from "../schedule/members";
import { loadDiscordOrg, saveDiscordOrg, type DiscordOrg } from "./discordOrg";
import { V2SaveButton } from "./V2SaveButton";

export function V2Root() {
  const { t } = useTranslation();
  const [org, setOrg] = useState(loadDiscordOrg);
  const [savedOrg, setSavedOrg] = useState(org);
  const [people, setPeople] = useState(loadMembers);
  const [savedPeople, setSavedPeople] = useState(people);
  const orgDirty = JSON.stringify(org) !== JSON.stringify(savedOrg);
  const peopleDirty = JSON.stringify(people) !== JSON.stringify(savedPeople);

  const patchOrg = (part: Partial<DiscordOrg>) => setOrg({ ...org, ...part });

  return (
    <div className="grid gap-5 px-5 py-5">
      <section className="v2-block">
        <h3>{t("admin.root.discordTitle")}</h3>
        <p className="v2-muted">{t("admin.root.discordLead")}</p>
        <div className="v2-org-grid">
          <label>
            <span>{t("admin.root.appName")}</span>
            <input className="v2-ctrl w-full px-3" value={org.appName} onChange={(event) => patchOrg({ appName: event.target.value })} />
          </label>
          <label>
            <span>{t("admin.root.appId")}</span>
            <input className="v2-ctrl w-full px-3" value={org.appId} onChange={(event) => patchOrg({ appId: event.target.value })} />
          </label>
          <label>
            <span>{t("admin.root.botToken")}</span>
            <input className="v2-ctrl w-full px-3" type="password" value={org.botToken} onChange={(event) => patchOrg({ botToken: event.target.value })} />
          </label>
          <label>
            <span>{t("admin.root.guildId")}</span>
            <input className="v2-ctrl w-full px-3" value={org.guildId} onChange={(event) => patchOrg({ guildId: event.target.value })} />
          </label>
          <label>
            <span>{t("admin.root.guildName")}</span>
            <input className="v2-ctrl w-full px-3" value={org.guildName} onChange={(event) => patchOrg({ guildName: event.target.value })} />
          </label>
        </div>
        <V2SaveButton
          dirty={orgDirty}
          saved={!orgDirty}
          label={t("admin.save")}
          doneLabel={t("admin.saved")}
          onClick={() => {
            if (!orgDirty) return;
            saveDiscordOrg(org);
            setSavedOrg(org);
          }}
        />
      </section>
      <section className="v2-block">
        <h3>{t("admin.root.adminsTitle")}</h3>
        <p className="v2-muted">{t("admin.root.adminsLead")}</p>
        <ul className="v2-root-admins">
          {people
            .filter((row) => row.appAccess || row.isAdmin)
            .map((row) => (
              <li key={row.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(row.isAdmin)}
                    disabled={row.discord === "you"}
                    onChange={(event) =>
                      setPeople(people.map((item) => (item.id === row.id ? { ...item, isAdmin: event.target.checked } : item)))
                    }
                  />
                  <b>{row.discord}</b>
                  <span>{row.name}</span>
                </label>
              </li>
            ))}
        </ul>
        <V2SaveButton
          dirty={peopleDirty}
          saved={!peopleDirty}
          label={t("admin.save")}
          doneLabel={t("admin.saved")}
          onClick={() => {
            if (!peopleDirty) return;
            saveMembers(people);
            setSavedPeople(people);
          }}
        />
      </section>
    </div>
  );
}
