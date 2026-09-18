import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS } from "../schedule/capacity";
import { MARK_PREVIEW_TABLES, bestInk, cssToHex, parseMarkHex } from "../schedule/markCatalog";
import {
  MEMBER_STATUSES,
  hueOfBg,
  lettersBlocked,
  loadMembers,
  memberBg,
  memberFg,
  saveMembers,
  vipTaken,
  type ClubMember,
  type MemberStatus,
} from "../schedule/members";
import { V2SaveButton } from "./V2SaveButton";
import { createInvite, inviteForMember } from "./invites";

function NickFilter({
  value,
  onChange,
  people,
}: {
  value: string;
  onChange: (value: string) => void;
  people: ClubMember[];
}) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLLabelElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const hits = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? people.filter((row) => [row.discord, row.room, row.name, row.id].join(" ").toLowerCase().includes(q))
      : people;
    return list.slice(0, 8);
  }, [people, value]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <label className="v2-mem-field" ref={boxRef}>
      <span>{t("admin.people.filterNick")}</span>
      <input
        className="v2-ctrl w-full px-3"
        value={value}
        placeholder={t("admin.people.filterNickPh")}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHi((i) => Math.min(hits.length - 1, i + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHi((i) => Math.max(0, i - 1));
          } else if (event.key === "Enter" && open && hits[hi]) {
            event.preventDefault();
            onChange(hits[hi].discord);
            setOpen(false);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && hits.length > 0 && (
        <ul className="v2-mem-suggest">
          {hits.map((row, index) => (
            <li key={row.id}>
              <button
                type="button"
                className={index === hi ? "is-on" : undefined}
                onMouseEnter={() => setHi(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(row.discord);
                  setOpen(false);
                }}
              >
                <b>{row.discord}</b>
                <small>
                  {row.room} · {row.name}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
type SortKey = "color" | "discord" | "name" | "vip";
type StatusFilter = MemberStatus | "all";

function SlotPreview({ bg, fg, letters, tables }: { bg: string; fg: string; letters: string; tables?: boolean }) {
  return (
    <span className="v2-mark-preview">
      <span className="v2-opt-cell is-on v2-mark-slot" style={{ ["--mark" as string]: bg, ["--mark-ink" as string]: fg }}>
        <span className={`v2-opt-face${tables ? " has-n" : ""}`}>
          <b>{letters || "PL"}</b>
          {tables && <i>{MARK_PREVIEW_TABLES}</i>}
        </span>
      </span>
    </span>
  );
}

function ColorWell({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const hex = cssToHex(value);
  const [draft, setDraft] = useState(hex);
  const ok = Boolean(parseMarkHex(draft));

  useEffect(() => {
    setDraft(hex);
  }, [hex]);

  return (
    <div className="v2-mem-step">
      <span>{label}</span>
      <div className="v2-mem-hex-row">
        <label className="v2-mem-picker is-lg" title={t("admin.people.pickColor")}>
          <input type="color" value={hex} onChange={(event) => onChange(event.target.value)} />
        </label>
        <input
          className={`v2-ctrl v2-mono w-28 px-2${ok ? "" : " is-bad"}`}
          value={draft}
          spellCheck={false}
          placeholder="#ffd966"
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const parsed = parseMarkHex(next);
            if (parsed) onChange(parsed);
          }}
        />
        <small className={ok ? "v2-muted" : "text-[var(--destructive)]"}>{ok ? t("admin.people.hexHint") : t("admin.people.hexErr")}</small>
      </div>
    </div>
  );
}

function MarkModal({
  member,
  list,
  onClose,
  onSave,
}: {
  member: ClubMember;
  list: ClubMember[];
  onClose: () => void;
  onSave: (mark: ClubMember["mark"]) => void;
}) {
  const { t } = useTranslation();
  const [bg, setBg] = useState(cssToHex(memberBg(member)));
  const [fg, setFg] = useState(cssToHex(member.mark.fg || memberFg(member) || bestInk(memberBg(member))));
  const [letters, setLetters] = useState(member.mark.t);
  const bgOk = Boolean(parseMarkHex(bg));
  const fgOk = Boolean(parseMarkHex(fg));
  const tagErr = Boolean(letters.trim()) && lettersBlocked(list, letters, member.id);
  const canApply = Boolean(letters.trim()) && bgOk && fgOk && !tagErr;

  return createPortal(
    <div className="v2-mem-overlay" onClick={onClose}>
      <div className="v2-mem-modal is-mark" onClick={(event) => event.stopPropagation()}>
        <div>
          <span className="v2-admin-kicker block text-[11px] tracking-[0.16em] uppercase">{t("admin.people.markEdit")}</span>
          <h3 className="mt-1 text-[18px] font-semibold">
            {member.discord} <span className="v2-muted">({member.room})</span>
          </h3>
        </div>
        <p className="v2-muted mt-3 text-[12px] leading-relaxed">{t("admin.people.markHint")}</p>

        <ColorWell label={t("admin.people.colMark")} value={bg} onChange={setBg} />
        <ColorWell label={t("admin.marks.ink")} value={fg} onChange={setFg} />

        <div className="v2-mem-step">
          <span>{t("admin.marks.tag")}</span>
          <input
            className="v2-ctrl v2-mono w-24 px-2"
            maxLength={3}
            value={letters}
            placeholder="PL"
            onChange={(event) => setLetters(event.target.value.trim().slice(0, 3).toUpperCase())}
          />
        </div>

        {tagErr && <small className="v2-mark-err">{t("admin.marks.dupTag")}</small>}

        <div className="v2-mem-demo">
          <span>{t("admin.marks.preview")}</span>
          <div className="v2-mem-demo-bed">
            <span className="v2-opt-cell is-on v2-mem-demo-slot" style={{ ["--mark" as string]: bg, ["--mark-ink" as string]: fg }}>
              <span className="v2-opt-face has-n">
                <b>{letters || "PL"}</b>
                <i>{MARK_PREVIEW_TABLES}</i>
              </span>
            </span>
          </div>
        </div>

        <div className="v2-mem-apply">
          <button type="button" className="v2-ctrl px-4" onClick={onClose}>
            {t("admin.people.cancel")}
          </button>
          <button
            type="button"
            className={`v2-ctrl px-5 font-semibold${canApply ? " is-on" : ""}`}
            disabled={!canApply}
            onClick={() => {
              if (!canApply) return;
              onSave({ colorId: -1, bg: cssToHex(bg), fg: cssToHex(fg), t: letters.trim().toUpperCase() });
            }}
          >
            {t("admin.capacity.apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProfileSheet({
  member,
  onClose,
  onChange,
}: {
  member: ClubMember;
  onClose: () => void;
  onChange: (next: ClubMember) => void;
}) {
  const { t } = useTranslation();
  const patch = (part: Partial<ClubMember>) => onChange({ ...member, ...part });
  return createPortal(
    <div className="v2-mem-overlay is-sheet" onClick={onClose}>
      <aside className="v2-mem-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="v2-admin-kicker block text-[11px] tracking-[0.16em] uppercase">{member.id}</span>
            <h3 className="mt-1 text-[20px] font-semibold">{member.name || member.discord}</h3>
          </div>
          <button type="button" className="v2-ctrl px-3" onClick={onClose}>
            {t("admin.people.close")}
          </button>
        </div>
        <dl className="v2-mem-fields">
          <label>
            <span>{t("admin.people.discord")}</span>
            <input className="v2-ctrl w-full px-2" value={member.discord} onChange={(event) => patch({ discord: event.target.value })} />
          </label>
          <label>
            <span>{t("admin.people.discordId")}</span>
            <input className="v2-ctrl w-full px-2" value={member.discordId} onChange={(event) => patch({ discordId: event.target.value })} />
          </label>
          <label>
            <span>{t("admin.people.room")}</span>
            <input className="v2-ctrl w-full px-2" value={member.room} onChange={(event) => patch({ room: event.target.value })} />
          </label>
          <label>
            <span>{t("admin.people.name")}</span>
            <input className="v2-ctrl w-full px-2" value={member.name} onChange={(event) => patch({ name: event.target.value })} />
          </label>
          <label>
            <span>{t("admin.people.email")}</span>
            <input className="v2-ctrl w-full px-2" value={member.email} onChange={(event) => patch({ email: event.target.value })} />
          </label>
        </dl>
        <div className="mt-4">
          <div className="v2-admin-kicker mb-2 text-[10px] tracking-[0.14em] uppercase">{t("admin.people.limits")}</div>
          <div className="flex flex-wrap gap-2">
            {LIMIT_OPTIONS.map((limit) => {
              const on = member.limits.includes(limit);
              return (
                <button
                  key={limit}
                  type="button"
                  className={`v2-ctrl px-3${on ? " is-on" : ""}`}
                  onClick={() =>
                    patch({
                      limits: on ? member.limits.filter((item) => item !== limit) : [...member.limits, limit],
                    })
                  }
                >
                  NL {limit}
                </button>
              );
            })}
          </div>
        </div>
        <p className="v2-muted mt-5 text-[12px] leading-relaxed">{t("admin.people.profileSoon")}</p>
      </aside>
    </div>,
    document.body,
  );
}

export function MembersAdmin() {
  const { t } = useTranslation();
  const [list, setList] = useState<ClubMember[]>(() => (typeof window === "undefined" ? [] : loadMembers()));
  const [savedList, setSavedList] = useState<ClubMember[]>(() => list.map((row) => ({ ...row, mark: { ...row.mark }, limits: [...row.limits] })));
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDiscord, setInviteDiscord] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sort, setSort] = useState<SortKey>("color");
  const [nickQ, setNickQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [accessFilter, setAccessFilter] = useState<"all" | "in" | "out">("all");
  const [limitFilter, setLimitFilter] = useState("all");
  const [vipErr, setVipErr] = useState<string | null>(null);
  const [markFor, setMarkFor] = useState<string | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);

  const dirty = JSON.stringify(list) !== JSON.stringify(savedList);

  const update = (next: ClubMember[]) => {
    setList(next);
    setSaved(false);
  };

  const save = () => {
    if (!dirty) return;
    saveMembers(list);
    setSavedList(list.map((row) => ({ ...row, mark: { ...row.mark }, limits: [...row.limits] })));
    setSaved(true);
  };

  const persistList = (next: ClubMember[]) => {
    setList(next);
    saveMembers(next);
    setSavedList(next.map((row) => ({ ...row, mark: { ...row.mark }, limits: [...row.limits] })));
    setSaved(true);
  };

  const addInvite = () => {
    if (!inviteEmail.trim() && !inviteDiscord.trim()) return;
    const made = createInvite({ email: inviteEmail, discord: inviteDiscord });
    persistList(loadMembers());
    setInviteUrl(made.url);
    setInviteCopied(false);
    setInviteEmail("");
    setInviteDiscord("");
  };

  const setAccess = (id: string, appAccess: boolean) => {
    persistList(list.map((row) => (row.id === id ? { ...row, appAccess, status: appAccess ? "active" : row.status } : row)));
  };

  const linkFor = (row: ClubMember) => {
    const made = inviteForMember(row);
    setInviteUrl(made.url);
    setInviteCopied(false);
  };

  const patchMember = (id: string, part: Partial<ClubMember> | ((row: ClubMember) => ClubMember)) => {
    update(list.map((row) => (row.id !== id ? row : typeof part === "function" ? part(row) : { ...row, ...part })));
  };

  const setVip = (id: string, raw: string) => {
    const text = raw.trim();
    if (!text) {
      setVipErr(null);
      patchMember(id, { vip: 0 });
      return;
    }
    const next = Number(text);
    if (!Number.isInteger(next) || next < 1) return;
    if (vipTaken(list, next, id)) {
      setVipErr(id);
      return;
    }
    setVipErr(null);
    patchMember(id, { vip: next });
  };

  const rows = useMemo(() => {
    const q = nickQ.trim().toLowerCase();
    const copy = list.filter((row) => {
      if (accessFilter === "in" && !row.appAccess) return false;
      if (accessFilter === "out" && row.appAccess) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (limitFilter !== "all" && !row.limits.includes(limitFilter)) return false;
      if (!q) return true;
      return [row.discord, row.room, row.name, row.id].join(" ").toLowerCase().includes(q);
    });
    copy.sort((a, b) => {
      if (sort === "color") {
        const hue = hueOfBg(memberBg(a)) - hueOfBg(memberBg(b));
        return hue || a.mark.colorId - b.mark.colorId;
      }
      if (sort === "vip") return (a.vip || 999) - (b.vip || 999) || a.distance - b.distance;
      if (sort === "name") return a.name.localeCompare(b.name, "ru");
      return a.discord.localeCompare(b.discord);
    });
    return copy;
  }, [list, sort, nickQ, statusFilter, limitFilter, accessFilter]);

  const editing = list.find((row) => row.id === markFor) ?? null;
  const profile = list.find((row) => row.id === profileFor) ?? null;

  return (
    <div className="px-5 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="v2-muted max-w-3xl text-[13px] leading-relaxed">{t("admin.people.lead")}</p>
        <V2SaveButton dirty={dirty} saved={saved} label={t("admin.save")} doneLabel={t("admin.saved")} onClick={save} />
      </div>
      <section className="v2-block v2-invite mb-4">
        <h3>{t("admin.people.guildTitle")}</h3>
        <p className="v2-muted">{t("admin.people.guildLead")}</p>
        <div className="v2-access-tabs">
          {(["all", "out", "in"] as const).map((key) => (
            <button key={key} type="button" className={`v2-ctrl px-3${accessFilter === key ? " is-on" : ""}`} onClick={() => setAccessFilter(key)}>
              {t(`admin.people.accessFilter.${key}`)}
              <em>
                {key === "all" ? list.length : key === "in" ? list.filter((row) => row.appAccess).length : list.filter((row) => !row.appAccess).length}
              </em>
            </button>
          ))}
        </div>
      </section>
      <section className="v2-block v2-invite mb-4">
        <h3>{t("admin.people.inviteTitle")}</h3>
        <p className="v2-muted">{t("admin.people.inviteLead")}</p>
        <div className="v2-invite-row">
          <label className="v2-mem-field">
            <span>{t("admin.people.email")}</span>
            <input className="v2-ctrl w-full px-3" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
          </label>
          <label className="v2-mem-field">
            <span>{t("admin.people.discord")}</span>
            <input className="v2-ctrl w-full px-3" value={inviteDiscord} onChange={(event) => setInviteDiscord(event.target.value)} />
          </label>
          <button type="button" className="v2-ctrl px-4" onClick={addInvite}>
            {t("admin.people.inviteGo")}
          </button>
        </div>
        {inviteUrl ? (
          <div className="v2-invite-link">
            <code>{inviteUrl}</code>
            <button
              type="button"
              className="v2-ctrl px-3"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl);
                setInviteCopied(true);
              }}
            >
              {inviteCopied ? t("admin.people.inviteCopied") : t("admin.people.inviteCopy")}
            </button>
          </div>
        ) : null}
      </section>
      <div className="v2-mem-filters">
        <NickFilter value={nickQ} onChange={setNickQ} people={list} />
        <label className="v2-mem-field">
          <span>{t("admin.colStatus")}</span>
          <select className="v2-ctrl w-full px-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">{t("admin.people.statusAll")}</option>
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`admin.people.status.${status}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="v2-mem-field">
          <span>{t("admin.people.limits")}</span>
          <select className="v2-ctrl w-full px-2" value={limitFilter} onChange={(event) => setLimitFilter(event.target.value)}>
            <option value="all">{t("admin.people.limitAll")}</option>
            {LIMIT_OPTIONS.map((limit) => (
              <option key={limit} value={limit}>
                NL {limit}
              </option>
            ))}
          </select>
        </label>
        <label className="v2-mem-field">
          <span>{t("admin.people.sortLabel")}</span>
          <select className="v2-ctrl w-full px-2" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            {(["color", "discord", "name", "vip"] as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {t(`admin.people.sort.${key}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-auto rounded-md" style={{ border: "1px solid var(--border)" }}>
        <table className="v2-mem-table">
          <thead>
            <tr>
              <th>{t("admin.people.colMark")}</th>
              <th>{t("admin.people.discord")}</th>
              <th>{t("admin.people.room")}</th>
              <th>{t("admin.people.name")}</th>
              <th>{t("admin.people.limits")}</th>
              <th>{t("admin.people.colAccess")}</th>
              <th>{t("admin.colStatus")}</th>
              <th>{t("admin.people.vip")}</th>
              <th>{t("admin.people.distance")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={!row.appAccess || row.status !== "active" ? "is-dim" : undefined}>
                <td>
                  <button type="button" className="v2-mem-mark-btn" title={t("admin.people.markEdit")} onClick={() => setMarkFor(row.id)}>
                    <SlotPreview bg={memberBg(row)} fg={memberFg(row)} letters={row.mark.t} tables />
                  </button>
                </td>
                <td>
                  <button type="button" className="text-left" onClick={() => setProfileFor(row.id)}>
                    <span className="block font-medium">{row.discord}</span>
                    <span className="v2-muted block text-[11px]">{row.id}</span>
                  </button>
                </td>
                <td className="v2-mono text-[12px]">{row.room}</td>
                <td>{row.name}</td>
                <td>
                  <div className="v2-mem-limits">
                    {row.limits.map((limit) => (
                      <span key={limit}>NL {limit}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={`v2-access-pill${row.appAccess ? " is-on" : ""}`}>
                    {row.appAccess ? t("admin.people.accessOn") : t("admin.people.accessOff")}
                  </span>
                </td>
                <td>
                  <select
                    className="v2-ctrl px-2 py-1 text-[12px]"
                    value={row.status}
                    onChange={(event) => patchMember(row.id, { status: event.target.value as MemberStatus })}
                  >
                    {MEMBER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`admin.people.status.${status}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className={`v2-ctrl v2-mono w-14 px-2 py-1 text-[12px]${vipErr === row.id ? " is-bad" : ""}`}
                    inputMode="numeric"
                    placeholder="—"
                    value={row.vip || ""}
                    onChange={(event) => setVip(row.id, event.target.value)}
                    title={t("admin.people.vipHint")}
                  />
                  {vipErr === row.id && <small className="v2-mark-err">{t("admin.people.vipDup")}</small>}
                </td>
                <td className="v2-mono v2-muted text-[12px]" title={t("admin.people.distanceHint")}>
                  {row.distance}
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {row.appAccess ? (
                      <button type="button" className="v2-ctrl px-3 text-[12px]" onClick={() => setAccess(row.id, false)}>
                        {t("admin.people.accessRevoke")}
                      </button>
                    ) : (
                      <button type="button" className="v2-ctrl px-3 text-[12px]" onClick={() => setAccess(row.id, true)}>
                        {t("admin.people.accessGrant")}
                      </button>
                    )}
                    <button type="button" className="v2-ctrl px-3 text-[12px]" onClick={() => linkFor(row)}>
                      {t("admin.people.inviteRow")}
                    </button>
                    <button type="button" className="v2-ctrl px-3 text-[12px]" onClick={() => setProfileFor(row.id)}>
                      {t("admin.people.card")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={10} className="v2-muted py-8 text-center text-[13px]">
                  {t("admin.people.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <MarkModal
          member={editing}
          list={list}
          onClose={() => setMarkFor(null)}
          onSave={(mark) => {
            patchMember(editing.id, { mark });
            setMarkFor(null);
          }}
        />
      )}
      {profile && (
        <ProfileSheet
          member={profile}
          onClose={() => setProfileFor(null)}
          onChange={(next) => patchMember(next.id, next)}
        />
      )}
    </div>
  );
}
