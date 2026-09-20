import { useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import "./kit.css";

const RAMP = [
  { name: "950", hex: "#181818", color: "#181818" },
  { name: "900", hex: "#1B1B1B", color: "#1b1b1b" },
  { name: "800", hex: "#232323", color: "#232323" },
  { name: "700", hex: "#262626", color: "#262626" },
  { name: "600", hex: "#2C2C2C", color: "#2c2c2c" },
  { name: "500", hex: "#333333", color: "#333333" },
  { name: "400", hex: "#4F4F4F", color: "#4f4f4f" },
  { name: "300", hex: "#6C6C6C", color: "#6c6c6c" },
  { name: "200", hex: "#8C8C8C", color: "#8c8c8c", light: true },
  { name: "100", hex: "#C1BDBD", color: "#c1bdbd", light: true },
  { name: "50", hex: "#F5F5F5", color: "#f5f5f5", light: true },
];

const ACCENTS = [
  { name: "Yellow", hex: "#FFDE00", color: "#ffde00" },
  { name: "Hover", hex: "#FFD200", color: "#ffd200" },
  { name: "Mint", hex: "#00FF99", color: "#00ff99" },
  { name: "Orange", hex: "#FF652F", color: "#ff652f" },
  { name: "Brand", hex: "#E11D2E", color: "#e11d2e" },
  { name: "Ink", hex: "#191919", color: "#191919" },
];

const PAIRS = [
  { pair: "Ink / page", ratio: "13.9", note: "AA" },
  { pair: "Ink / card", ratio: "12.5", note: "AA" },
  { pair: "Ink / field", ratio: "16.3", note: "AA" },
  { pair: "Label / card", ratio: "4.8", note: "AA" },
  { pair: "Dark / yellow", ratio: "13.1", note: "AA" },
];

const TYPE: { key: string; size: string; sample: string; style: CSSProperties }[] = [
  { key: "Overline", size: "11 / 700", sample: "ПРОФИЛЬ", style: { fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--yellow)" } },
  { key: "Body", size: "13 / 400", sample: "Ярослав · Москва", style: { fontSize: 13, fontWeight: 400, color: "var(--ink)" } },
  { key: "Label", size: "11 / 500", sample: "Почта", style: { fontSize: 11, fontWeight: 500, color: "var(--mute)" } },
  { key: "Meta", size: "11 / 400", sample: "18.09.2026, 18:22", style: { fontSize: 11, fontWeight: 400, color: "var(--mute)" } },
  { key: "Mono", size: "12 / 600", sample: "YO · NL 50", style: { fontSize: 12, fontWeight: 600, fontFamily: "JetBrains Mono, ui-monospace, monospace", color: "var(--ink)" } },
];

const SPACE = [2, 4, 6, 8, 10, 12];

function Swatch({ name, hex, color }: { name: string; hex: string; color: string }) {
  return (
    <div className="rp-kit-swatch">
      <i style={{ background: color }} />
      <b>{name}</b>
      <span>{hex}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="rp-kit-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function V2UiKit() {
  const { t } = useTranslation();
  const [modal, setModal] = useState(false);

  return (
    <div className="rp-kit">
      <div className="rp-kit-col">
        <header className="rp-kit-hero">
          <h1>{t("kit.title")}</h1>
          <p>{t("kit.lead")}</p>
          <small>{t("kit.stack")}</small>
        </header>

        <section className="rp-kit-sec">
          <h2>{t("kit.ramp")}</h2>
          <p>{t("kit.rampLead")}</p>
          <div className="rp-kit-ramp">
            {RAMP.map((step) => (
              <span key={step.name} className={step.light ? "is-light" : "is-dark"} style={{ background: step.color }}>
                {step.name}
                <br />
                {step.hex}
              </span>
            ))}
          </div>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.surfaces")}</h2>
          <p>{t("kit.surfacesLead")}</p>
          <div className="rp-kit-stack">
            <small style={{ color: "var(--mute)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t("kit.page")}</small>
            <div className="rp-kit-stack-card">
              <div className="rp-kit-stack-head">{t("kit.glassCard")}</div>
              <div className="rp-kit-stack-body">
                <Field label={t("kit.name")}>
                  <Input defaultValue="Ярослав" />
                </Field>
                <span style={{ color: "var(--mute)", fontSize: 11 }}>{t("kit.glassField")}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.brand")}</h2>
          <p>{t("kit.brandLead")}</p>
          <div className="rp-kit-swatches">
            {ACCENTS.map((item) => (
              <Swatch key={item.hex} {...item} />
            ))}
          </div>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.contrast")}</h2>
          <p>{t("kit.contrastLead")}</p>
          <table className="rp-kit-pairs">
            <thead>
              <tr>
                <th>{t("kit.colPair")}</th>
                <th>{t("kit.colRatio")}</th>
                <th>{t("kit.colNorm")}</th>
              </tr>
            </thead>
            <tbody>
              {PAIRS.map((row) => (
                <tr key={row.pair}>
                  <td>{row.pair}</td>
                  <td>{row.ratio}:1</td>
                  <td className="rp-kit-pass">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.type")}</h2>
          <ul className="rp-kit-type">
            {TYPE.map((row) => (
              <li key={row.key}>
                <small>{row.key}</small>
                <span style={row.style}>{row.sample}</span>
                <small>{row.size}</small>
              </li>
            ))}
          </ul>
          <div className="rp-kit-boards">
            <div className="rp-kit-board is-page">
              <small>Page</small>
              <b>Ярослав</b>
              <span>Подпись 11px · AA</span>
            </div>
            <div className="rp-kit-board" style={{ background: "var(--lift)" }}>
              <small>Card</small>
              <b>Ярослав</b>
              <span>Подпись 11px · AA</span>
            </div>
            <div className="rp-kit-board is-field">
              <small>Input</small>
              <b>you@club.local</b>
              <span>Плейсхолдер · AA</span>
            </div>
          </div>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.space")}</h2>
          <div className="rp-kit-space">
            {SPACE.map((n) => (
              <b key={n}>
                {n}px
                <i style={{ width: n, height: 16 }} />
              </b>
            ))}
            <b>
              R8
              <i style={{ width: 32, height: 16, borderRadius: 8 }} />
            </b>
            <b>
              R12
              <i style={{ width: 40, height: 16, borderRadius: 12 }} />
            </b>
          </div>
          <p>{t("kit.spaceNote")}</p>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.buttons")}</h2>
          <div className="rp-kit-states">
            <div className="rp-kit-state">
              <span>{t("kit.rest")}</span>
              <Button size="compact">{t("kit.save")}</Button>
            </div>
            <div className="rp-kit-state">
              <span>{t("kit.hover")}</span>
              <Button size="compact" className="is-hover-demo">
                {t("kit.save")}
              </Button>
            </div>
            <div className="rp-kit-state">
              <span>{t("kit.secondary")}</span>
              <Button size="compact" variant="secondary">
                {t("kit.secondary")}
              </Button>
            </div>
            <div className="rp-kit-state">
              <span>{t("kit.outline")}</span>
              <Button size="compact" variant="outline">
                {t("kit.outline")}
              </Button>
            </div>
            <div className="rp-kit-state">
              <span>{t("kit.ghost")}</span>
              <Button size="compact" variant="ghost">
                {t("kit.ghost")}
              </Button>
            </div>
            <div className="rp-kit-state">
              <span>{t("kit.danger")}</span>
              <Button size="compact" variant="destructive">
                {t("kit.danger")}
              </Button>
            </div>
            <div className="rp-kit-state">
              <span>{t("kit.disabled")}</span>
              <Button size="compact" disabled>
                {t("kit.disabled")}
              </Button>
            </div>
            <div className="rp-kit-state">
              <span>{t("kit.save")}</span>
              <div className="rp-kit-row">
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

        <section className="rp-kit-sec">
          <h2>{t("kit.fields")}</h2>
          <p>{t("kit.fieldsLead")}</p>
          <div className="rp-kit-states">
            <Field label={t("kit.rest")}>
              <Input defaultValue="Ярослав" />
            </Field>
            <Field label={t("kit.hover")}>
              <Input className="is-hover-demo" defaultValue="Ярослав" />
            </Field>
            <Field label={t("kit.focus")}>
              <Input className="is-focus-demo" defaultValue="CET 16:35" />
            </Field>
            <Field label={t("kit.error")} hint={t("kit.error")}>
              <Input className="is-error-demo" defaultValue="you@" />
            </Field>
            <Field label={t("kit.placeholder")}>
              <Input placeholder="you@club.local" />
            </Field>
            <Field label={t("kit.disabled")}>
              <Input disabled defaultValue="you@club.local" />
            </Field>
            <Field label={t("kit.room")}>
              <NativeSelect defaultValue="winamax">
                <option value="winamax">Winamax</option>
                <option value="stars">PokerStars</option>
              </NativeSelect>
            </Field>
            <Field label={t("kit.note")}>
              <textarea className="w-full px-2 text-[13px]" placeholder={t("kit.placeholder")} />
            </Field>
          </div>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.chips")}</h2>
          <div className="rp-kit-row">
            {["25", "50", "100", "250", "500"].map((limit) => (
              <button key={limit} type="button" className={`rp-kit-chip${limit === "50" || limit === "100" ? " is-on" : ""}`}>
                NL {limit}
              </button>
            ))}
            <button type="button" className="rp-kit-chip is-on">
              Nitro
            </button>
            <button type="button" className="rp-kit-chip">
              Regular
            </button>
            <button type="button" className="rp-kit-tick is-on" aria-label={t("kit.ok")}>
              <i className="fa-solid fa-check text-[10px]" />
            </button>
            <button type="button" className="rp-kit-tick" aria-label={t("kit.cancel")} />
          </div>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.badges")}</h2>
          <div className="rp-kit-row">
            <Badge>Member</Badge>
            <Badge className="bg-[var(--discord)]/20 text-[#c9ccff]">Nitro</Badge>
            <Badge variant="info" className="!bg-[rgb(0,255,153,0.16)] !text-[#00ff99]">
              CET
            </Badge>
            <Badge variant="success">{t("kit.ok")}</Badge>
            <Badge variant="warning">{t("kit.warn")}</Badge>
            <Badge variant="danger">{t("kit.danger")}</Badge>
          </div>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.rails")}</h2>
          <p>{t("kit.railsLead")}</p>
          <div className="rp-kit-rails">
            <article className="rp-kit-rail is-staff">
              <b className="rp-kit-rail-tag">{t("kit.railStaff")}</b>
              <span>{t("kit.railStaffHint")}</span>
            </article>
            <article className="rp-kit-rail is-club">
              <b>{t("kit.railClub")}</b>
              <span>Red Party</span>
            </article>
            <article className="rp-kit-rail is-discord">
              <b>{t("kit.railDiscord")}</b>
              <span>@username</span>
            </article>
            <article className="rp-kit-rail is-mail">
              <b>{t("kit.railMail")}</b>
              <span>name@mail.com</span>
            </article>
          </div>
        </section>

        <section className="rp-kit-sec rp-kit-card-demo is-club">
          <div className="rp-kit-head">{t("kit.card")}</div>
          <div className="rp-kit-row">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-[11px] font-extrabold text-primary-foreground">YO</span>
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

        <section className="rp-kit-sec">
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
                  <button type="button" className="rp-kit-tick is-on">
                    <i className="fa-solid fa-check text-[10px]" />
                  </button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>USDT TRC-20</TableCell>
                <TableCell>T…sandbox</TableCell>
                <TableCell>
                  <button type="button" className="rp-kit-tick" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.feedback")}</h2>
          <div className="grid gap-2">
            <div className="rp-kit-alert is-ok">{t("kit.ok")} — слот записан</div>
            <div className="rp-kit-alert is-warn">{t("kit.warn")} — после 22:00 лимит 2 стола</div>
            <div className="rp-kit-alert is-bad">{t("kit.error")} — нет доступа к руму</div>
          </div>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.modal")}</h2>
          <p>{t("kit.modalBody")}</p>
          <div>
            <Button size="compact" onClick={() => setModal(true)}>
              {t("kit.openModal")}
            </Button>
          </div>
        </section>

        <section className="rp-kit-sec">
          <h2>{t("kit.rules")}</h2>
          <ul className="rp-kit-rules">
            <li>{t("kit.rule1")}</li>
            <li>{t("kit.rule2")}</li>
            <li>{t("kit.rule3")}</li>
          </ul>
        </section>
      </div>

      <Dialog
        open={modal}
        title={t("kit.modalTitle")}
        onClose={() => setModal(false)}
        footer={
          <>
            <Button size="compact" variant="ghost" onClick={() => setModal(false)}>
              {t("kit.cancel")}
            </Button>
            <Button size="compact" onClick={() => setModal(false)}>
              {t("kit.save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-2">
          <Field label={t("kit.room")}>
            <NativeSelect defaultValue="stars">
              <option value="winamax">Winamax</option>
              <option value="stars">PokerStars</option>
            </NativeSelect>
          </Field>
          <Field label={t("kit.name")}>
            <Input placeholder="YouNick" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
