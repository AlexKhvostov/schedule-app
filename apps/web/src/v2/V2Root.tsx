import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isLiveData } from "../data/config";
import { listClubMembers, setMemberAdmin, type ClubRoleRow } from "../data/auth";
import {
  loadBots,
  saveBotConfig,
  saveBotFlag,
  sendBotMessage,
  type BotId,
  type BotRow,
} from "../data/botSettings";
import { loadMembers, saveMembers, type ClubMember } from "../schedule/members";
import { FoldHead } from "./FoldHead";
import { V2SaveButton } from "./V2SaveButton";
import { showV2Toast } from "./V2Toast";

function hasRole(roles: string[], id: string) {
  return roles.includes(id);
}

function RoleCard({ role, title, lead }: { role: "member" | "admin" | "staff" | "root"; title: string; lead: string }) {
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
      {hasRole(roles, "staff") ? <i className="is-staff">{t("admin.root.roleStaff")}</i> : null}
      {hasRole(roles, "root") ? <i className="is-root">{t("admin.root.roleRoot")}</i> : null}
    </span>
  );
}

function FlagRow({
  on,
  busy,
  icon,
  title,
  hint,
  soon,
  onToggle,
}: {
  on: boolean;
  busy?: boolean;
  icon: string;
  title: string;
  hint: string;
  soon?: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`v2-settings-row${on ? " is-on" : ""}`}
      disabled={busy}
      title={hint}
      onClick={onToggle}
    >
      <span className="v2-settings-ico">
        <i className={`fa-solid ${icon}`} />
      </span>
      <span className="v2-settings-copy">
        <b>
          {title}
          {soon ? <em className="v2-bot-soon">{t("admin.root.soon")}</em> : null}
        </b>
        <small>{hint}</small>
      </span>
      <span className={`v2-settings-switch${on ? " is-on" : ""}`} aria-hidden />
    </button>
  );
}

function BotPane({
  kind,
  icon,
  kicker,
  title,
  lead,
  children,
}: {
  kind: "config" | "auto" | "send";
  icon: string;
  kicker: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className={`v2-bot-pane is-${kind}`}>
      <header className="v2-bot-pane-head">
        <span className="v2-bot-pane-ico" aria-hidden>
          <i className={icon} />
        </span>
        <div className="v2-bot-pane-copy">
          <span className="v2-admin-kicker">{kicker}</span>
          <h3>{title}</h3>
          {lead ? <p>{lead}</p> : null}
        </div>
      </header>
      <div className="v2-bot-pane-body">{children}</div>
    </section>
  );
}

