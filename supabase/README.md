# Supabase

Регион проекта — **EU**. Секреты в git не кладём.

Живой статус (приложение, бот, первый root): [docs/discord-now.md](../docs/discord-now.md).

## Один раз

1. Создай проект на [supabase.com](https://supabase.com) (EU).
2. Authentication → Providers → включи **Discord**. Redirect URL: `http://localhost:5173/` и позже URL Vercel / `http://localhost:3000/auth/callback`.
3. SQL Editor: сначала файл из `migrations/`, потом `seed.sql`.
4. Скопируй URL и anon key в `sandbox/ui/.env.local` и `apps/web/.env.local` по `.env.example`.

Без этих ключей песочница остаётся демо на устройстве.

## Проверка

После миграции в Table Editor видны `members`, `schedule_kinds`, `occupancy`. Первый вход через Discord создаёт участника со статусом `pending`.

## Бот Discord (только root)

Токен бота в git и в браузер не кладём. В Edge Function Secrets проекта:

- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`

В кабинете бота включи **Server Members Intent**. Бот должен стоять на сервере клуба.

Первого человека сделай root вручную — иначе некому пускать заявки. Root сразу носит и роль администратора:

```sql
update members set access_status = 'active', approved_at = now();
insert into member_roles (member_id, role_id)
select id, role_id
from members
cross join (values ('root'), ('admin')) as r(role_id)
on conflict do nothing;
```
