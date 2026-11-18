import { useState } from "react";
import { useTranslation } from "react-i18next";
import { saveDiscordFillSettings, type BotRow } from "../../data/botSettings";
import { showV2Toast } from "../V2Toast";
import { V2SaveButton } from "../V2SaveButton";

export function DiscordFillSettings({ row, onChange }: { row: BotRow; onChange: (row: BotRow) => void }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(row.notifyFillQueue);
  const [channels, setChannels] = useState(row.fillChannels);
  const [saving, setSaving] = useState(false);
  const queues = ["nitro", "regular", "both"] as const;
  const dirty = enabled !== row.notifyFillQueue || queues.some(queue => channels[queue].trim() !== row.fillChannels[queue]);
  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const { error } = await saveDiscordFillSettings(enabled, channels);
      if (error) {
        showV2Toast("err", t(error === "invalid-channel" ? "admin.root.fillInvalidChannel" : "admin.people.saveErr"));
        return;
      }
      const fillChannels = { nitro: channels.nitro.trim(), regular: channels.regular.trim(), both: channels.both.trim() };
      setChannels(fillChannels);
      onChange({ ...row, notifyFillQueue: enabled, fillChannels });
      showV2Toast("ok", t("admin.saved"));
    } catch {
      showV2Toast("err", t("admin.people.saveErr"));
    } finally { setSaving(false); }
  };
  return <fieldset className="v2-discord-fill" disabled={saving}>
    <legend>{t("admin.root.fillTitle")}</legend>
    <label className="v2-discord-fill-toggle">
      <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
      <span>{t("admin.root.fillEnabled")}</span>
    </label>
    <div className="v2-discord-fill-fields">
      {queues.map(queue => <label key={queue}>
        <span>{t(`schedule.fill.tabs.${queue}`)}</span>
        <input className="v2-ctrl" inputMode="numeric" maxLength={20} value={channels[queue]}
          aria-label={t("admin.root.fillChannel", { queue: t(`schedule.fill.tabs.${queue}`) })}
          placeholder={t("admin.root.fillChannelPlaceholder")}
          onChange={event => setChannels({ ...channels, [queue]: event.target.value })} />
      </label>)}
    </div>
    <V2SaveButton dirty={dirty && !saving} saved={!dirty} label={t("admin.save")} doneLabel={t("admin.saved")} onClick={() => void save()} />
  </fieldset>;
}