function BotPanel({
  bot,
  row,
  onChange,
}: {
  bot: BotId;
  row: BotRow;
  onChange: (next: BotRow) => void;
}) {
  const { t } = useTranslation();
  const prefix = bot === "discord" ? "admin.root.discordBot" : "admin.root.telegramBot";
  const [draft, setDraft] = useState(row);
  const [token, setToken] = useState("");
  const [target, setTarget] = useState(row.noticeChat);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [flagBusy, setFlagBusy] = useState<string | null>(null);

  useEffect(() => {
    setDraft(row);
    setToken("");
    setTarget((curr) => (curr.trim() ? curr : row.noticeChat));
  }, [row]);

  const dirty =
    draft.appName !== row.appName ||
    draft.appId !== row.appId ||
    draft.botUsername !== row.botUsername ||
    draft.guildId !== row.guildId ||
    draft.noticeChat !== row.noticeChat ||
    Boolean(token.trim());

  const save = () => {
    setSaving(true);
    void saveBotConfig(bot, {
      appName: draft.appName,
      appId: draft.appId,
      botUsername: draft.botUsername,
      guildId: draft.guildId,
      noticeChat: draft.noticeChat,
      token,
    }).then((result) => {
      setSaving(false);
      if (result.error) {
        showV2Toast("err", t("admin.people.saveErr"));
        return;
      }
      onChange({
        ...draft,
        hasToken: row.hasToken || Boolean(token.trim()),
      });
      setToken("");
      showV2Toast("ok", t("admin.saved"));
    });
  };

  const toggleFlag = (column: "notify_mark_removed" | "notify_fill_queue", value: boolean) => {
    const prev = row;
    onChange({
      ...row,
      notifyMarkRemoved: column === "notify_mark_removed" ? value : row.notifyMarkRemoved,
      notifyFillQueue: column === "notify_fill_queue" ? value : row.notifyFillQueue,
    });
    setFlagBusy(column);
    void saveBotFlag(bot, column, value).then((result) => {
      setFlagBusy(null);
      if (result.error) {
        onChange(prev);
        showV2Toast("err", t("admin.people.saveErr"));
        return;
      }
      showV2Toast("ok", t("admin.saved"));
    });
  };

  const send = () => {
    if (!target.trim() || !text.trim()) return;
    setSending(true);
    void sendBotMessage({ bot, target, text }).then((result) => {
      setSending(false);
      if (result.error) {
        showV2Toast(
          "err",
          result.error === "not-configured" ? t("admin.root.sendNoToken") : t("admin.root.sendErr"),
        );
        return;
      }
      setText("");
      showV2Toast("ok", t("admin.root.sendOk"));
    });
  };

  return (
    <div className={`v2-bot-body is-${bot}`}>
      <BotPane
        kind="config"
        icon="fa-solid fa-sliders"
        kicker={t("admin.root.configKicker")}
        title={t("admin.root.configTitle")}
        lead={t(`${prefix}.configLead`)}
      >
        <div className="v2-org-grid">
          <label>
            <span>{t(`${prefix}.name`)}</span>
            <input className="v2-ctrl w-full px-3" value={draft.appName} onChange={(event) => setDraft({ ...draft, appName: event.target.value })} />
          </label>
          {bot === "discord" ? (
            <>
              <label>
                <span>{t("admin.root.appId")}</span>
                <input className="v2-ctrl w-full px-3" value={draft.appId} onChange={(event) => setDraft({ ...draft, appId: event.target.value })} />
              </label>
              <label>
                <span>{t("admin.root.guildId")}</span>
                <input className="v2-ctrl w-full px-3" value={draft.guildId} onChange={(event) => setDraft({ ...draft, guildId: event.target.value })} />
              </label>
              <label>
                <span>{t("admin.root.noticeChat")}</span>
                <input className="v2-ctrl w-full px-3" value={draft.noticeChat} onChange={(event) => setDraft({ ...draft, noticeChat: event.target.value })} placeholder={t("admin.root.noticeChatPh")} />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>{t("admin.root.telegramBot.username")}</span>
                <input className="v2-ctrl w-full px-3" value={draft.botUsername} onChange={(event) => setDraft({ ...draft, botUsername: event.target.value })} placeholder="@redparty_bot" />
              </label>
              <label>
                <span>{t("admin.root.telegramBot.chat")}</span>
                <input className="v2-ctrl w-full px-3" value={draft.noticeChat} onChange={(event) => setDraft({ ...draft, noticeChat: event.target.value })} placeholder={t("admin.root.telegramBot.chatPh")} />
              </label>
            </>
          )}
          <label className="v2-bot-token">
            <span>
              {t("admin.root.botToken")}
              <em className={`v2-bot-token-flag${row.hasToken ? " is-on" : ""}`}>
                {row.hasToken ? t("admin.root.tokenOn") : t("admin.root.tokenOff")}
              </em>
            </span>
            <input
              className="v2-ctrl w-full px-3"
              type="password"
              autoComplete="new-password"
              placeholder={row.hasToken ? t("admin.root.tokenKeep") : t("admin.root.tokenPh")}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
        </div>
        <V2SaveButton dirty={dirty} saved={!dirty} label={saving ? "…" : t("admin.save")} doneLabel={t("admin.saved")} onClick={save} />
      </BotPane>

      <BotPane
        kind="auto"
        icon="fa-solid fa-bell"
        kicker={t("admin.root.autoKicker")}
        title={t("admin.root.autoTitle")}
        lead={t("admin.root.autoLead")}
      >
        <div className="v2-bot-flags">
          <FlagRow
            on={row.notifyMarkRemoved}
            busy={flagBusy === "notify_mark_removed"}
            icon="fa-eraser"
            title={t("admin.root.autoMark")}
            hint={t("admin.root.autoMarkHint")}
            onToggle={() => toggleFlag("notify_mark_removed", !row.notifyMarkRemoved)}
          />
          <FlagRow
            on={row.notifyFillQueue}
            busy={flagBusy === "notify_fill_queue"}
            icon="fa-list-ol"
            title={t("admin.root.autoQueue")}
            hint={t("admin.root.autoQueueHint")}
            soon
            onToggle={() => toggleFlag("notify_fill_queue", !row.notifyFillQueue)}
          />
        </div>
      </BotPane>

      <BotPane
        kind="send"
        icon={bot === "discord" ? "fa-brands fa-discord" : "fa-brands fa-telegram"}
        kicker={t("admin.root.sendKicker")}
        title={t("admin.root.sendTitle")}
        lead={t(`${prefix}.sendLead`)}
      >
        <div className="v2-bot-send">
          <label>
            <span>{t(`${prefix}.target`)}</span>
            <input className="v2-ctrl w-full px-3" value={target} onChange={(event) => setTarget(event.target.value)} placeholder={t(`${prefix}.targetPh`)} />
          </label>
          {row.noticeChat && target.trim() !== row.noticeChat ? (
            <button type="button" className="v2-bot-use-chat" onClick={() => setTarget(row.noticeChat)}>
              {t("admin.root.sendUseChat")}
            </button>
          ) : null}
          <label>
            <span>{t("admin.root.sendText")}</span>
            <textarea className="v2-ctrl v2-bot-text" rows={4} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <button type="button" className="v2-ctrl v2-bot-send-go" disabled={sending || !target.trim() || !text.trim()} onClick={send}>
            {sending ? "…" : t("admin.root.sendGo")}
          </button>
        </div>
      </BotPane>
    </div>
  );
}

