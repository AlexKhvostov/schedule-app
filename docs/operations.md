# Эксплуатация

## Автоматический деплой

Vercel подключён к GitHub. Каждый push в `main` автоматически запускает production-деплой `apps/web`; отдельного deploy-job в GitHub Actions нет. Pull request может создавать preview-деплой по настройкам Vercel.

Production-сборка не показывает локальный выбор Demo / Working / Production и не разрешает тестовый вход от имени другого пользователя. Она открывает только настоящий Discord-вход и использует проект Supabase из переменных Vercel.

Vercel production обязан иметь:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

`next.config.ts` останавливает production-деплой Vercel, если одна из них отсутствует. Discord должен разрешать production callback URL.

GitHub Actions и Vercel решают разные задачи: CI проверяет код, Vercel публикует сайт. Если в Vercel не настроено ожидание GitHub checks, деплой может начаться до завершения CI. Поэтому прямой push в `main` делаем только после локальных проверок или через pull request с обязательным зелёным CI.

Миграции Supabase и Edge Functions автоматически из GitHub сейчас **не выкатываются**. Если релиз зависит от новой схемы или функции, сначала применяем и проверяем совместимое серверное изменение, затем отправляем клиент в `main`. Автоматизировать базу можно позже отдельным защищённым workflow с секретами Staging/Production.

## Релизный барьер

Каждый pull request должен пройти `.github/workflows/ci.yml`: lint, TypeScript, unit-тесты, production build, Chromium E2E, чистую сборку локальной Supabase из миграций, SQL-контракты RLS и database lint.

Базовый E2E всегда выполняет детерминированный локальный сценарий. Для smoke-теста реальной Discord-сессии на staging укажите `E2E_AUTH_STATE` — путь к некоммитящемуся Playwright storage-state. Мутационные тесты нельзя направлять в production.

## Мониторинг уведомлений

`notify-mark-removed` пишет структурированный JSON-лог на вызов и сохраняет обезличенный результат в `occupancy_event_notifications`. Текст сообщения, Discord-токен и имена пользователей не журналируются.

```sql
select
  delivery_status,
  count(*) as events,
  sum(dm_sent) as dm_sent,
  sum(dm_failed) as dm_failed,
  max(completed_at) as last_completed_at
from occupancy_event_notifications
where claimed_at >= now() - interval '24 hours'
group by delivery_status
order by delivery_status;
```

Нужно расследовать любой `failed`, устойчивый `partial` и строки в `claimed` дольше пяти минут. В логах Edge Function вызов сопоставляется по `requestId`.

Вызовы Discord с ответом `429` или `5xx` повторяются до трёх раз с короткой задержкой. Полностью неуспешная доставка может быть повторно захвачена при следующем вызове функции, максимум три раза и с экспоненциальной паузой. `partial` автоматически не повторяется, чтобы уже получившие сообщение пользователи не увидели дубль.

## Резервные копии

У платных проектов Supabase есть ежедневные platform backups; актуальное окно восстановления проверяется в Database → Backups. Для меньшего RPO включается PITR. Database backup не восстанавливает удалённые Storage-объекты — при появлении Storage для него нужна отдельная политика.

До production-релиза отдельная автоматизация backup не включается. Перед релизом нужно выбрать срок хранения, настроить platform backup/PITR или закрытый workflow логического дампа и проверить восстановление. Доступ к логическому dump равнозначен доступу на чтение базы, поэтому хранить его в открытых CI artifacts нельзя.

После включения production-backup раз в квартал:

1. Скачать один логический backup.
2. Восстановить его в одноразовый Supabase-проект.
3. Выполнить `supabase/tests/security_contracts.sql` и smoke-тест приложения.
4. Записать длительность восстановления и ручные шаги.

## Миграции и откат

Предпочтителен откат вперёд — новая исправляющая миграция. До рискованной production-миграции нужно подтвердить свежую точку восстановления и выполнить `supabase db reset` на пустой локальной базе.

Если миграция уже попала в production:

1. Остановить затронутые записи приложения.
2. Сохранить новые production-данные логическим дампом.
3. Применить проверенную компенсирующую миграцию; уже применённый файл не редактировать.
4. Dashboard restore/PITR использовать только когда корректность нельзя сохранить компенсирующей миграцией: восстановление даёт простой и отбрасывает более поздние записи.
5. Повторно выполнить security contracts, smoke Edge Function и web E2E.

Миграцию `20260924235900_security_hardening.sql` нельзя откатывать возвратом прямой записи `authenticated` в `distances`; необходимые операции добавляются только узкими RPC.
