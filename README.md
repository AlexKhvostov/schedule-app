# schedule-app

Закрытый веб-сервис расписания для покер-группы: кто когда играет, чтобы свои не пересекались на одном руме и закрывали сутки.

## Где что лежит

| Папка | Назначение |
|---|---|
| [`docs/`](docs/README.md) | Описание продукта, сущности, стек |
| [`apps/web/`](apps/web/README.md) | Основное приложение (Next.js) |
| [`sandbox/ui`](sandbox/ui) | Песочница UI: **Vite + React** (как Next.js, без деплоя) |
| [`references/`](references/README.md) | Старые таблицы, **не публикуются** на GitHub |

Корень репозитория специально почти пустой: рабочие вещи живут в своих папках.

Документация продукта: [`docs/README.md`](docs/README.md) (читать по порядку). UX сетки: [`docs/schedule-ux.md`](docs/schedule-ux.md).

Песочницу UI локально:

```bash
cd sandbox/ui
npm install
npm run dev
```
