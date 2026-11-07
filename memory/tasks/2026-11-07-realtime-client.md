# Клиент Realtime: передача результата

Обновлено: 2026-11-07 14:26 Europe/Minsk. Подзадача `/root/sync_client` основной работы [Realtime Preview](2026-11-07-realtime-preview.md). Ветка `codex/realtime-schedule`; коммиты, push и удалённые изменения этот агент не выполнял.

Цель: единая подписка, актуальное расписание при пассивном просмотре без постоянных чтений, Presence и понятный индикатор.

| Подзадача | Статус | Результат/критерий |
|---|---|---|
| Один частный канал и lifecycle аккаунта | Готово | `appRealtime.ts`; единый app:changes, cleanup и epoch guard, минимальный Presence, дедуп вкладок, очистка списка при потере соединения; 5 unit |
| Синхронизация расписания | Готово | Начальное чтение; точечные события; metadata-check на reconnect/wake/edit/loss; singleflight; safety OFF по умолчанию; конфигурация применяется отдельно |
| Неопределённое сохранение | Готово | Pending сохраняет ту же closure/opid; явный повтор до определённого ответа; новые записи заблокированы, HTTP snapshot сам неопределённость не снимает |
| Индикатор | Готово | Онлайн/оффлайн/connect по SDK; tooltip hover/focus/touch, последнее реально применённое обновление; manual retry сбрасывает backoff без abort текущего чтения |
| Проверки клиента | Готово | Typecheck PASS; ESLint целевых файлов PASS; 42 unit PASS в пяти файлах |
| Проверка потери WS | Готово | Playwright lost live PASS, отдельный порт3102; после HTTP checkpoint выполняется один защищённый write, reconnect не повторяет жест |
| Полная интеграция и Preview | В работе | Основной агент выполняет общие проверки, техническую документацию и публикацию |

Ключевые файлы: `apps/web/src/data/appRealtime.ts`, `scheduleSnapshot.ts`, `src/v2/schedule/useScheduleMonth.ts`, `scheduleSync.ts`, `scheduleMonthState.ts`, `ScheduleSyncStatus.tsx`, `src/v2/OnlineMenu.tsx`. V2Schedule изменён только selfId и prepareEditing effect. Локали/settings/cache принадлежат settings_client; SQL принадлежит database; v2 write RPC клиент принадлежит основному агенту.

Важные инварианты: patch обновляет revisions только прочитанных targets; directory-only — только directory. Config revision принимается лишь вместе с соответствующим context. Начальный mismatch config snapshot/context требует повторной загрузки конфигурации. Метаданные без изменений не меняют lastUpdated. Потеря WS не запрещает защищённую запись после успешной однократной HTTP сверки. Hidden не запускает новые чтения, visible сохраняет режим редактирования и проверяет версии. Неопределённая запись не повторяется автоматически.

Следующий шаг: основной агент выполняет общий набор тестов и Preview. Код клиента заморожен после адресного E2E. Временные `.sync-*.log` в корне не включать в коммит. Legacy data/online.ts и onlineMembers.ts больше не импортируются приложением, удаление не выполнялось.

## 2026-11-07 14:31 Europe/Minsk — глобальное обновление прав

По финальному review основного агента access-подписка перенесена в App auth effect и работает на всех страницах. LiveEntryRecovery.invalidate объединяет серию событий и сохраняет повтор при событии во время чтения; logout/unmount отменяют отложенную работу. Schedule access сохраняет full refresh, а пропущенное изменение прав, найденное по metadata, публикует локальный общий access event. Прямой auth.retry из useScheduleMonth удалён. Проверено: 27 unit recovery/hook/sync PASS, ESLint четырёх изменённых файлов PASS. Общий финальный прогон выполняет основной агент.

## 2026-11-07 14:52 Europe/Minsk — компактный список с именем и Discord

По уточнению пользователя список содержит аватар 22 px, имя из анкеты 12 px и публичный ник Discord 11 px. Одинаковые имя/ник не дублируются, длинные строки обрезаются с title. Winamax не добавлялся. Presence расширен необязательными profile_name/avatar_url, прежние nick-only клиенты совместимы; строки ограничены, недопустимые URL отбрасываются. V2Shell использует displayName из уже имеющегося loadMyCabinet для часового пояса, session.nick/avatarUrl для Discord; дополнительных SQL-чтений нет. Профиль привязан к memberId, поздний ответ прежней сессии игнорируется. Новые стили onlineMenu.css изолированы.

