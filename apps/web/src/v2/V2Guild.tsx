import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CET, formatClock } from "../schedule/cet";
import { loadCachedRoster, personLabel, refreshGuildRoster, type GuildLoadError, type GuildRoster } from "../data/guild";
import { PersonAvatar } from "./PersonAvatar";
import { catalogRoles, RolePick, RolePills } from "./RolePills";

type Filter = "people" | "bots" | "all";

function joinedLabel(value: string | null, locale: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function V2Guild() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const [roster, setRoster] = useState<GuildRoster | null>(null);
  const [error, setError] = useState<GuildLoadError | null>(null);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("people");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);

  const boot = async () => {
    setBusy(true);
    const cached = await loadCachedRoster();
    setRoster(cached);
    setError(null);
    setBusy(false);
  };

  const refresh = async () => {
    setBusy(true);
    const next = await refreshGuildRoster();
    setRoster(next.roster);
    setError(next.error);
    setBusy(false);
  };

  useEffect(() => {
    void boot();
  }, []);

  const people = roster?.members.filter((row) => !row.bot).length ?? 0;
  const bots = roster?.members.filter((row) => row.bot).length ?? 0;
  const rolePicked = useMemo(() => new Set(roleFilter), [roleFilter]);
  const roleCatalog = useMemo(() => catalogRoles(roster?.members ?? []), [roster]);
  const toggleRole = (id: string) => {
    setRoleFilter((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const rows = useMemo(() => {
    const list = roster?.members ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((row) => {
      if (filter === "people" && row.bot) return false;
      if (filter === "bots" && !row.bot) return false;
      if (rolePicked.size && !row.roles.some((role) => rolePicked.has(role.id))) return false;
      if (!q) return true;
      return [row.nick, row.globalName, row.username, row.id, ...row.roles.map((role) => role.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [roster, query, filter, rolePicked]);

  return (
    <div className="v2-guild-stage min-h-0 flex-1 overflow-auto">
      <section className="v2-admin-card v2-guild-card">
        <header className="v2-guild-head">
          <div className="v2-guild-id">
            {roster?.guild.iconUrl ? (
              <img className="v2-guild-icon" src={roster.guild.iconUrl} alt="" />
            ) : (
              <span className="v2-guild-icon is-empty">
                <i className="fa-brands fa-discord" />
              </span>
            )}
            <div>
              <span className="v2-admin-kicker">{t("guild.kicker")}</span>
              <h1>{roster?.guild.name || t("nav.guild")}</h1>
              <p className="v2-muted">
                {roster
                  ? t("guild.counts", { n: roster.guild.memberCount, online: roster.guild.onlineCount ?? "—" })
                  : t("guild.lead")}
                {roster ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    {t("guild.synced", { time: formatClock(new Date(roster.fetchedAt), CET) })}
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <button type="button" className="v2-guild-refresh" disabled={busy} onClick={() => void refresh()}>
            <i className={`fa-solid fa-rotate${busy ? " fa-spin" : ""}`} />
            {busy ? t("guild.loading") : t("guild.refresh")}
          </button>
        </header>

        {error ? (
          <div className="v2-guild-banner">
            <b>{t(`guild.err.${error}.title`)}</b>
            <span className="v2-muted">{t(`guild.err.${error}.lead`)}</span>
          </div>
        ) : null}

        {!roster && !busy ? (
          <div className="v2-guild-empty">
            <i className="fa-brands fa-discord" />
            <h2>{t("guild.empty.title")}</h2>
            <p className="v2-muted">{t("guild.empty.lead")}</p>
          </div>
        ) : roster ? (
          <>
            <div className="v2-guild-tools">
              <label className="v2-guild-search">
                <i className="fa-solid fa-magnifying-glass" />
                <input
                  className="v2-ctrl"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("guild.search")}
                />
              </label>
              <div className="v2-guild-filters">
                {(
                  [
                    ["people", people],
                    ["bots", bots],
                    ["all", people + bots],
                  ] as const
                ).map(([key, count]) => (
                  <button key={key} type="button" className={filter === key ? "is-on" : ""} onClick={() => setFilter(key)}>
                    {t(`guild.filter.${key}`, { n: count })}
                  </button>
                ))}
              </div>
              <div className="v2-guild-role-pick">
                <RolePick
                  roles={roleCatalog}
                  picked={rolePicked}
                  onToggle={toggleRole}
                  label={t("guild.col.roles")}
                  emptyLabel={t("admin.people.filterRolesAll")}
                />
              </div>
            </div>
            <div className="v2-guild-scroll">
              <table className="v2-guild-table">
                <thead>
                  <tr>
                    <th>{t("guild.col.person")}</th>
                    <th>{t("guild.col.discord")}</th>
                    <th>{t("guild.col.id")}</th>
                    <th>{t("guild.col.roles")}</th>
                    <th>{t("guild.col.joined")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={row.bot ? "is-bot" : undefined}>
                      <td>
                        <div className="is-person">
                          <PersonAvatar src={row.avatarUrl} label={personLabel(row)} />
                          <span>
                            <b>{personLabel(row)}</b>
                            {row.bot ? <small>{t("guild.bot")}</small> : row.nick && row.globalName ? <small>{row.globalName}</small> : null}
                          </span>
                        </div>
                      </td>
                      <td className="is-user">@{row.username}</td>
                      <td className="is-id">{row.id}</td>
                      <td>
                        <RolePills roles={row.roles} max={3} />
                      </td>
                      <td className="is-date">{joinedLabel(row.joinedAt, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && !busy ? <p className="v2-guild-none v2-muted">{t("guild.none")}</p> : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
