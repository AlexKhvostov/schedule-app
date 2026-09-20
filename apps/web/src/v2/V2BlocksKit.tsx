import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CompactField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CabinetLoginPanel, type LoginDraft } from "./CabinetLoginPanel";
import { PayMethodsPanel } from "./PayMethodsPanel";
import { PermanentPriority } from "./PermanentPriority";
import { PersonChip } from "./PersonAvatar";
import { SlotDayPreview } from "./SlotDayPreview";
import { WaitPanel } from "./V2Wait";
import "./shadcn-kit.css";
import "./blocks-kit.css";

const BLOCKS = [
  { id: "B01", titleKey: "kitBlocks.b01" },
  { id: "B02", titleKey: "kitBlocks.b02" },
  { id: "B03", titleKey: "kitBlocks.b03" },
  { id: "B04", titleKey: "kitBlocks.b04" },
  { id: "B05", titleKey: "kitBlocks.b05" },
  { id: "B06", titleKey: "kitBlocks.b06" },
  { id: "B07", titleKey: "kitBlocks.b07" },
  { id: "B08", titleKey: "kitBlocks.b08" },
];

const LOGIN_SEED: LoginDraft = { email: "", google: "", password: "" };

function Block({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section className="shadcn-kit-sec v2-blocks-sec" id={id}>
      <header className="v2-blocks-head">
        <b>{id}</b>
        <h2>{title}</h2>
      </header>
      <p>{lead}</p>
      <div className="v2-blocks-stage">{children}</div>
    </section>
  );
}

export function V2BlocksKit() {
  const { t } = useTranslation();
  const [login, setLogin] = useState<LoginDraft>(LOGIN_SEED);
  const [savedLogin, setSavedLogin] = useState<LoginDraft>(LOGIN_SEED);
  const [statusFilter, setStatusFilter] = useState("club");
  const [sort, setSort] = useState("access");
  const [showBots, setShowBots] = useState(false);

  return (
    <div className="shadcn-kit v2-blocks-kit">
      <div className="shadcn-kit-col">
        <header className="shadcn-kit-hero">
          <h1>{t("kitBlocks.title")}</h1>
          <p>{t("kitBlocks.lead")}</p>
        </header>
        <nav className="shadcn-kit-menu">
          {BLOCKS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {item.id} · {t(item.titleKey)}
            </a>
          ))}
        </nav>

        <Block id="B01" title={t("kitBlocks.b01")} lead={t("kitBlocks.b01Lead")}>
          <WaitPanel nick="lihach.ok" via="discord" onCabinet={() => undefined} />
        </Block>

        <Block id="B02" title={t("kitBlocks.b02")} lead={t("kitBlocks.b02Lead")}>
          <div className="v2-guild-empty">
            <i className="fa-solid fa-lock" />
            <h2>{t("kitBlocks.closedTitle")}</h2>
            <p className="v2-muted">{t("kitBlocks.closedLead")}</p>
          </div>
        </Block>

        <Block id="B03" title={t("kitBlocks.b03")} lead={t("kitBlocks.b03Lead")}>
          <PayMethodsPanel canEdit live={false} seedKey="blocks-pay" />
        </Block>

        <Block id="B04" title={t("kitBlocks.b04")} lead={t("kitBlocks.b04Lead")}>
          <CabinetLoginPanel
            discordOn
            discordHint="@lihach.ok"
            login={login}
            saved={savedLogin}
            canEdit
            onChange={setLogin}
            onSave={() => setSavedLogin({ ...login, password: "" })}
            onCancel={() => setLogin(savedLogin)}
            onBindGoogle={() => undefined}
            onUnbindGoogle={() => undefined}
          />
        </Block>

        <Block id="B05" title={t("kitBlocks.b05")} lead={t("kitBlocks.b05Lead")}>
          <PermanentPriority nitro={1} regular={3} />
        </Block>

        <Block id="B06" title={t("kitBlocks.b06")} lead={t("kitBlocks.b06Lead")}>
          <div className="v2-blocks-people">
            <PersonChip name="lihach.ok ( Леха )" sub="@lihach.ok" />
            <PersonChip name="Plastilin (5.8 BB)" sub="@plastilin · Plastilin" />
          </div>
        </Block>

        <Block id="B07" title={t("kitBlocks.b07")} lead={t("kitBlocks.b07Lead")}>
          <div className="v2-mem-filters">
            <CompactField label={t("admin.people.colPerson")}>
              <Input placeholder={t("admin.people.filterNickPh")} />
            </CompactField>
            <CompactField label={t("admin.people.colAccess")}>
              <NativeSelect className="w-full" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="club">{t("admin.people.accessFilter.club")} · 6</option>
                <option value="all">{t("admin.people.accessFilter.all")} · 280</option>
                <option value="member">{t("admin.people.accessFilter.member")} · 5</option>
              </NativeSelect>
            </CompactField>
            <CompactField label={t("admin.people.sortLabel")}>
              <NativeSelect className="w-full" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="access">{t("admin.people.sort.access")}</option>
                <option value="nick">{t("admin.people.sort.nick")}</option>
                <option value="color">{t("admin.people.sort.color")}</option>
              </NativeSelect>
            </CompactField>
            <div className="v2-mem-filter-extra">
              <label className="v2-mem-check">
                <input type="checkbox" checked={showBots} onChange={(event) => setShowBots(event.target.checked)} />
                <span>{t("admin.people.showBots")}</span>
              </label>
            </div>
          </div>
        </Block>

        <Block id="B08" title={t("kitBlocks.b08")} lead={t("kitBlocks.b08Lead")}>
          <SlotDayPreview />
        </Block>
      </div>
    </div>
  );
}
