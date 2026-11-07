# Выпуск компактного расписания в main

Обновлено: 7 ноября2026,05:29Europe/Minsk. Алексей проверил Preview, сообщил «всё хорошо» и прямо поручил перенести изменения в main и опубликовать на основном сайте.

Цель: перенести одобренный код572fdee с документациейb5458eb в main, получить успешные CI/Vercel Production и проверить redparty.ru чтением.

| Этап | Статус | Критерий |
| --- | --- | --- |
| Проверка состава и истории | Готово | main/origin/main=c622bf3 до переноса; код идентичен Preview;43изменённых файла сохранены побайтно |
| Перенос и push main | Готово | main/origin/main=43cc2d6; обычный pushc622bf3→43cc2d6; код идентичен572fdee |
| Vercel Production | Готово |43cc2d6,84CNg6QpEF1KTZA1oZbffSGourna Ready05:12:37Europe/Minsk,57s |
| CI GitHub | Готово |42327985224 success: все4jobs;397unit,164E2Epass/2skip без flaky,2production-сценария pass |
| Основной сайт | Готово | IAB redparty.ru: авторизованное расписание «Актуально»,30дней/60поверхностей лимитов; чтение без изменений данных |
| Документация | Готово | current-state/work-log/local-workspace/operations и отчёт актуальны; последующий коммит содержит только эти документы |

Исходный main=c622bf3, preview=572fdee, рабочая codex/compact-schedule=b5458eb. Код после полной локальной проверки не менялся: types/lint/397unit/build/bundle и164разных E2E успешны (один повтор таймаута входа Dashboard;2штатныхskip). [Тестовый выпуск](2026-11-07-compact-preview-release.md). Миграции и Edge Functions в этом выпуске не меняются и не устанавливаются. Навык session-memory сохраняет этапы и итог.


Push main выполнен7ноября около05:11Europe/Minsk. Последний коммит43cc2d6 содержит только разрешение/план выпуска, чтобы запустить CI (предыдущийb5458eb был docs-only со skip ci). Исходники apps/supabase/.github побайтно совпадают с одобренным572fdee. [CI](https://github.com/AlexKhvostov/schedule-app/actions/runs/42327985224), [Production-сборка](https://vercel.com/hobby-build/schedule-app/84CNg6QpEF1KTZA1oZbffSGourna).


05:13: IAB подтвердил redparty.ru после публикации:30дней,60новых .v2-opt-limit-surface при сохранённых фильтрах N50/N100 Nitro, внешняя рамка0,666667px и новый solid outline закреплённой колонки при текущем масштабе. Настройки/данные не менялись. Это проверка опубликованной разметки и загрузки, не повтор всех локальных сценариев наведения.


## Итог выпуска

Код43cc2d6 опубликован на [redparty.ru](https://redparty.ru/); [Vercel Production7615175919](https://vercel.com/hobby-build/schedule-app/84CNg6QpEF1KTZA1oZbffSGourna) success, постоянный домен привязан к этому выпуску. [CI42327985224](https://github.com/AlexKhvostov/schedule-app/actions/runs/42327985224) завершён success: web/database/external-api/schedule-sync. В журнале web397unit,164E2Epass/2skip (13min, без flaky) и2production-сценария pass (6,2s); types/lint/build/bundle также прошли. Новых ошибок этого выпуска не осталось.

Финальные документы сохраняются отдельным docs-only коммитом с skip ci; apps/supabase/.github идентичны проверенному43cc2d6 и одобренному572fdee. Повтор полного CI для текстового журнала не требуется; отдельный статус Vercel финального коммита проверяется перед ответом и записывается в memory/PROJECT.md.

Рабочая папка остаётсяmain. Экспериментальная ветка, preview и старые версии не удалялись.43чужих незакоммиченных файла при переключении сохранены побайтно; они не включены в выпуск. База, миграции и Edge Functions в этом этапе не менялись. Предыдущая основная версияc622bf3 доступна в истории; возможный откат выполнять отдельным revert после разбора текущих файлов, без force/reset. Требуемых незавершённых работ по выпуску нет.

Session-memory сохранил фактические результаты, ссылки и границы проверки. Следующий шаг: обычная работа с опубликованным расписанием.
