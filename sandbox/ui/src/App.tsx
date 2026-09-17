import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CetClock } from "./components/CetClock";
import { setAppLanguage } from "./i18n";
import { AdminPage } from "./screens/AdminPage";
import { CabinetPage } from "./screens/CabinetPage";
import { SchedulePage } from "./screens/SchedulePage";
import { ScheduleHeatmapPage } from "./screens/ScheduleHeatmapPage";

function MenuIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block h-3.5 w-4" aria-hidden>
      <span
        className={cn(
          "absolute left-0 block h-0.5 w-4 rounded-full bg-current transition-transform",
          open ? "top-1.5 rotate-45" : "top-0",
        )}
      />
      <span
        className={cn(
          "absolute top-1.5 left-0 block h-0.5 w-4 rounded-full bg-current transition-opacity",
          open && "opacity-0",
        )}
      />
      <span
        className={cn(
          "absolute left-0 block h-0.5 w-4 rounded-full bg-current transition-transform",
          open ? "top-1.5 -rotate-45" : "top-3",
        )}
      />
    </span>
  );
}

export function App() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState("schedule");
  const [cursor, setCursor] = useState(() => new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const lang = i18n.language.startsWith("en") ? "en" : "ru";

  const nav = useMemo(
    () => [
      { key: "schedule", label: t("nav.schedule") },
      { key: "heatmap", label: t("nav.heatmap") },
      { key: "admin", label: t("nav.admin") },
    ],
    [t],
  );

  const soon = useMemo(
    () => [
      { key: "distance", label: t("nav.distance") },
      { key: "charts", label: t("nav.charts") },
      { key: "dashboards", label: t("nav.dashboards") },
    ],
    [t],
  );

  const go = (key: string) => {
    setPage(key);
    setMenuOpen(false);
  };

  return (
    <div className="flex h-full min-h-0 justify-center">
      <div className="relative flex h-full w-full min-w-0 max-w-[var(--app-max)] flex-col border-x border-border bg-card shadow-[0_0_40px_rgba(0,0,0,0.12)]">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-black/20 bg-header px-3 text-header-foreground">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-white hover:bg-white/10 hover:text-white"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MenuIcon open={menuOpen} />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-[18px] w-[18px] shrink-0 rounded-md bg-primary" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-semibold">{t("brand.name")}</div>
              <div className="truncate text-[10px] text-white/60">{t("brand.sandbox")}</div>
            </div>
          </div>
          <nav className="ml-1 hidden items-center gap-0.5 md:flex">
            {nav.map((item) => (
              <Button
                key={item.key}
                variant={page === item.key ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-2.5",
                  page !== item.key && "text-white hover:bg-white/10 hover:text-white",
                )}
                onClick={() => go(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </nav>
          <div className="mx-auto">
            <CetClock layout="inline" className="px-2.5 py-1" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-md border border-white/20 p-0.5">
              {(["ru", "en"] as const).map((code) => (
                <Button
                  key={code}
                  size="sm"
                  variant={lang === code ? "default" : "ghost"}
                  className={cn("h-6 px-2", lang !== code && "text-white hover:bg-white/10 hover:text-white")}
                  onClick={() => setAppLanguage(code)}
                >
                  {code.toUpperCase()}
                </Button>
              ))}
            </div>
            <button
              type="button"
              className="hidden items-center gap-1.5 text-xs text-white hover:opacity-90 sm:flex"
              onClick={() => go("cabinet")}
            >
              <Avatar>YO</Avatar>
              <span className="hidden text-left lg:inline">
                <span className="font-medium">{t("header.you")}</span>
                <span className="text-white/60"> · {t("header.roleStudent")}</span>
              </span>
            </button>
          </div>
        </header>

        {menuOpen && (
          <>
            <button
              type="button"
              className="absolute inset-0 top-14 z-30 bg-black/35"
              aria-label={t("nav.closeMenu")}
              onClick={() => setMenuOpen(false)}
            />
            <aside className="absolute top-14 bottom-0 left-0 z-40 flex w-[220px] flex-col border-r border-border bg-card p-2 shadow-xl">
              <div className="px-1 pb-2 md:hidden">
                <CetClock layout="stack" />
              </div>
              <nav className="flex flex-col gap-0.5">
                {nav.map((item) => (
                  <Button
                    key={item.key}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start text-sm",
                      page === item.key && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    )}
                    onClick={() => go(item.key)}
                  >
                    {item.label}
                  </Button>
                ))}
                <Separator className="my-1" />
                {soon.map((item) => (
                  <Button key={item.key} variant="ghost" disabled className="w-full justify-start text-muted-foreground">
                    {item.label}
                  </Button>
                ))}
              </nav>
            </aside>
          </>
        )}

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {page === "schedule" && <SchedulePage cursor={cursor} onCursorChange={setCursor} />}
          {page === "heatmap" && <ScheduleHeatmapPage cursor={cursor} onCursorChange={setCursor} />}
          {page === "cabinet" && <CabinetPage />}
          {page === "admin" && <AdminPage />}
        </main>
      </div>
    </div>
  );
}
