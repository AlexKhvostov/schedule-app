import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { usePlayerSuggestions } from "../state/usePlayerSuggestions";
import { playerToken, pickPlayer } from "../model/playerSuggestions";
import { playerNameKey } from "../../data/analytics/playerNames";
import styles from "./filters.module.css";
export function PlayersFilter({ value, onChange, demo, single = false }: { value: string; onChange: (text: string) => void; demo: boolean; single?: boolean }) {
  const { t } = useTranslation("analytics");
  const id = useId(), listId = `${id}-list`, hintId = `${id}-hint`;
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [cursor, setCursor] = useState(value.length), [open, setOpen] = useState(false), [activeIndex, setActiveIndex] = useState(0), [composing, setComposing] = useState(false);
  const token = playerToken(value, cursor, single);
  const suggestions = usePlayerSuggestions(token.query, open && !composing);
  const names = suggestions.names.filter(n => !token.excluded.includes(playerNameKey(n)));
  const expanded = open && suggestions.active;
  const selected = Math.min(activeIndex, names.length - 1);
  useEffect(() => { if (expanded) list.current?.children[selected]?.scrollIntoView({ block: "nearest" }); }, [selected, expanded]);
  const pick = (name: string) => {
    const next = pickPlayer(value, cursor, name, single); onChange(next.value); setCursor(next.cursor); setOpen(false);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(next.cursor, next.cursor); });
  };
  const keyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") { setOpen(false); e.preventDefault(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestions.active) { setOpen(true); return; }
      e.preventDefault(); if (names.length) setActiveIndex(i => (i + (e.key === "ArrowDown" ? 1 : -1) + names.length) % names.length);
    } else if (e.key === "Enter" && expanded) {
      e.preventDefault(); if (names[selected]) pick(names[selected]);
    } else if (e.key === "Tab") setOpen(false);
  };
  const common = {
    id, value, role: "combobox", autoComplete: "off", spellCheck: false,
    "aria-autocomplete": "list" as const, "aria-expanded": expanded, "aria-controls": expanded ? listId : undefined,
    "aria-activedescendant": expanded && names[selected] ? `${listId}-${selected}` : undefined, "aria-describedby": hintId,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setCursor(e.target.selectionStart ?? e.target.value.length); setActiveIndex(0); setOpen(true); onChange(e.target.value); },
    onSelect: (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => setCursor(e.currentTarget.selectionStart ?? value.length),
    onFocus: () => setOpen(true), onBlur: () => setOpen(false), onKeyDown: keyDown,
    onCompositionStart: () => setComposing(true), onCompositionEnd: () => setComposing(false),
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => { input.current = node; },
    placeholder: demo ? (single ? "Demo 01" : "Demo 01, Demo 02") : t(single ? "monthly.playerPlaceholder" : "filters.playersPlaceholder"),
  };
  return <div className={`${styles.field} ${styles.players}`}>
    <label htmlFor={id}>{t(single ? "monthly.player" : "filters.players")}</label>
    <div className={styles.playerSearch}>
      {single ? <input {...common} maxLength={100} /> : <textarea {...common} rows={2} />}
      {expanded && <div className={styles.suggestions}>
        <ul ref={list} id={listId} role="listbox" aria-label={t("filters.suggestions")}>
          {names.map((name, index) => <li key={name} id={`${listId}-${index}`} role="option" aria-selected={index === selected} onMouseDown={e => e.preventDefault()} onPointerMove={e => { if (e.movementX || e.movementY) setActiveIndex(index); }} onClick={() => pick(name)}>{name}</li>)}
        </ul>
        {!names.length && <p role="status">{t(suggestions.status === "loading" ? "filters.searching" : suggestions.status === "error" ? "filters.searchError" : "filters.noSuggestions")}</p>}
      </div>}
    </div>
    <small id={hintId}>{t("filters.searchHint")}</small>
  </div>;
}
