# Структура репозитория

Локальная доработка4 ноября2026: `apps/web/src/data/roster.ts` — единая условная загрузка окна игроков и ограниченный кэш экрана; `data/rosterRefresh.ts` — объединение сигналов обновления; `schedule/rosterPriorities.ts` — компактный тип и Demo-проекция. Серверный контракт — `supabase/migrations/20261104164056_compact_month_roster.sql`, проверки — `supabase/tests/month_roster.sql` и сценарий в `apps/web/e2e/schedule-loading.live.ts`. [Архитектура](code-architecture.md).

```
schedule-app/
  README.md
  docs/                      продукт, сущности, стек, UX сетки, схема БД
  supabase/                  миграции и seed Postgres
  apps/web/                  боевой Next.js
  sandbox/ui/                историческая UI-лаборатория; не источник бизнес-логики
  sandbox/legacy-html/       архив HTML-набросков, не используем
  references/                старые таблицы (в git только README)
```

GitHub: ветка `main`. Папка `references/` с выгрузками таблиц **не публикуется** (см. `.gitignore`).

Новые функции интерфейса, исправления и рефакторинг сайта делаем непосредственно в `apps/web`. Предметная логика живёт в `src/schedule`, ввод-вывод — в `src/data`, React-компоненты — в `src/v2` и `src/components`. Подробные границы: [code-architecture.md](code-architecture.md).

Общий внешний API расположен отдельно в [`supabase/functions/external-api`](../supabase/functions/external-api/README.md): `core` — общие HTTP/ключи/RPC, `v1/schedule` — первый ресурс, `tests`/`integration` — проверки, `tools` — локальные утилиты. Миграции и SQL-проверки остаются в стандартных `supabase/migrations` и `supabase/tests`; `external_api_private` — закрытая схема ключей и временных снимков выгрузки в той же базе. `BOT-CONNECTION.md` — инструкция для внешнего разработчика без секретов. Код API не входит в браузерный пакет Next.js.

Внутри `apps/web/src/v2` расписание разделено на два тематических каталога: `schedule/` содержит hooks сценариев экрана и панели, а `optField/` — отрисовку поля, подсказку и DOM-жесты. Входные компоненты `V2Schedule.tsx` и `OptField.tsx` остаются на прежних путях. `src/v2/schedule` отвечает за React-состояние экрана; чистая предметная логика по-прежнему находится в отдельном `src/schedule`.

Компактное чтение и подписка находятся в `apps/web/src/data/scheduleSnapshot.ts`, чистое объединение участков — `src/schedule/mergeScheduleSnapshot.ts`, очередь согласования — `src/v2/schedule/scheduleSync.ts`. Локальные проверки контракта: `supabase/tests/compact_schedule.sql`; две реальные сессии: `apps/web/e2e/schedule-sync.local.ts` и отдельный `playwright.sync.config.ts`. Одноразовые ключи стенда и результаты запуска в Git не входят.

`sandbox/ui` сохраняется как историческая лаборатория и источник старых визуальных сравнений. Переносить из неё механику без проверки текущего `apps/web` нельзя. Статус среды: [current-state.md](current-state.md).

Панель владельца API: `apps/web/src/v2/api/` (экран и стили), `apps/web/src/data/externalApi.ts` (доступ к данным и ключи). Она отделена от исполняемого внешнего API в `supabase/functions/external-api/`; endpoint расписания не импортируется в браузер.
