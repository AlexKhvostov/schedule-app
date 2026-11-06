-- Дневной статус обработки analytics_player_hour.
-- Отличает «ещё не собирали» от «в tournament_snapshots за сутки пусто» и от «дыры по часам».
-- См. v2/analytics/docs/AGGREGATES_AND_CACHE.md

CREATE TABLE IF NOT EXISTS analytics_player_hour_day (
    day DATE NOT NULL COMMENT 'сутки ES (scraped_date_milan)',
    status ENUM('ok', 'partial', 'no_data', 'subset', 'today') NOT NULL
        COMMENT 'ok; partial=дыры/нет вечера/лаг агрегата; no_data; subset=не все лимиты в сырье; today',
    source_snapshots INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'число строк tournament_snapshots за день (по нашим лимитам)',
    row_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'строк в analytics_player_hour за день',
    limits_n TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'сколько лимитов реально в player_hour',
    computed_at DATETIME NOT NULL COMMENT 'UTC последней обработки дня',
    note VARCHAR(255) NULL,
    PRIMARY KEY (day),
    KEY idx_ph_day_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
