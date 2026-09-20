import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS, formatLimit } from "../schedule/capacity";
import { limitsOfKind, normalizePlay, withKindLimits, type RoomPlay } from "../schedule/members";
import { ROOM_OPTIONS, emptyRoomPlay, roomName } from "../schedule/rooms";
import { BlockBar, Chip, Field } from "./cabinetUi";

type Props = {
  plays: RoomPlay[];
  savedPlays: RoomPlay[];
  playId: string;
  loading?: boolean;
  canEdit?: boolean;
  defaultNick?: string;
  onPlayId: (id: string) => void;
  onPatch: (id: string, part: Partial<RoomPlay>) => void;
  onPersist: (next: RoomPlay[], selectRoomId?: string) => Promise<boolean | void> | boolean | void;
  onCancel: () => void;
};

function formatStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CabinetPlaysPanel({
  plays,
  savedPlays,
  playId,
  loading,
  canEdit = true,
  defaultNick = "",
  onPlayId,
  onPatch,
  onPersist,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [roomModal, setRoomModal] = useState<RoomPlay | null>(null);
  const [nickHistOpen, setNickHistOpen] = useState(false);
  const activePlay = plays.find((row) => row.id === playId) ?? plays[0];
  const savedPlay = activePlay ? savedPlays.find((item) => item.id === activePlay.id) : undefined;
  const roomDirty =
    Boolean(activePlay) &&
    (!savedPlay ||
      activePlay.roomId !== savedPlay.roomId ||
      activePlay.nick !== savedPlay.nick ||
      limitsOfKind(activePlay, "nitro").join() !== limitsOfKind(savedPlay, "nitro").join() ||
      limitsOfKind(activePlay, "regular").join() !== limitsOfKind(savedPlay, "regular").join());

  const togglePlayLimit = (id: string, kind: "nitro" | "regular", limit: (typeof LIMIT_OPTIONS)[number]) => {
    const row = plays.find((item) => item.id === id);
    if (!row || !canEdit) return;
    const current = limitsOfKind(row, kind);
    const next = current.includes(limit)
      ? current.filter((item) => item !== limit)
      : [...current, limit].sort((a, b) => Number(a) - Number(b));
    onPatch(id, withKindLimits(row, kind, next));
  };

  const saveRoom = (id: string) => {
    const draft = plays.find((row) => row.id === id);
    if (!draft) return;
    const saved = savedPlays.find((row) => row.id === id);
    const nick = draft.nick.trim();
    const history =
      nick && nick !== (saved?.nick ?? "")
        ? [{ nick, at: new Date().toISOString() }, ...(saved?.nickHistory ?? draft.nickHistory)].slice(0, 20)
        : (saved?.nickHistory ?? draft.nickHistory);
    void onPersist(plays.map((row) => (row.id === id ? { ...row, nick, nickHistory: history } : row)));
  };

  const openAddRoom = () => {
    const used = new Set(plays.map((row) => row.roomId));
    const roomId = ROOM_OPTIONS.find((room) => !used.has(room.id))?.id ?? "winamax";
    setRoomModal({ ...emptyRoomPlay(roomId), nick: defaultNick });
  };

  const saveModalRoom = () => {
    if (!roomModal) return;
    const nick = roomModal.nick.trim();
    const row = normalizePlay({
      ...roomModal,
      nick,
      nickHistory: nick ? [{ nick, at: new Date().toISOString() }] : [],
    });
    void Promise.resolve(onPersist([...savedPlays, row], row.roomId)).then((ok) => {
      if (ok === false) return;
      setRoomModal(null);
    });
  };

  return (
    <>
      <section className="v2-block v2-cab-card">
        <div className="v2-cab-head">
          <h2>{t("cabinet.gameTitle")}</h2>
        </div>
        <div className="v2-cab-body">
          <p className="v2-cab-hint">{t("cabinet.gameLead")}</p>
          {loading ? (
            <p className="v2-cab-hint">{t("admin.people.roomLoading")}</p>
          ) : activePlay ? (
            <div className="v2-cab-room">
              <div className="v2-cab-room-pick">
                <Field label={t("cabinet.roomPick")}>
                  <select className="v2-ctrl px-2" value={activePlay.id} disabled={!canEdit} onChange={(event) => onPlayId(event.target.value)}>
                    {plays.map((row) => (
                      <option key={row.id} value={row.id}>
                        {roomName(row.roomId)}
                      </option>
                    ))}
                  </select>
                </Field>
                <button type="button" className="v2-ctrl px-3" disabled={!canEdit} onClick={openAddRoom}>
                  {t("cabinet.roomAdd")}
                </button>
              </div>
              <div className="v2-cab-room-split">
                <div className="v2-cab-room-pane">
                  <p className="v2-cab-pane-title">{t("cabinet.roomKindsLimits")}</p>
                  <p className="v2-cab-hint">{t("cabinet.roomKindsHint")}</p>
                  {(["nitro", "regular"] as const).map((kind) => {
                    const selected = limitsOfKind(activePlay, kind);
                    return (
                      <div key={kind} className={`v2-cab-kind${selected.length ? "" : " is-off"}`}>
                        <div className="v2-cab-kind-head">
                          <b>{kind === "nitro" ? "Nitro" : "Regular"}</b>
                          <small>{selected.length ? t("cabinet.kindOn", { n: selected.length }) : t("cabinet.kindOff")}</small>
                        </div>
                        <div className="v2-cab-pills">
                          {LIMIT_OPTIONS.map((limit) => (
                            <Chip key={`${kind}-${limit}`} on={selected.includes(limit)} disabled={!canEdit} onClick={() => togglePlayLimit(activePlay.id, kind, limit)}>
                              {formatLimit(limit)}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="v2-cab-room-pane is-nick">
                  <p className="v2-cab-pane-title">{t("cabinet.roomNickPane")}</p>
                  <Field label={t("cabinet.roomNickField", { room: roomName(activePlay.roomId) })} hint={t("cabinet.roomNickUpdate")}>
                    <input
                      className="v2-ctrl w-full px-2"
                      disabled={!canEdit}
                      value={activePlay.nick}
                      onChange={(event) => onPatch(activePlay.id, { nick: event.target.value })}
                    />
                  </Field>
                  <p className="v2-cab-label">{t("cabinet.nickHistoryLabel")}</p>
                  {activePlay.nickHistory.length ? (
                    <ul className="v2-cab-history">
                      {activePlay.nickHistory.slice(0, 5).map((stamp, index) => (
                        <li key={`${stamp.nick}-${stamp.at}-${index}`}>
                          <b>{stamp.nick}</b>
                          <span>{formatStamp(stamp.at)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="v2-cab-hint">{t("cabinet.nickHistoryEmpty")}</p>
                  )}
                  {activePlay.nickHistory.length > 5 ? (
                    <button type="button" className="v2-cab-ghost" onClick={() => setNickHistOpen(true)}>
                      {t("cabinet.nickHistoryOpen")}
                    </button>
                  ) : null}
                </div>
              </div>
              <BlockBar
                editing
                dirty={roomDirty}
                saveLabel={t("cabinet.save")}
                cancelLabel={t("cabinet.cancel")}
                extra={
                  plays.length > 1 ? (
                    <button
                      type="button"
                      className="v2-cab-ghost"
                      disabled={!canEdit}
                      onClick={() => {
                        void onPersist(savedPlays.filter((item) => item.id !== activePlay.id));
                      }}
                    >
                      {t("cabinet.roomRemove")}
                    </button>
                  ) : null
                }
                onSave={() => saveRoom(activePlay.id)}
                onCancel={onCancel}
              />
            </div>
          ) : (
            <div className="v2-cab-empty">
              <p className="v2-cab-hint">{t("cabinet.roomEmpty")}</p>
              <button type="button" className="v2-ctrl px-3" disabled={!canEdit} onClick={openAddRoom}>
                {t("cabinet.roomAdd")}
              </button>
            </div>
          )}
        </div>
      </section>

      {roomModal ? (
        <div className="v2-mem-overlay" onClick={() => setRoomModal(null)}>
          <div className="v2-mem-modal v2-cab-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
            <div className="v2-cab-head">
              <h2>{t("cabinet.roomAdd")}</h2>
            </div>
            <Field label={t("cabinet.roomPick")}>
              <select className="v2-ctrl w-full px-2" value={roomModal.roomId} onChange={(event) => setRoomModal({ ...roomModal, roomId: event.target.value })}>
                {ROOM_OPTIONS.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("cabinet.roomNickField", { room: roomName(roomModal.roomId) })}>
              <input className="v2-ctrl w-full px-2" value={roomModal.nick} onChange={(event) => setRoomModal({ ...roomModal, nick: event.target.value })} />
            </Field>
            <div className="v2-cab-actions">
              <button type="button" className="v2-ctrl px-3 is-on" onClick={saveModalRoom}>
                {t("cabinet.saveRoom")}
              </button>
              <button type="button" className="v2-cab-ghost" onClick={() => setRoomModal(null)}>
                {t("cabinet.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {nickHistOpen && activePlay ? (
        <div className="v2-mem-overlay" onClick={() => setNickHistOpen(false)}>
          <div className="v2-mem-modal v2-cab-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
            <div className="v2-cab-head">
              <h2>{t("cabinet.nickHistoryTitle", { room: roomName(activePlay.roomId) })}</h2>
            </div>
            <ul className="v2-cab-history">
              {activePlay.nickHistory.map((stamp, index) => (
                <li key={`${stamp.nick}-${stamp.at}-${index}`}>
                  <b>{stamp.nick}</b>
                  <span>{formatStamp(stamp.at)}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="v2-cab-ghost" onClick={() => setNickHistOpen(false)}>
              {t("cabinet.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
