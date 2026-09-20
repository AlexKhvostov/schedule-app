# Структура репозитория

```
schedule-app/
  README.md
  docs/                      продукт, сущности, стек, UX сетки, схема БД
  supabase/                  миграции и seed Postgres
  apps/web/                  боевой Next.js
  sandbox/ui/                песочница: Vite + React + Tailwind + shadcn
  sandbox/legacy-html/       архив HTML-набросков, не используем
  references/                старые таблицы (в git только README)
```

GitHub: ветка `main`. Папка `references/` с выгрузками таблиц **не публикуется** (см. `.gitignore`).

Порядок работы: вид и поведение собираем в `sandbox/ui`. Когда экран устаканился — те же компоненты в `apps/web`. UI-кит и Блоки на сайте есть, но только у root.

Как запустить песочницу, что продукт, а что лаборатория — [sandbox.md](sandbox.md).
