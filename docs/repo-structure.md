# Структура репозитория

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

Новые функции, исправления и рефакторинг делаем непосредственно в `apps/web`. Предметная логика живёт в `src/schedule`, ввод-вывод — в `src/data`, React-компоненты — в `src/v2` и `src/components`. Подробные границы: [code-architecture.md](code-architecture.md).

Внутри `apps/web/src/v2` расписание разделено на два тематических каталога: `schedule/` содержит hooks сценариев экрана и панели, а `optField/` — отрисовку поля, подсказку и DOM-жесты. Входные компоненты `V2Schedule.tsx` и `OptField.tsx` остаются на прежних путях. `src/v2/schedule` отвечает за React-состояние экрана; чистая предметная логика по-прежнему находится в отдельном `src/schedule`.

`sandbox/ui` сохраняется как историческая лаборатория и источник старых визуальных сравнений. Переносить из неё механику без проверки текущего `apps/web` нельзя. Статус среды: [current-state.md](current-state.md).
