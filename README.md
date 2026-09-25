# schedule-app

Закрытый веб-сервис расписания для покер-группы: кто когда играет, чтобы свои не пересекались на одном руме и закрывали сутки.

## Где что лежит

| Папка | Назначение |
|---|---|
| [`docs/`](docs/README.md) | Описание продукта, сущности, стек, [база](docs/database.md) |
| [`supabase/`](supabase/README.md) | Миграции Postgres |
| [`apps/web/`](apps/web/README.md) | Основное приложение (Next.js) |
| [`sandbox/ui`](sandbox/ui) | Историческая UI-лаборатория: **Vite + React** |
| [`references/`](references/README.md) | Старые таблицы, **не публикуются** на GitHub |

Корень репозитория специально почти пустой: рабочие вещи живут в своих папках.

Начать с [`docs/current-state.md`](docs/current-state.md), затем открыть [`docs/decisions.md`](docs/decisions.md) и тематический документ из [`docs/README.md`](docs/README.md). Новые сессии Codex автоматически получают те же правила через [`AGENTS.md`](AGENTS.md).

Живой продукт локально:

```bash
cd apps/web
npx next dev -p 3000
```

Историческую Vite-песочницу при необходимости сравнения:

```bash
cd sandbox/ui
npm install
npm run dev
```
