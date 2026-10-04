import { useEffect, useMemo, useRef, useState } from "react";
import { loadLiveMember } from "../../data/auth";
import { isLiveData } from "../../data/config";
import { listSchedulePlayers, markFromPlayer, type SchedulePlayer } from "../../data/players";
import { loadMyPlays } from "../../data/plays";
import { accessKey, loadScheduleAccess } from "../../data/scheduleAccess";
import { loadMemberTablePresets, subscribeMemberTablePresets } from "../../data/tablePresets";
import { ME, type Mark } from "../../schedule/marks";
import { loadMembers, memberOfSession } from "../../schedule/members";
import { schedulePlayPairKeys } from "../../schedule/playerScheduleLimits";
import { readSession } from "../session";
import { loadTablePresetSelection, saveTablePresetSelection } from "../tablePresetSelection";

export function useScheduleBrush({ memberId, mayActAs, editByButton, canEdit, limitMarks }: {
  memberId?: string;
  mayActAs: boolean;
  editByButton: boolean;
  canEdit: boolean;
  limitMarks: Mark[] | null;
}) {
  const [selfMark, setSelfMark] = useState<Mark>({ ...ME });

  const [me, setMe] = useState<Mark>({ ...ME });

  const [actingId, setActingId] = useState<string | undefined>(memberId);

  const [players, setPlayers] = useState<SchedulePlayer[]>([]);

  const actingRef = useRef<string | undefined>(memberId);

  const accessRef = useRef<Set<string>>(new Set());

  const selectedPlayPairsRef = useRef<Set<string> | null>(null);

  const selfMarkRef = useRef(selfMark);

  selfMarkRef.current = selfMark;

  const [tablePresets, setTablePresets] = useState<number[]>([ME.tables]);

  const [tablePresetOwnerId, setTablePresetOwnerId] = useState<string>();

  const sessionNick = readSession()?.nick ?? "";

  const selfId = memberId ?? memberOfSession(loadMembers(), { memberId, nick: sessionNick })?.id;

  actingRef.current = actingId || selfId;

  const selfIdRef = useRef(selfId);

  selfIdRef.current = selfId;

  useEffect(() => {
    const id = actingId || selfId;
    selectedPlayPairsRef.current = null;
    if (!id) {
      accessRef.current = new Set();
      return;
    }
    if (!isLiveData()) {
      accessRef.current = new Set();
      const member = loadMembers().find((row) => row.id === id);
      const selected = schedulePlayPairKeys(member?.plays ?? []);
      if (!selected.size) {
        for (const limit of member?.limits ?? []) selected.add(accessKey("nitro", limit));
      }
      selectedPlayPairsRef.current = selected;
      return;
    }
    let live = true;
    void Promise.all([loadScheduleAccess(id), loadMyPlays(id)]).then(([rows, plays]) => {
      if (!live) return;
      accessRef.current = new Set(rows.map((row) => accessKey(row.variant, row.limit)));
      selectedPlayPairsRef.current = schedulePlayPairKeys(plays);
    });
    return () => {
      live = false;
    };
  }, [actingId, selfId]);

  useEffect(() => {
    const applySelf = (mark: Mark, id?: string) => {
      setSelfMark(mark);
      setActingId((current) => {
        if (current && id && current !== id) return current;
        setMe(mark);
        return id ?? current;
      });
    };
    if (isLiveData()) {
      void loadLiveMember().then(async (member) => {
        if (!member) return;
        const plays = await loadMyPlays(member.id);
        const roomNick = plays.find((play) => play.roomId === "winamax")?.nick.trim() ?? "";
        applySelf(
          {
            t: member.markTag ?? "",
            discord: /^RP-/i.test(member.nick) ? "" : member.nick,
            room: roomNick,
            bg: member.markBg,
            fg: member.markFg,
            tables: member.tables,
            memberId: member.id,
          },
          member.id,
        );
      });
      return;
    }
    const row = memberOfSession(loadMembers(), { memberId, nick: sessionNick });
    if (!row) return;
    applySelf(markFromPlayer({
      id: row.id,
      nick: row.discord,
      publicCode: row.room,
      roomNick: row.room,
      avatarUrl: row.avatar,
      username: row.discord,
      globalName: row.discordDisplay,
      guildNick: row.discordGuildNick,
      markTag: row.mark.t,
      markBg: row.mark.bg || ME.bg,
      markFg: row.mark.fg || "#111827",
      tables: row.tables ?? 11,
    }), row.id);
  }, [memberId, sessionNick]);

  useEffect(() => {
    if (!editByButton || canEdit) return;
    setActingId(selfId);
    setMe(selfMarkRef.current);
  }, [canEdit, selfId, editByButton]);

  useEffect(() => {
    if (mayActAs) return;
    if (!selfId) return;
    setActingId(selfId);
    setMe(selfMarkRef.current);
  }, [mayActAs, selfId]);

  useEffect(() => {
    void listSchedulePlayers().then(setPlayers);
  }, []);

  const brushId = actingId || selfId;

  useEffect(() => {
    if (!brushId) return;
    let active = true;
    const player = players.find((row) => row.id === brushId);
    const fallback = brushId === selfId ? selfMarkRef.current.tables : player?.tables ?? 1;
    setTablePresetOwnerId(undefined);
    const apply = (presets: readonly number[]) => {
      if (!active) return;
      const selected = loadTablePresetSelection(brushId, presets, fallback);
      setTablePresets(selected.values);
      setTablePresetOwnerId(brushId);
      setMe((mark) => (mark.memberId && mark.memberId !== brushId ? mark : { ...mark, tables: selected.active }));
      if (brushId === selfId) {
        setSelfMark((mark) => ({ ...mark, tables: selected.active }));
      }
    };
    if (!isLiveData()) {
      const member = loadMembers().find((row) => row.id === brushId);
      apply(member?.tablePresets ?? player?.tablePresets ?? [fallback]);
      return () => {
        active = false;
      };
    }
    const reload = () => {
      void loadMemberTablePresets(brushId, fallback).then((result) => apply(result.presets));
    };
    reload();
    const off = subscribeMemberTablePresets(brushId, reload);
    return () => {
      active = false;
      off();
    };
  }, [brushId, selfId, players]);

  const actPlayers = useMemo(() => {
    const known = new Map(players.map((row) => [row.id, row]));
    const seen = new Set<string>();
    const rows: SchedulePlayer[] = [];
    for (const mark of limitMarks ?? []) {
      const id = mark.memberId;
      if (!id || !mark.t.trim() || seen.has(id)) continue;
      seen.add(id);
      const extra = known.get(id);
      rows.push({
        id,
        nick: extra?.nick || mark.discord,
        publicCode: extra?.publicCode || mark.room,
        roomNick: extra?.roomNick || mark.room,
        markTag: mark.t,
        markBg: mark.bg,
        markFg: mark.fg,
        tables: extra?.tables || mark.tables,
        avatarUrl: extra?.avatarUrl || mark.avatarUrl,
        username: extra?.username || mark.username,
        globalName: extra?.globalName || mark.globalName,
        guildNick: extra?.guildNick || mark.guildNick,
        profileName: extra?.profileName,
      });
    }
    return rows.sort((a, b) => a.nick.localeCompare(b.nick, undefined, { sensitivity: "base" }));
  }, [limitMarks, players]);

  const applyActAs = (id: string) => {
    if (selfId && id === selfId) {
      setActingId(selfId);
      setMe(selfMarkRef.current);
      return;
    }
    const row = players.find((item) => item.id === id);
    if (row) {
      const mark = markFromPlayer(row);
      setActingId(row.id);
      setMe(mark);
      return;
    }
    const mark = (limitMarks ?? []).find((item) => item.memberId === id);
    if (!mark?.memberId) return;
    setActingId(mark.memberId);
    setMe(mark);
  };

  const loadTablePresetsForPlayer = async (memberId: string) => {
    const player = players.find((row) => row.id === memberId);
    const fallback = memberId === selfId ? selfMarkRef.current.tables : player?.tables ?? 1;
    if (!isLiveData()) {
      const member = loadMembers().find((row) => row.id === memberId);
      return loadTablePresetSelection(memberId, member?.tablePresets ?? player?.tablePresets ?? [fallback], fallback);
    }
    try {
      const result = await loadMemberTablePresets(memberId, fallback);
      return loadTablePresetSelection(memberId, result.presets, fallback);
    } catch {
      return loadTablePresetSelection(memberId, [fallback], fallback);
    }
  };

  const selectTablePreset = (value: number, requestedMemberId?: string, presets: readonly number[] = tablePresets) => {
    const targetId = requestedMemberId || actingRef.current;
    if (!targetId || !presets.includes(value)) return;
    const player = players.find((row) => row.id === targetId);
    const base = targetId === selfId ? selfMarkRef.current : player ? markFromPlayer(player) : null;
    if (!base) return;
    actingRef.current = targetId;
    setActingId(targetId);
    saveTablePresetSelection(targetId, value);
    setTablePresets([...presets]);
    setTablePresetOwnerId(targetId);
    setMe({ ...base, tables: value });
    if (selfId && targetId === selfId) {
      setSelfMark((mark) => ({ ...mark, tables: value }));
    }
  };
  return { selfMark, selfMarkRef, me, actingId, actingRef, selfId, selfIdRef, accessRef, selectedPlayPairsRef, players, tablePresets, tablePresetOwnerId, actPlayers, applyActAs, loadTablePresetsForPlayer, selectTablePreset };
}
