import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isLiveData } from "../data/config";
import {
  loadBots,
  saveBotConfig,
  saveBotFlag,
  sendBotMessage,
  type BotId,
  type BotRow,
} from "../data/botSettings";
import { FoldHead } from "./FoldHead";
import { V2SaveButton } from "./V2SaveButton";
import { showV2Toast } from "./V2Toast";

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
  const [discordOpen, setDiscordOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [bots, setBots] = useState<Record<BotId, BotRow> | null>(null);

  useEffect(() => {
    void loadBots().then(setBots);
  }, []);

  return (
    <>
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
