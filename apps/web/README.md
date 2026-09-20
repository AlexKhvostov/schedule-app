# apps/web

Боевой сайт: **Next.js** на Vercel. Те же таблицы, что и песочница: [`../../supabase`](../../supabase/README.md).

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

Открывается http://localhost:3000/

Плотное поле расписания **пока в** [`sandbox/ui`](../../sandbox/ui). Сюда переносим те же компоненты, не рисуем экраны заново. Что уже устаканилось и что не тащить (UI-кит, Блоки, Архив) — [`../../docs/sandbox.md`](../../docs/sandbox.md).

## Экраны

- `/` — Discord
- `/wait` — заявка
- `/schedule` — живые слоты месяца (список; плотное поле пока в `sandbox/ui`)
- `/admin` — пустить заявки
- `/auth/callback` — возврат из Discord

В Discord OAuth добавь `http://localhost:3000/auth/callback` и URL Vercel.
