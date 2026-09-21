import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompactMenu, CompactMenuGroup, CompactMenuItem } from "@/components/ui/compact-menu";
import { Dialog } from "@/components/ui/dialog";
import { CompactField } from "@/components/ui/field";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_SLOT_THEME,
  FILL_TOKEN_GROUPS,
  fillToCss,
  loadSlotTheme,
  normalizeHex,
  saveSlotTheme,
  SLOT_FILL_ROLES,
  SLOT_THEME_EVENT,
  type SlotFill,
  type SlotFillRole,
  type SlotTheme,
} from "../schedule/slotTheme";
import { SlotDayPreview } from "./SlotDayPreview";
import { PersonAvatar } from "./PersonAvatar";
import { ScheduleSlot } from "./ScheduleSlot";
import { V2SaveButton } from "./V2SaveButton";
import { ME } from "../schedule/marks";
import { type UiTheme } from "./theme";
import "./shadcn-kit.css";

const SURFACES: Record<"stackDark" | "stackLight" | "game", { name: string; hex: string; color: string }[]> = {
  stackDark: [
    { name: "background", hex: "#0E1118", color: "var(--background)" },
    { name: "card", hex: "#151A24", color: "var(--card)" },
    { name: "popover", hex: "#1A2030", color: "var(--popover)" },
    { name: "muted", hex: "#1E2330", color: "var(--muted)" },
    { name: "secondary", hex: "#1E2330", color: "var(--secondary)" },
    { name: "sidebar", hex: "#111620", color: "var(--sidebar)" },
  ],
  stackLight: [
    { name: "background", hex: "#EEF1F5", color: "var(--background)" },
    { name: "card", hex: "#FFFFFF", color: "var(--card)" },
    { name: "popover", hex: "#FFFFFF", color: "var(--popover)" },
    { name: "muted", hex: "#E8ECF1", color: "var(--muted)" },
    { name: "secondary", hex: "#E8ECF1", color: "var(--secondary)" },
    { name: "sidebar", hex: "#FFFFFF", color: "var(--sidebar)" },
  ],
  game: [
    { name: "background", hex: "#0B1024", color: "var(--background)" },
    { name: "card", hex: "#151C36", color: "var(--card)" },
    { name: "popover", hex: "#1A2344", color: "var(--popover)" },
    { name: "muted", hex: "#1E2748", color: "var(--muted)" },
    { name: "secondary", hex: "#1E2748", color: "var(--secondary)" },
    { name: "sidebar", hex: "#10172E", color: "var(--sidebar)" },
  ],
};

const ACCENTS: Record<"stackDark" | "stackLight" | "game", { name: string; hex: string; color: string }[]> = {
  stackDark: [
    { name: "primary", hex: "#22D3EE", color: "var(--primary)" },
    { name: "cyan", hex: "#22D3EE", color: "var(--ring)" },
    { name: "foreground", hex: "#F4F5F7", color: "var(--foreground)" },
    { name: "destructive", hex: "#F87171", color: "var(--destructive)" },
    { name: "success", hex: "#4ADE80", color: "var(--success)" },
    { name: "warning", hex: "#FBBF24", color: "var(--warning)" },
  ],
  stackLight: [
    { name: "primary", hex: "#0E7490", color: "var(--primary)" },
    { name: "cyan", hex: "#0891B2", color: "var(--ring)" },
    { name: "foreground", hex: "#111620", color: "var(--foreground)" },
    { name: "destructive", hex: "#DC2626", color: "var(--destructive)" },
    { name: "success", hex: "#15803D", color: "var(--success)" },
    { name: "warning", hex: "#B45309", color: "var(--warning)" },
  ],
  game: [
    { name: "primary", hex: "#2EE86A", color: "var(--primary)" },
    { name: "cyan", hex: "#1EC8FF", color: "var(--ring)" },
    { name: "blue", hex: "#4D7CFF", color: "var(--chart-1)" },
    { name: "purple", hex: "#8B6CFF", color: "var(--warning)" },
    { name: "destructive", hex: "#FF3B4A", color: "var(--destructive)" },
    { name: "ring", hex: "#1EC8FF", color: "var(--ring)" },
  ],
};

const CHARTS = [
  { name: "chart-1", color: "var(--chart-1)" },
  { name: "chart-2", color: "var(--chart-2)" },
  { name: "chart-3", color: "var(--chart-3)" },
  { name: "chart-4", color: "var(--chart-4)" },
  { name: "chart-5", color: "var(--chart-5)" },
];

