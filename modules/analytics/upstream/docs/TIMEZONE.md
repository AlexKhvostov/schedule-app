# Контракт времени: UTC в БД, сутки и UI — Испания

Зафиксировано 14.09.2026.

## Коротко

| Слой | Правило |
|------|---------|
| Момент сбора | Абсолютное время (`Date` / epoch), **не** «часы настенных часов ноутбука» |
| `scraped_at` в MySQL | **UTC wall-clock** (`YYYY-MM-DD HH:MM:SS` без смещения), сессия `SET time_zone = '+00:00'` |
| `scraped_date_milan` | Календарный день лидерборда в **`Europe/Madrid`** (обнуление очков maxwin = 00:00 ES) |
| Аналитика (часы, фильтры «сегодня») | Всегда через Madrid / `milan_hour_from_utc` / SpainClock |
| Локаль ОС скрапера (BY / ES / …) | **Не должна** влиять на запись, если пишем через `toISOString()` + IANA TZ |

Имя колонки `*_milan` — наследие; канонический IANA-тег теперь **`Europe/Madrid`**. CET/CEST совпадает с Rome почти всегда; Madrid явно отражает продукт (Испания).

## Почему ты прав

1. **Сутки поля** начинаются не в 00:00 UTC, а в **00:00 Europe/Madrid**. Carry / плотность / «день» в фильтрах опираются на `scraped_date_milan`, не на UTC date от `scraped_at`.
2. **Хранить момент в UTC** — правильно: два скрапера (ноут BY и ПК) пишут один и тот же мировой момент одинаково.
3. **В UI показывать Испанию** — правильно (часы в углу, оси графиков, «сегодня»).

## Откуда ощущение «дублей по времени»

v2-путь записи уже UTC-safe:

```text
scrapedAt = new Date()                    // абсолютный момент
scraped_at = scrapedAt.toISOString()…     // всегда UTC, независимо от TZ Windows
scraped_date_milan = milanDateOnly(...)   // en-CA + TIMEZONE=Europe/Madrid
```

Типичные источники «кривых» часов:

1. **Два скрапера почти одновременно** — два разных `scraped_at` (минута A и минута B). Это не «одно время с разным смыслом», а два снимка. Дедуп: одинаковые `(player, limit, points, scraped_date_milan)` пропускаются.
2. **Старый код / другой клиент**, писавший локальное BY-время в `scraped_at` **как будто это UTC** — тогда час в аналитике сдвинут на +1…+3. Лечится только аудитом/миграцией строк, не конфигом.
3. **`CURDATE()` в SQL** при сессии MySQL `+00:00` — «сегодня» = UTC-день, около полуночи ES может отличаться от Madrid. В API заменено на `milan_date_only()`.
4. **`TIMEZONE=Europe/Rome` в старых `.env`** — почти то же гражданское время, что Madrid; лучше выровнять на Madrid в `.env` (не коммитим секреты — правь локально).

## Чеклист при деплое

- Скрапер и analytics: `TIMEZONE=Europe/Madrid` в своих `.env`
- Не менять ОС TZ ради «правильной БД»
- Не писать `scraped_at` через `toLocale*` / `getHours()` без явного UTC
- Аналитика: час суток = конвертация UTC→Madrid в PHP/JS, не `HOUR(scraped_at)` как «испанский час»
- **`scraped_at` = DATETIME** (UTC wall-clock). Не TIMESTAMP: на Hostland `SYSTEM=UTC+3` съедает 3 часа у «голой» строки без `SET time_zone='+00:00'`
- Скрапер при старте пула проверяет session TZ; батч INSERT идёт на одном соединении с `SET +00:00`
- **Не использовать** `CONVERT_TZ(..., 'Europe/Madrid')` на Hostland: нет mysql time zone tables → NULL → всё падает в час 0. Час ES считать в PHP/JS (`milan_hour_from_utc` / Intl)

## Инцидент 14.09.2026 (−3 ч)

С **13:27 UTC** (старт домашнего v2 на другом ПК) до фикса: `TIMESTAMP` + сессия `SYSTEM` (+3) + запись `YYYY-MM-DD HH:MM:SS` без UTC-сессии → в БД wall−3ч. Логи (`DATETIME`) были верны. Починка: `+3h` для `id ≥ 3216585`, колонка → `DATETIME`.

## Связанные файлы

- Скрапер: `v2/scraper/src/db.js`, `v2/scraper/src/config.js`
- API: `v2/analytics/api/bootstrap.php` (`milan_date_only`, `milan_hour_from_utc`, `SET time_zone`)
- UI: `v2/analytics/app/src/utils/spainTime.js`, `SpainClock.vue`
- Плотность: `v2/analytics/docs/POINTS_DENSITY.md`
