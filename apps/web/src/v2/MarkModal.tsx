import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { bestInk, cssToHex, parseMarkHex } from "../schedule/markCatalog";
import { lettersBlocked, type ClubMember } from "../schedule/members";
import { ScheduleSlot, ScheduleSlotStrip } from "./ScheduleSlot";
import { loadTheme } from "./theme";

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
        <label className="v2-mem-picker" title={t("admin.people.pickColor")}>
          <input type="color" value={hex} onChange={(event) => onChange(event.target.value)} />
        </label>
        <input
          className={`v2-ctrl v2-mono v2-mark-hex px-2${ok ? "" : " is-bad"}`}
          value={draft}
          spellCheck={false}
          placeholder="#ffd966"
          title={ok ? t("admin.people.hexHint") : t("admin.people.hexErr")}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const parsed = parseMarkHex(next);
            if (parsed) onChange(parsed);
          }}
        />
      </div>
      {!ok ? <small className="v2-mark-err">{t("admin.people.hexErr")}</small> : null}
    </div>
  );
}

export function MarkModal({
  member,
  list,
  showTables = false,
  onClose,
  onSave,
}: {
  member: ClubMember;
  list: ClubMember[];
  showTables?: boolean;
  onClose: () => void;
  onSave: (mark: ClubMember["mark"]) => void;
}) {
  const { t } = useTranslation();
  const [bg, setBg] = useState(cssToHex(member.mark.bg || "#76a5af"));
  const [fg, setFg] = useState(cssToHex(member.mark.fg || bestInk(member.mark.bg || "#76a5af")));
  const [letters, setLetters] = useState(member.mark.t);
  const bgOk = Boolean(parseMarkHex(bg));
  const fgOk = Boolean(parseMarkHex(fg));
  const tagErr = Boolean(letters.trim()) && lettersBlocked(list, letters, member.id);
  const canApply = (!letters.trim() || (bgOk && fgOk)) && !tagErr;

  return createPortal(
    <div className={`v2-mem-overlay theme-${loadTheme()}`} onClick={onClose}>
      <div className="v2-mem-modal is-mark" onClick={(event) => event.stopPropagation()}>
        <div>
          <span className="v2-admin-kicker block text-[11px] tracking-[0.16em] uppercase">{t("admin.people.markEdit")}</span>
          <h3 className="mt-1 text-[16px] font-semibold">{member.discord}</h3>
        </div>
        <p className="v2-muted mt-2 text-[12px] leading-snug">{t("admin.people.markHint")}</p>
        <div className="v2-mark-fields">
          <div className="v2-mem-step">
            <span>{t("admin.marks.slot")}</span>
            <span className="v2-opt is-kit v2-mark-sample">
              <ScheduleSlot letters={letters} bg={bg} fg={fg} tables={member.tables ?? 12} showTables={showTables} />
            </span>
          </div>
          <div className="v2-mem-step v2-mark-letters">
            <span>{t("admin.marks.tag")}</span>
            <input
              className="v2-ctrl v2-mono v2-mark-tag px-2"
              maxLength={3}
              value={letters}
              onChange={(event) => setLetters(event.target.value.trim().slice(0, 3).toUpperCase())}
            />
          </div>
          <ColorWell label={t("admin.people.colMark")} value={bg} onChange={setBg} />
          <ColorWell label={t("admin.marks.ink")} value={fg} onChange={setFg} />
        </div>
        {tagErr && <small className="v2-mark-err">{t("admin.marks.dupTag")}</small>}
        <div className="v2-mem-demo">
          <span>{t("admin.marks.preview")}</span>
          <ScheduleSlotStrip
            letters={letters}
            bg={bg}
            fg={fg}
            pastLabel={t("admin.marks.previewPast")}
            futureLabel={t("admin.marks.previewFuture")}
            lead={t("admin.marks.previewLead")}
            showTables={showTables}
          />
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