const SURFACE_TOKENS = ["background", "card", "popover", "muted", "header", "sidebar", "slot", "slot-past", "day", "level", "lane"];
const ACCENT_TOKENS = ["foreground", "primary", "ring", "title", "border", "input", "destructive", "success", "warning"];

const MENU = [
  { id: "slots", labelKey: "kitStack.slots" },
  { id: "tokens", labelKey: "kitStack.tokens" },
  { id: "surfaces", labelKey: "kitStack.surfaces" },
  { id: "brand", labelKey: "kitStack.brand" },
  { id: "buttons", labelKey: "kit.buttons" },
  { id: "menus", labelKey: "kit.menus" },
  { id: "fields", labelKey: "kit.fields" },
  { id: "avatars", labelKey: "kit.avatars" },
  { id: "mark", labelKey: "kit.mark" },
  { id: "rails", labelKey: "kit.rails" },
];

function rgbToHex(input: string) {
  const parts = input.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return input;
  return `#${parts
    .slice(0, 3)
    .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function TokenSwatch({ name, tick }: { name: string; tick: number }) {
  const ref = useRef<HTMLElement>(null);
  const [hex, setHex] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setHex(rgbToHex(getComputedStyle(el).backgroundColor));
  }, [tick, name]);
  return (
    <div className="shadcn-kit-swatch">
      <i ref={ref} style={{ background: `var(--${name})` }} />
      <b>--{name}</b>
      <span>{hex || `var(--${name})`}</span>
    </div>
  );
}

function Swatch({ name, hex, color }: { name: string; hex?: string; color: string }) {
  return (
    <div className="shadcn-kit-swatch">
      <i style={{ background: color }} />
      <b>{name}</b>
      {hex ? <span>{hex}</span> : null}
    </div>
  );
}

const FILL_SWATCH: Record<SlotFillRole, string> = {
  hours: "var(--slot-hours, var(--day))",
  timeline: "var(--slot-hours-chip, var(--day))",
  day: "var(--slot-day, var(--card))",
  level: "var(--slot-level, var(--card))",
  date: "var(--slot-date, var(--day))",
  lane: "var(--slot-lane, var(--card))",
  cell: "var(--slot-cell, var(--background))",
  past: "var(--slot-past-cell, var(--slot-past))",
};

function FillRow({
  role,
  fill,
  tick,
  onChange,
}: {
  role: SlotFillRole;
  fill?: SlotFill;
  tick: number;
  onChange: (fill: SlotFill) => void;
}) {
  const { t } = useTranslation();
  const select = fill?.from === "hex" ? "hex" : fill?.from === "token" ? (fill.token ?? "auto") : "auto";
  const swatch = fillToCss(fill) ?? FILL_SWATCH[role];

  return (
    <div className="shadcn-kit-fill">
      <span>{t(`kitStack.fill.${role}`)}</span>
      <i style={{ background: swatch }} data-tick={tick} />
      <select
        className="v2-ctrl"
        aria-label={t(`kitStack.fill.${role}`)}
        value={select}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "auto") onChange({ from: "auto" });
          else if (next === "hex") onChange({ from: "hex", hex: fillToCss({ from: "hex", hex: fill?.hex }) ?? "#454954" });
          else onChange({ from: "token", token: next });
        }}
      >
        <option value="auto">{t("kitStack.fillAuto")}</option>
        {(Object.entries(FILL_TOKEN_GROUPS) as [string, readonly string[]][]).map(([group, tokens]) => (
          <optgroup key={group} label={t(`kitStack.fillGroup.${group}`)}>
            {tokens.map((token) => (
              <option key={token} value={token}>
                --{token}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="hex">HEX</option>
      </select>
      {fill?.from === "hex" ? (
        <>
          <input type="color" value={normalizeHex(fill.hex ?? "#454954")} onChange={(event) => onChange({ from: "hex", hex: event.target.value })} />
          <input
            className="v2-ctrl shadcn-kit-fill-hex"
            value={fill.hex ?? ""}
            spellCheck={false}
            maxLength={7}
            onChange={(event) => onChange({ from: "hex", hex: event.target.value })}
          />
        </>
      ) : null}
    </div>
  );
}

function Tune({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="shadcn-kit-tune">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <b>
        {value}
        {unit}
      </b>
    </label>
  );
}

function SlotPlayground({ theme, tick }: { theme: UiTheme; tick: number }) {
  const { t } = useTranslation();
  const [look, setLook] = useState<SlotTheme>(() => loadSlotTheme());

  const patch = (part: Partial<SlotTheme>) => {
    const next = { ...look, ...part };
    setLook(next);
    saveSlotTheme(next);
  };

  return (
    <section className="shadcn-kit-sec" id="slots">
      <h2>{t("kitStack.slots")}</h2>
      <p>{t("kitStack.slotsLead")}</p>
      <SlotDayPreview />
      <div className="shadcn-kit-fills">
        {SLOT_FILL_ROLES.map((role) => (
          <FillRow
            key={role}
            role={role}
            fill={look.fills?.[role]}
            tick={tick}
            onChange={(fill) => {
              const fills = { ...look.fills };
              if (fill.from === "auto") delete fills[role];
              else fills[role] = fill;
              patch({ fills });
            }}
          />
        ))}
      </div>
      <p className="shadcn-kit-note">{t("kitStack.fillHint")}</p>
      <div className="shadcn-kit-stack-demo" data-tick={tick}>
        <span>
          <i style={{ background: "var(--background)" }} />
          background
        </span>
        <span>
          <i style={{ background: "var(--card)" }} />
          card
        </span>
        <span>
          <i style={{ background: "var(--muted)" }} />
          muted
        </span>
        <span>
          <i style={{ background: "var(--slot)" }} />
          slot
        </span>
        <span>
          <i style={{ background: "var(--day)" }} />
          day
        </span>
        <span>
          <i style={{ background: "var(--level)" }} />
          level
        </span>
        <span>
          <i style={{ background: "var(--lane)" }} />
          lane
        </span>
        <span>
          <i style={{ background: "var(--slot-past)" }} />
          slot-past
        </span>
      </div>
      <p className="shadcn-kit-note">
        {t("kitStack.filmNow", { film: look.film, theme })}
      </p>
      <Tune label={t("kitStack.slotLift")} value={look.lift} unit="%" min={0} max={32} step={1} onChange={(lift) => patch({ lift })} />
      <Tune
        label={t("kitStack.dayLift")}
        value={look.dayLift}
        unit="%"
        min={18}
        max={48}
        step={1}
        onChange={(dayLift) => patch({ dayLift })}
      />
      <Tune
        label={t("kitStack.slotPastLift")}
        value={look.pastLift}
        unit="%"
        min={0}
        max={24}
        step={1}
        onChange={(pastLift) => patch({ pastLift })}
      />
      <Tune label={t("kitStack.slotFilm")} value={look.film} unit="%" min={30} max={80} step={5} onChange={(film) => patch({ film })} />
      <Tune
        label={t("kitStack.slotGray")}
        value={Math.round(look.gray * 100)}
        unit="%"
        min={0}
        max={100}
        step={5}
        onChange={(n) => patch({ gray: n / 100 })}
      />
      <button
        type="button"
        className="v2-ctrl px-3 text-[12px]"
        onClick={() => {
          const next = { ...DEFAULT_SLOT_THEME, fills: { ...DEFAULT_SLOT_THEME.fills } };
          setLook(next);
          saveSlotTheme(next);
        }}
      >
        {t("schedule.slotLookReset")}
      </button>
    </section>
  );
}

export function V2ShadcnKit({ tone = "stack", theme = "dark" }: { tone?: "stack" | "game"; theme?: UiTheme }) {
  const { t } = useTranslation();
  const [modal, setModal] = useState(false);
  const [panel, setPanel] = useState(false);
  const [pos, setPos] = useState({ x: 72, y: 96 });
  const [tick, setTick] = useState(0);
  const [dirty, setDirty] = useState(true);
  const copy = tone === "game" ? "kitGame" : "kitStack";
  const stackKey = theme === "light" ? "stackLight" : "stackDark";
  const surfaces = tone === "game" ? SURFACES.game : SURFACES[stackKey];
  const accents = tone === "game" ? ACCENTS.game : ACCENTS[stackKey];
  const appearance = tone === "game" || theme === "dark" ? "dark" : "is-light";

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    bump();
    window.addEventListener(SLOT_THEME_EVENT, bump);
    return () => window.removeEventListener(SLOT_THEME_EVENT, bump);
  }, [theme]);

  return (
    <div className={`shadcn-kit ${appearance}${tone === "game" ? " is-game" : ""}`}>
      <div className="shadcn-kit-col">
        <header className="shadcn-kit-hero">
          <h1>{t(`${copy}.title`)}</h1>
          <p>{t(`${copy}.lead`)}</p>
          <small>{t(`${copy}.stack`)}</small>
        </header>

        {tone === "stack" ? (
          <nav className="shadcn-kit-menu">
            {MENU.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(item.id)?.scrollIntoView({ block: "start" });
                }}
              >
                {t(item.labelKey)}
              </a>
            ))}
          </nav>
        ) : null}

        {tone === "stack" ? <SlotPlayground theme={theme} tick={tick} /> : null}

        {tone === "stack" ? (
          <section className="shadcn-kit-sec" id="tokens">
            <h2>{t("kitStack.tokens")}</h2>
            <p>{t("kitStack.tokensLead")}</p>
            <div className="shadcn-kit-swatches">
              {SURFACE_TOKENS.map((name) => (
                <TokenSwatch key={name} name={name} tick={tick} />
              ))}
            </div>
            <div className="shadcn-kit-swatches">
              {ACCENT_TOKENS.map((name) => (
                <TokenSwatch key={name} name={name} tick={tick} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="shadcn-kit-sec" id="surfaces">
          <h2>{t(`${copy}.surfaces`)}</h2>
          <p>{t(`${copy}.surfacesLead`)}</p>
          <div className="shadcn-kit-swatches">
            {surfaces.map((item) => (
              <Swatch key={item.name} {...item} />
            ))}
          </div>
        </section>

        <section className="shadcn-kit-sec" id="brand">
          <h2>{t(`${copy}.brand`)}</h2>
          <p>{t(`${copy}.brandLead`)}</p>
          <div className="shadcn-kit-swatches">
            {accents.map((item) => (
              <Swatch key={item.name} {...item} />
            ))}
          </div>
        </section>

        <section className="shadcn-kit-sec">
          <h2>{t(`${copy}.charts`)}</h2>
          <p>{t(`${copy}.chartsLead`)}</p>
          <div className="shadcn-kit-swatches">
            {CHARTS.map((item) => (
              <Swatch key={item.name} name={item.name} color={item.color} />
            ))}
          </div>
        </section>

        <section className="shadcn-kit-sec" id="buttons">
          <h2>{t("kit.buttons")}</h2>
          <p>{t(`${copy}.buttonsLead`)}</p>
          <div className="shadcn-kit-states">
            <div className="shadcn-kit-state">
              <span>default</span>
              <Button>{t("kit.save")}</Button>
            </div>
            <div className="shadcn-kit-state">
              <span>secondary</span>
              <Button variant="secondary">{t("kit.secondary")}</Button>
            </div>
            <div className="shadcn-kit-state">
              <span>outline</span>
              <Button variant="outline">{t("kit.outline")}</Button>
            </div>
            <div className="shadcn-kit-state">
              <span>ghost</span>
              <Button variant="ghost">{t("kit.ghost")}</Button>
            </div>
            <div className="shadcn-kit-state">
              <span>destructive</span>
              <Button variant="destructive">{t("kit.danger")}</Button>
            </div>
            <div className="shadcn-kit-state">
              <span>disabled</span>
              <Button disabled>{t("kit.disabled")}</Button>
            </div>
            <div className="shadcn-kit-state">
              <span>sm</span>
              <Button size="sm">{t("kit.save")}</Button>
            </div>
            <div className="shadcn-kit-state">
              <span>compact</span>
              <Button size="compact">{t("kit.save")}</Button>
            </div>
            <div className="shadcn-kit-state">
              <span>icon</span>
              <div className="shadcn-kit-row">
                <Button size="icon" variant="outline" aria-label={t("kit.save")}>
                  <i className="fa-solid fa-floppy-disk" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={t("cabinet.edit")}>
                  <i className="fa-solid fa-pen" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="shadcn-kit-sec" id="menus">
          <h2>{t("kit.menus")}</h2>
          <p>{t("kit.menusLead")}</p>
          <div className="shadcn-kit-row items-start">
            <CompactMenu className={`is-kit theme-${theme}`}>
              <CompactMenuGroup label={t("nav.club")}>
                <CompactMenuItem icon="fa-users" label={t("nav.adminPeople")} hint={t("nav.adminPeopleHint")} active />
                <CompactMenuItem icon="fa-sliders" label={t("nav.adminSchedule")} hint={t("nav.adminScheduleHint")} />
              </CompactMenuGroup>
              <CompactMenuGroup label={t("nav.root")} tone="root">
                <CompactMenuItem icon="fa-key" label={t("nav.root")} hint={t("nav.adminRootHint")} />
                <CompactMenuItem icon="fa-swatchbook" label={t("nav.uikit")} />
              </CompactMenuGroup>
            </CompactMenu>
          </div>
        </section>

        <section className="shadcn-kit-sec" id="fields">
          <h2>{t("kit.fields")}</h2>
          <p>{t(`${copy}.fieldsLead`)}</p>
          <div className="shadcn-kit-states">
            <CompactField label={t("kit.name")}>
              <Input defaultValue="Ярослав" />
            </CompactField>
            <CompactField label={t("kit.placeholder")}>
              <Input placeholder="you@club.local" />
            </CompactField>
            <CompactField label={t("kit.disabled")}>
              <Input disabled defaultValue="you@club.local" />
            </CompactField>
            <CompactField label={t("kit.error")} hint={t("kit.error")} error>
              <Input className="border-destructive" defaultValue="you@" />
            </CompactField>
            <CompactField label={t("kit.room")}>
              <NativeSelect className="w-full" defaultValue="winamax">
                <option value="winamax">Winamax</option>
                <option value="stars">PokerStars</option>
              </NativeSelect>
            </CompactField>
            <CompactField label={t("kit.note")}>
              <Textarea placeholder={t("kit.placeholder")} />
            </CompactField>
          </div>
        </section>

        <section className="shadcn-kit-sec" id="avatars">
          <h2>{t("kit.avatars")}</h2>
          <p>{t("kit.avatarsLead")}</p>
          <div className="shadcn-kit-row items-end">
            <div className="shadcn-kit-state">
              <span>sm</span>
              <PersonAvatar label="YO" size="sm" />
            </div>
            <div className="shadcn-kit-state">
              <span>md</span>
              <PersonAvatar label="YO" size="md" />
            </div>
            <div className="shadcn-kit-state">
              <span>lg</span>
              <PersonAvatar label="YO" size="lg" />
            </div>
          </div>
        </section>

        <section className="shadcn-kit-sec" id="mark">
          <h2>{t("kit.mark")}</h2>
          <p>{t("kit.markLead")}</p>
          <div className="shadcn-kit-row">
            <ScheduleSlot letters={ME.t} bg={ME.bg} fg={ME.fg} tables={ME.tables} />
            <ScheduleSlot />
            <ScheduleSlot past letters={ME.t} bg={ME.bg} fg={ME.fg} />
            <ScheduleSlot locked />
          </div>
        </section>

        <section className="shadcn-kit-sec">
          <h2>{t("kit.saveCtrl")}</h2>
          <p>{t("kit.saveCtrlLead")}</p>
          <div className="shadcn-kit-row">
            <V2SaveButton dirty={dirty} label={t("kit.save")} onClick={() => setDirty(false)} />
            <V2SaveButton icon dirty={dirty} label={t("kit.save")} onClick={() => setDirty(false)} />
            <Button size="sm" variant="ghost" onClick={() => setDirty(true)}>
              {t("kitBlocks.reset")}
            </Button>
          </div>
        </section>

        <section className="shadcn-kit-sec">
          <h2>{t("kit.badges")}</h2>
          <div className="shadcn-kit-row">
            <Badge>default</Badge>
            <Badge variant="info">info / primary</Badge>
            <Badge variant="success">{t("kit.ok")}</Badge>
            <Badge variant="warning">{t("kit.warn")}</Badge>
            <Badge variant="danger">{t("kit.danger")}</Badge>
            <Avatar>YO</Avatar>
          </div>
        </section>

        <section className="shadcn-kit-sec">
          <h2>Separator</h2>
          <p>{t(`${copy}.sepLead`)}</p>
          <div>
            <span className="text-xs">{t("kit.name")}</span>
            <Separator />
            <span className="text-muted-foreground text-xs">{t("kit.note")}</span>
          </div>
        </section>

        <section className="shadcn-kit-sec" id="rails">
          <h2>{t("kit.rails")}</h2>
          <p>{t("kit.railsLead")}</p>
          <div className="shadcn-kit-rails">
            <article className="shadcn-kit-rail is-staff">
              <b className="shadcn-kit-rail-tag">{t("kit.railStaff")}</b>
              <span>{t("kit.railStaffHint")}</span>
            </article>
            <article className="shadcn-kit-rail is-club">
              <b>{t("kit.railClub")}</b>
              <span>Red Party</span>
            </article>
            <article className="shadcn-kit-rail is-discord">
              <b>{t("kit.railDiscord")}</b>
              <span>@username</span>
            </article>
            <article className="shadcn-kit-rail is-mail">
              <b>{t("kit.railMail")}</b>
              <span>name@mail.com</span>
            </article>
          </div>
        </section>

        <section className="shadcn-kit-sec">
          <h2>{t("kit.card")}</h2>
          <p>{t(`${copy}.cardLead`)}</p>
          <div className="shadcn-kit-row">
            <Avatar className="h-9 w-9 rounded-lg text-[11px]">YO</Avatar>
            <div>
              <b className="block text-[13px]">YO</b>
              <span className="text-[11px] text-muted-foreground">Метка сетки</span>
            </div>
            <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
              <span className="text-[11px] text-muted-foreground">ID</span>
              <b>RP-415</b>
              <span className="text-[11px] text-muted-foreground">Пул</span>
              <b>80%</b>
            </div>
          </div>
        </section>

        <section className="shadcn-kit-sec">
          <h2>{t("kit.table")}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Сервис</TableHead>
                <TableHead>Реквизиты</TableHead>
                <TableHead>Основной</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Тинькофф</TableCell>
                <TableCell>2200 •••• 4412</TableCell>
                <TableCell>
                  <Badge variant="success">{t("kit.ok")}</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>USDT TRC-20</TableCell>
                <TableCell>T…sandbox</TableCell>
                <TableCell>
                  <Badge>{t("kit.secondary")}</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>

        <section className="shadcn-kit-sec">
          <h2>{t("kit.feedback")}</h2>
          <div className="grid gap-2">
            <div className="rounded-md border border-border bg-muted px-2.5 py-2 text-xs text-success">{t("kit.ok")} — слот записан</div>
            <div className="rounded-md border border-border bg-muted px-2.5 py-2 text-xs text-warning">{t("kit.warn")} — после 22:00 лимит 2 стола</div>
            <div className="rounded-md border border-border bg-muted px-2.5 py-2 text-xs text-destructive">{t("kit.error")} — нет доступа к руму</div>
          </div>
        </section>

        <section className="shadcn-kit-sec">
          <h2>{t("kit.modal")}</h2>
          <p>{t(`${copy}.modalLead`)}</p>
          <div className="shadcn-kit-row">
            <Button size="sm" onClick={() => setModal(true)}>
              Dialog
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPanel(true)}>
              FloatingPanel
            </Button>
          </div>
        </section>

        <section className="shadcn-kit-sec">
          <h2>{t("kit.rules")}</h2>
          <ul className="shadcn-kit-rules">
            <li>{t(`${copy}.rule1`)}</li>
            <li>{t(`${copy}.rule2`)}</li>
            <li>{t(`${copy}.rule3`)}</li>
          </ul>
        </section>
      </div>

      <Dialog
        open={modal}
        title={t("kit.modalTitle")}
        onClose={() => setModal(false)}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setModal(false)}>
              {t("kit.cancel")}
            </Button>
            <Button size="sm" onClick={() => setModal(false)}>
              {t("kit.save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-2">
          <CompactField label={t("kit.room")}>
            <NativeSelect defaultValue="stars" className="w-full">
              <option value="winamax">Winamax</option>
              <option value="stars">PokerStars</option>
            </NativeSelect>
          </CompactField>
          <CompactField label={t("kit.name")}>
            <Input placeholder="YouNick" />
          </CompactField>
        </div>
      </Dialog>

      {panel ? (
        <FloatingPanel title="FloatingPanel" x={pos.x} y={pos.y} onMove={(x, y) => setPos({ x, y })} onClose={() => setPanel(false)}>
          <p className="text-xs text-muted-foreground">{t(`${copy}.panelLead`)}</p>
          <div className="mt-2 grid gap-2">
            <CompactField label={t("kit.name")}>
              <Input defaultValue="Ярослав" />
            </CompactField>
            <Button size="sm">{t("kit.save")}</Button>
          </div>
        </FloatingPanel>
      ) : null}
    </div>
  );
}
