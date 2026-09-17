# Структура репозитория

```
schedule-app/
  README.md
  docs/                      продукт, сущности, стек, UX сетки
  apps/web/                  боевой Next.js (пока заглушка)
  sandbox/ui/                песочница: Vite + React + Tailwind + shadcn
  sandbox/legacy-html/       архив HTML-набросков, не используем
  references/                старые таблицы (в git только README)
```

GitHub: ветка `main`. Папка `references/` с выгрузками таблиц **не публикуется** (см. `.gitignore`).

Порядок работы: вид в `sandbox/ui` → когда устаканится, перенос в `apps/web`.

Как запустить песочницу и чем она отличается от MVP — [sandbox.md](sandbox.md).
