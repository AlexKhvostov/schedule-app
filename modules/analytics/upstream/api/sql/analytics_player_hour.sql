-- Сборная таблица: почасовой max игрока (с carry внутри суток ES).
-- Одна строка = игрок × день × час × лимит.
-- См. v2/analytics/docs/AGGREGATES_AND_CACHE.md

CREATE TABLE IF NOT EXISTS analytics_player_hour (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    player_name VARCHAR(255) NOT NULL,
    day DATE NOT NULL COMMENT 'scraped_date_milan (сутки ES)',
    hour TINYINT UNSIGNED NOT NULL COMMENT '0-23 Europe/Madrid',
    tournament_limit VARCHAR(16) NOT NULL COMMENT 'один бай-ин',
    max_points_carry INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'накопленный MAX с 00:00 ES до конца H',
    min_points_hour INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'мин. очки среди снимков только в H',
    max_points_hour INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'макс. очки среди снимков только в H',
    diff_points INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'max_points_carry(H)-max_points_carry(H-1)',
    diff_seconds INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'сек: min_at(H)-max_at(H-1); первый час max_at-min_at',
    speed DECIMAL(16,6) NULL COMMENT 'diff_points/diff_seconds*3600 (очки/час), NULL если 0 сек',
    rank_at_max INT UNSIGNED NULL COMMENT 'место из снимка carry-max',
    has_snapshot TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'был снимок в часу H',
    min_at DATETIME NULL COMMENT 'UTC+0: время min_points_hour',
    max_at DATETIME NULL COMMENT 'UTC+0: время max_points_hour',
    computed_at DATETIME NOT NULL COMMENT 'UTC+0 пересчёта',
    PRIMARY KEY (id),
    UNIQUE KEY uq_player_hour (day, hour, tournament_limit, player_name),
    KEY idx_ph_player_day (player_name, day),
    KEY idx_ph_day_limit_hour (day, tournament_limit, hour),
    KEY idx_ph_computed (computed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
