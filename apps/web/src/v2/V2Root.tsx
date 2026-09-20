import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isLiveData } from "../data/config";
import { listClubMembers, setMemberAdmin, type ClubRoleRow } from "../data/auth";
import { loadMembers, saveMembers, type ClubMember } from "../schedule/members";
import { loadDiscordOrg, saveDiscordOrg, type DiscordOrg } from "./discordOrg";
import { V2SaveButton } from "./V2SaveButton";

function hasRole(roles: string[], id: string) {
  return roles.includes(id);
}

function RoleCard({ role, title, lead }: { role: "member" | "admin" | "root"; title: string; lead: string }) {
  return (
    <article className={`v2-role-card is-${role}`}>
      <b>{title}</b>
      <p>{lead}</p>
    </article>
  );
}

function RolePills({ roles, t }: { roles: string[]; t: (key: string) => string }) {
  return (
    <span className="v2-role-pills">
      {hasRole(roles, "member") ? <i className="is-member">{t("admin.root.roleMember")}</i> : null}
      {hasRole(roles, "admin") ? <i className="is-admin">{t("admin.root.roleAdmin")}</i> : null}
      {hasRole(roles, "root") ? <i className="is-root">{t("admin.root.roleRoot")}</i> : null}
    </span>
  );
}

export function V2Root() {
  const { t } = useTranslation();
  const [org, setOrg] = useState(loadDiscordOrg);
  const [savedOrg, setSavedOrg] = useState(org);
  const [people, setPeople] = useState(loadMembers);
  const [savedPeople, setSavedPeople] = useState(people);
  const [livePeople, setLivePeople] = useState<ClubRoleRow[] | null>(isLiveData() ? null : []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const orgDirty = JSON.stringify(org) !== JSON.stringify(savedOrg);
  const peopleDirty = JSON.stringify(people) !== JSON.stringify(savedPeople);
  const live = isLiveData();

  const patchOrg = (part: Partial<DiscordOrg>) => setOrg({ ...org, ...part });

  useEffect(() => {
    if (!live) return;
    void listClubMembers().then(setLivePeople);
  }, [live]);

  const toggleLiveAdmin = async (row: ClubRoleRow, on: boolean) => {
    if (hasRole(row.roles, "root")) return;
    setBusyId(row.id);
    setLivePeople((list) =>
      (list ?? []).map((item) => {
        if (item.id !== row.id) return item;
        const roles = on ? [...item.roles.filter((id) => id !== "admin"), "admin"] : item.roles.filter((id) => id !== "admin");
        return { ...item, roles };
      }),
    );
    const { error } = await setMemberAdmin(row.id, on);
    if (error) void listClubMembers().then(setLivePeople);
    setBusyId(null);
  };

  const demoRows = people.filter((row) => row.appAccess || row.isAdmin);

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
        <div className="v2-role-cards">
          <RoleCard role="member" title={t("admin.root.roleMember")} lead={t("admin.root.roleMemberLead")} />
          <RoleCard role="admin" title={t("admin.root.roleAdmin")} lead={t("admin.root.roleAdminLead")} />
          <RoleCard role="root" title={t("admin.root.roleRoot")} lead={t("admin.root.roleRootLead")} />
        </div>
        {live ? (
          <ul className="v2-root-admins">
            {(livePeople ?? []).map((row) => {
              const locked = hasRole(row.roles, "root");
              const on = hasRole(row.roles, "admin") || locked;
              return (
                <li key={row.id}>
                  <label className={locked ? "is-locked" : undefined} title={locked ? t("admin.root.adminLocked") : undefined}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={locked || busyId === row.id || livePeople === null}
                      onChange={(event) => void toggleLiveAdmin(row, event.target.checked)}
                    />
                    <span className="v2-root-admin-who">
                      <b>{row.nick}</b>
                      <small>{row.publicCode}</small>
                    </span>
                    <RolePills roles={row.roles} t={t} />
                  </label>
                </li>
              );
            })}
            {livePeople && !livePeople.length ? (
              <li className="v2-muted">{t("admin.root.emptyPeople")}</li>
            ) : null}
            {livePeople === null ? <li className="v2-muted">…</li> : null}
          </ul>
        ) : (
          <>
            <ul className="v2-root-admins">
              {demoRows.map((row) => (
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
                    <span className="v2-root-admin-who">
                      <b>{row.discord}</b>
                      <small>{row.name}</small>
                    </span>
                    <RolePills roles={rolesOfDemo(row)} t={t} />
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
          </>
        )}
      </section>
    </div>
  );
}

function rolesOfDemo(row: ClubMember) {
  const roles = ["member"];
  if (row.isAdmin) roles.push("admin");
  if (row.discord === "you") roles.push("root");
  return roles;
}
