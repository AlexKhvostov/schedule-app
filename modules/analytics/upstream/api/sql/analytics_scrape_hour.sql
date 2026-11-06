-- Покрытие сбора: день × час ES — было ли сырьё в tournament_snapshots.
-- Слой downtime для отчётов (не путать с агрегатами player_hour / hour_slice).
-- См. v2/analytics/docs/AGGREGATES_AND_CACHE.md

CREATE TABLE IF NOT EXISTS analytics_scrape_hour (
    day DATE NOT NULL COMMENT 'сутки ES',
    hour TINYINT UNSIGNED NOT NULL COMMENT '0-23 Europe/Madrid',
    snapshot_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'строк snapshots за час (наши лимиты)',
    has_data TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('ok','down','pending') NOT NULL DEFAULT 'pending'
        COMMENT 'ok=есть сырьё; down=час прошёл, сырья 0; pending=будущий час сегодня',
    computed_at DATETIME NOT NULL COMMENT 'UTC',
    PRIMARY KEY (day, hour),
    KEY idx_scrape_hour_status (status, day),
    KEY idx_scrape_hour_down (has_data, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