Проверки: 7 unit appRealtime PASS; 4 Presence E2E PASS (dark/light 320 px, 35 пользователей, пустой список, отсутствие SQL-пингов, дедуп, disconnect, реальная отправка профиля/аватара из сессии); дополнительно schedule-sync.live:60 PASS по просьбе основного агента. Первые два теста выявили ошибку fixture (повтор phx_ref сохранял старое содержимое Presence); исправлено уникальной ревизией phx_ref, после чего все 4 прошли. Снимки просмотрены: компактные строки, горизонтального переполнения нет, длинный Discord корректно обрезан. [Тёмная](2026-11-07-online-presence-dark.png), [светлая](2026-11-07-online-presence-light.png), [профиль/аватар](2026-11-07-online-presence-avatar.png).

Изменён раздел 9 docs/schedule-data-sync.md. Общие typecheck/lint/unit/build и публикацию выполняет основной агент. Локальных коммитов/push нет.

## 2026-11-07 15:10 Europe/Minsk — Winamax возвращён по новому указанию

Последнее прямое уточнение Алексея заменяет предыдущий вариант «без Winamax». Первая строка теперь содержит имя из анкеты и справа публичный Discord, вторая — Winamax; слева остаётся аватар 22 px. Одинаковые имя/Discord не дублируются, обе строки ограничены ellipsis и имеют title. Время присутствия не добавлялось, достоверного существующего поля нет.

Источник Winamax: результат уже существующего loadMyPlays, который расписание и анкета выполняют для своих функций. Дополнительные SQL-чтения/таймеры не добавлены. Optional winamax_nick ограничен 100 символами. Только свой member_id может обновить собственный Presence; одинаковый ник повторно не отправляется. До обычного чтения Winamax не отображается. На старте сначала завершается SDK getAppAccount, после чего фиксируется account generation; поздний ответ A→B и A→B→A не публикуется. При переключении профиля собственный ранее загруженный ник не теряется, при смене аккаунта очищается.

Проверки: 14 unit appRealtime/playsPresence PASS; ESLint изменённых файлов PASS; typecheck прошёл до последнего небольшого accessor generation, общий финальный прогон выполняет основной агент. Presence E2E обновлены для Winamax и расположения строк, сервер не запускался по договорённости: основной агент проверяет вместе со своей карточкой. Старые снимки выше относятся к предыдущему варианту; нужны новые после общего E2E. Документация Presence обновлена без вмешательства в остальные разделы.

Дополнительные файлы этого уточнения: src/data/plays.ts, новый src/data/playsPresence.test.ts; также изменены ранее перечисленные appRealtime, OnlineMenu/CSS, V2Shell, Presence E2E/fixture и docs §9. Коммитов/push этот агент не выполнял.

## 2026-11-07 15:18 Europe/Minsk — общая идентичность для обоих списков

По последнему уточнению Алексея создан один PersonIdentity для OnlineMenu и ScheduleRoster. Общая разметка: аватар; имя плотнее и рядом приглушённый публичный Discord без скобок/разделителей; ниже сам Winamax без префикса. formatPersonIdentity отвечает за fallback и отсутствие повторов. Helper имеет другое basename, чтобы Windows не спутал .ts и .tsx. CSS-плотности: Online 22 px, roster 18 px и строки 24 px; ширина roster по-прежнему ограничена, короткое имя не сжимается длинным Discord.

Профильное имя уже было загружено в SchedulePlayer, но терялось в Mark. Добавлены Mark.profileName, передача в markFromPlayer и отдельный Demo mapper demoLimitMarks. Фактический rosterSource в Demo использует именно эти faces; они перекрывают данные grid marks. Приоритет, метка и открытие профиля остались в ScheduleRoster. Запросы не добавлены.

Проверки: 17 unit format/converter/live+Demo/roster PASS; typecheck и ESLint PASS. Основной агент подтвердил Presence E2E 4/4 PASS. Его свежие mobile-снимки просмотрены: имя Борис полностью видно, Discord и Winamax сокращаются, обе темы без переполнения. [Тёмная](2026-11-07-shared-identity-online-dark.png), [светлая](2026-11-07-shared-identity-online-light.png). Независимый агент проверяет roster density/сжатие/profile; первые два order-теста застали код до Demo mapper fix, им нужен адресный повтор после freeze. Общий build/unit выполняет основной агент; исходники заморожены.

Изменены PersonIdentity.tsx, formatPersonIdentity.ts/.test.ts, personIdentity.css; OnlineMenu.tsx/onlineMenu.css, schedule/ScheduleRoster.tsx; schedule/marks.ts, data/players.ts/.test.ts; e2e presence.live.ts, roster-order.spec.ts, login-schedule-mark.spec.ts. В docs/code-architecture.md добавлен только раздел общего компонента. Status/locales/schedule-sync.live не менялись.
