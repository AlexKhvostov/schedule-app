# apps/web

Боевой сайт: **Next.js** на Vercel. Те же таблицы, что и песочница: [`../../supabase`](../../supabase/README.md).

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

Проверки перед коммитом:

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
```

Открывается http://localhost:3000/

Push в `main` автоматически публикует `apps/web` через подключение GitHub → Vercel. GitHub Actions выполняет проверки, но не занимается деплоем и не применяет миграции Supabase. Полный порядок релиза: [`../../docs/operations.md`](../../docs/operations.md).

В локальной development-сборке экран входа предлагает три среды:

- **Demo** — фейковые данные в браузере и выбор тестового пользователя;
- **Working** — текущий Supabase и настоящий вход Discord;
- **Production** — пока заглушка; отдельный чистый проект будет создан перед публичным запуском.

Решения по средам, авторизации и текущей архитектуре: [`../../docs/environments-and-architecture.md`](../../docs/environments-and-architecture.md).

Плотное поле расписания, кабинет и админские экраны уже находятся здесь. Новые функции разрабатываются в `apps/web`; `sandbox/ui` остаётся исторической лабораторией. Актуальное состояние: [`../../docs/current-state.md`](../../docs/current-state.md).

## Экраны

- `/` — оболочка приложения; раздел выбирается через hash (`#schedule`, `#cabinet`, `#admin` и другие)
- `/auth/callback` — возврат из Discord

В Discord OAuth добавь `http://localhost:3000/auth/callback` и URL Vercel.
