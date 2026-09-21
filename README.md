# schedule-app

Закрытый веб-сервис расписания для покер-группы: кто когда играет, чтобы свои не пересекались на одном руме и закрывали сутки.

## Где что лежит

| Папка | Назначение |
|---|---|
| [`docs/`](docs/README.md) | Описание продукта, сущности, стек, [база](docs/database.md) |
| [`supabase/`](supabase/README.md) | Миграции Postgres |
| [`apps/web/`](apps/web/README.md) | Основное приложение (Next.js) |
| [`sandbox/ui`](sandbox/ui) | Песочница UI: **Vite + React** |
| [`references/`](references/README.md) | Старые таблицы, **не публикуются** на GitHub |

Корень репозитория специально почти пустой: рабочие вещи живут в своих папках.

Документация продукта: [`docs/README.md`](docs/README.md) (читать по порядку). Что доделали в расписании: [`docs/schedule-now.md`](docs/schedule-now.md). Решения: [`docs/decisions.md`](docs/decisions.md). Живой UI и переход в `apps/web`: [`docs/sandbox.md`](docs/sandbox.md). UX сетки: [`docs/schedule-ux.md`](docs/schedule-ux.md).

Живой продукт локально:

```bash
cd apps/web
npx next dev -p 3000
```

Песочницу UI локально:

```bash
cd sandbox/ui
npm install
npm run dev
```
