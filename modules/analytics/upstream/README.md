# maxwin v2 (Vue + PHP)

Аналитика для Hostland: **статика Vue** + **PHP API** (без Node на хостинге).

Образец старого дашборда: `ref/` (не макет 1:1).

## Настройка

```bash
cd v2/analytics
copy .env.example .env
```

Заполните `v2/analytics/.env`:

```env
MYSQL_HOST=mysql80.hostland.ru
MYSQL_PORT=3306
MYSQL_USERNAME=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=...
TIMEZONE=Europe/Madrid
```

`PORT` / `BIND` для PHP-сервера локально не обязательны (порт задаётся в команде `php -S`).

## Локальный запуск

Нужен **исправленный PHP**: 8.2.35+, 8.3.36+, 8.4.27+ или 8.5.12+ в своей ветке.
Launcher блокирует старые версии и выключает session upload progress до разбора
запроса. Отдельная локальная установка имеет приоритет над XAMPP; явный `PHP_BIN`
имеет высший приоритет. Версия CLI не подтверждает PHP на Hostland.
Подробности и серверные действия: [PHP_SECURITY.md](../README.md#внешние-зависимости-исходного-проекта).

### 1. API (порт 3010)

Из корня репозитория:

```bash
npm run v2:analytics-api
```

Это поднимает встроенный PHP-сервер на `127.0.0.1:3010` после проверки версии.

Проверка: http://127.0.0.1:3010/health

Если PHP не находится: задайте `PHP_BIN=C:\xampp\php\php.exe` или добавьте PHP в PATH.

### 2. Vue UI (порт 5173)

```bash
npm run v2:analytics
```

Открыть: http://127.0.0.1:5173 — Vite проксирует `/api` и `/health` на PHP.

## Экраны

- **Home** — нагрузка по часам + сравнение со средним
- **Points Today** — линии очков
- **Yearly** — календарь активности / дыры сбора
- **Speed** — быстрые игроки, добавление в реги
- **Players** — список 50/100/250
- **Профиль** — `/player/:name`

Фильтры сверху + **Реги** (свои / чужие). Таблица `analytics_regs` создаётся API сама.

## Сборка и Hostland

```bash
npm run v2:analytics-build
```

## XAMPP (локально как на хостинге)

Каталог: `C:\xampp\htdocs\dashboard\`

1. Заполните `v2/analytics/.env`
2. Запустите Apache в XAMPP
3. Из корня репо:

```bash
npm run v2:analytics-xampp
```

Открыть: http://localhost/dashboard/

Скрипт соберёт Vue с `base=/dashboard/` и скопирует `dist` + `api` + `.htaccess` + `.env`.

Другой путь: `XAMPP_DIR=D:\path npm run v2:analytics-xampp`

## Hostland

Основной адрес: `http://dashboard.redparty.ru/`. Из корня проекта соберите полный пакет:

```powershell
npm run v2:analytics-hostland
```

Команда пересоздаёт `v2/analytics/hostland-upload/`: собирает интерфейс с базой `/`,
копирует PHP API и `.env`, выставляет `RewriteBase /` и формирует инструкцию загрузки.
Перед запуском сохраните файлы, которые вручную меняли только в готовом пакете.

Если нужно размещение в подпапке, задайте путь явно (PowerShell):

```powershell
$env:VITE_BASE = '/analytics/'
npm run v2:analytics-hostland
```

Чтобы вернуться к корню поддомена, установите `$env:VITE_BASE = '/'`.

На хостинг загрузите содержимое `v2/analytics/hostland-upload/` непосредственно
в корневой каталог поддомена, указанный в панели Hostland. Не создавайте внутри
дополнительную папку `dashboard/`. Загрузите скрытый `.htaccess`; при обновлении
сохраните рабочую серверную `.env`, не заменяя её локальной вслепую.

Структура:

```
корневой каталог dashboard.redparty.ru/
  index.html
  assets/
  .htaccess
  .env
  api/
```

Проверки: `/assets/app.js` отдаёт JavaScript без зависания; `/api/index.php?__route=/health`
возвращает JSON с `status: ok` и `mysql: true`; `/points` отображает данные и выдерживает
обновление страницы. После настройки SSL повторите проверки через HTTPS.
Если используется автоматический пересчёт, в окружении работающего скрапера обновите
`ANALYTICS_API_BASE_URL` на `http://dashboard.redparty.ru/` (или HTTPS после настройки SSL).

## API (контракт)

| Метод | Путь |
|-------|------|
| GET | `/health` |
| GET/POST | `/api/regs` |
| DELETE | `/api/regs/:name` |
| GET | `/api/home` |
| GET | `/api/points` |
| GET | `/api/yearly` |
| GET | `/api/speed` |
| GET | `/api/players` |
| GET | `/api/players/search?q=` |
| GET | `/api/players/:name` |
| GET | `/api/players/:name/note` | комментарий к игроку |
| PUT | `/api/players/:name/note` | комментарий (тело `{ "note": "..." }`, пустая строка удаляет) |

## UI

- ApexCharts + Tailwind v4, тёмная тема

