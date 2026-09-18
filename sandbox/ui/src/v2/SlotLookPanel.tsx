import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_SLOT_LOOK,
  lookSnippet,
  loadSlotLook,
  saveSlotLook,
  type SlotLook,
} from "../schedule/slotLook";
import { R } from "./tokens";

type Props = { onClose: () => void };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="v2-look-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SlotLookPanel({ onClose }: Props) {
  const { t } = useTranslation();
  const [look, setLook] = useState<SlotLook>(() => loadSlotLook());
  const [copied, setCopied] = useState(false);
  const snippet = lookSnippet(look);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (part: Partial<SlotLook>) => {
    const next = { ...look, ...part };
    setLook(next);
    saveSlotLook(next);
  };

  return createPortal(
    <aside className="v2-look-dock" onClick={(event) => event.stopPropagation()}>
      <header className="v2-look-top">
        <div>
          <span>{t("schedule.slotLookKicker")}</span>
          <h2>{t("schedule.slotLookTitle")}</h2>
        </div>
        <button type="button" className="v2-ctrl w-8" aria-label="close" onClick={onClose}>
          <i className="fa-solid fa-xmark" />
        </button>
      </header>
      <p className="v2-look-lead">{t("schedule.slotLookHint")}</p>
      <div className="v2-look-grid">
        <Field label={t("schedule.slotFutureBg")}>
          <input type="color" value={look.futureBg} onChange={(event) => patch({ futureBg: event.target.value })} />
        </Field>
        <Field label={t("schedule.slotFutureBorder")}>
          <input type="color" value={look.futureBorder} onChange={(event) => patch({ futureBorder: event.target.value })} />
        </Field>
        <Field label={`${t("schedule.slotFutureBorderW")} · ${look.futureBorderW}px`}>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={look.futureBorderW}
            onChange={(event) => patch({ futureBorderW: Number(event.target.value) })}
          />
        </Field>
        <Field label={t("schedule.slotPastBg")}>
          <input type="color" value={look.pastBg} onChange={(event) => patch({ pastBg: event.target.value })} />
        </Field>
        <Field label={`${t("schedule.slotPastDim")} · ${Math.round(look.pastBright * 100)}%`}>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.02}
            value={look.pastBright}
            onChange={(event) => patch({ pastBright: Number(event.target.value) })}
          />
        </Field>
        <Field label={`${t("schedule.slotMarkDim")} · ${Math.round(look.markBright * 100)}%`}>
          <input
            type="range"
            min={0.35}
            max={1}
            step={0.02}
            value={look.markBright}
            onChange={(event) => patch({ markBright: Number(event.target.value) })}
          />
        </Field>
      </div>
      <div className="v2-look-code">
        <span>{t("schedule.slotLookCode")}</span>
        <pre>{snippet}</pre>
        <div className="flex gap-2">
          <button
            type="button"
            className="v2-ctrl px-3 text-[12px]"
            onClick={async () => {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? t("schedule.slotLookCopied") : t("schedule.slotLookCopy")}
          </button>
          <button
            type="button"
            className="v2-ctrl px-3 text-[12px]"
            onClick={() => {
              setLook({ ...DEFAULT_SLOT_LOOK });
              saveSlotLook({ ...DEFAULT_SLOT_LOOK });
            }}
          >
            {t("schedule.slotLookReset")}
          </button>
        </div>
      </div>
    </aside>,
    document.body,
  );
}