export function V2Root() {
  const { t } = useTranslation();
  const live = isLiveData();
  const [rolesOpen, setRolesOpen] = useState(false);
  const [discordOpen, setDiscordOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [bots, setBots] = useState<Record<BotId, BotRow> | null>(null);
  const [people, setPeople] = useState(loadMembers);
  const [savedPeople, setSavedPeople] = useState(people);
  const [livePeople, setLivePeople] = useState<ClubRoleRow[] | null>(live ? null : []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const peopleDirty = JSON.stringify(people) !== JSON.stringify(savedPeople);
  const demoRows = people.filter((row) => row.appAccess || row.isAdmin);

  useEffect(() => {
    void loadBots().then(setBots);
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

  return (
    <>
      <section className="v2-admin-card">
        <FoldHead
          kicker={t("admin.root.rolesKicker")}
          title={t("admin.root.adminsTitle")}
          lead={t("admin.root.adminsLead")}
          open={rolesOpen}
          onToggle={() => setRolesOpen((value) => !value)}
        />
        <div className="px-3 pb-4" hidden={!rolesOpen}>
          <div className="v2-role-cards">
            <RoleCard role="member" title={t("admin.root.roleMember")} lead={t("admin.root.roleMemberLead")} />
            <RoleCard role="admin" title={t("admin.root.roleAdmin")} lead={t("admin.root.roleAdminLead")} />
            <RoleCard role="staff" title={t("admin.root.roleStaff")} lead={t("admin.root.roleStaffLead")} />
            <RoleCard role="root" title={t("admin.root.roleRoot")} lead={t("admin.root.roleRootLead")} />
          </div>
          {live ? (
            <ul className="v2-root-admins">
              {(livePeople ?? []).map((row) => {
                const locked = hasRole(row.roles, "root");
                const on = hasRole(row.roles, "admin");
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
              {livePeople && !livePeople.length ? <li className="v2-muted">{t("admin.root.emptyPeople")}</li> : null}
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
        </div>
      </section>

      <section className="v2-admin-card">
        <FoldHead
          kicker={t("admin.root.discordBot.kicker")}
          title={t("admin.root.discordBot.title")}
          lead={t("admin.root.discordBot.lead")}
          open={discordOpen}
          onToggle={() => setDiscordOpen((value) => !value)}
        />
        <div hidden={!discordOpen}>
          {bots ? (
            <BotPanel
              bot="discord"
              row={bots.discord}
              onChange={(next) => setBots((curr) => (curr ? { ...curr, discord: next } : curr))}
            />
          ) : (
            <p className="v2-muted px-3 pb-3">{live ? "…" : t("admin.root.botsLocal")}</p>
          )}
        </div>
      </section>

      <section className="v2-admin-card">
        <FoldHead
          kicker={t("admin.root.telegramBot.kicker")}
          title={t("admin.root.telegramBot.title")}
          lead={t("admin.root.telegramBot.lead")}
          open={telegramOpen}
          onToggle={() => setTelegramOpen((value) => !value)}
        />
        <div hidden={!telegramOpen}>
          {bots ? (
            <BotPanel
              bot="telegram"
              row={bots.telegram}
              onChange={(next) => setBots((curr) => (curr ? { ...curr, telegram: next } : curr))}
            />
          ) : (
            <p className="v2-muted px-3 pb-3">{live ? "…" : t("admin.root.botsLocal")}</p>
          )}
        </div>
      </section>
    </>
  );
}

function rolesOfDemo(row: ClubMember) {
  const roles = ["member"];
  if (row.isAdmin) roles.push("admin");
  if (row.discord === "you") roles.push("root");
  return roles;
}
