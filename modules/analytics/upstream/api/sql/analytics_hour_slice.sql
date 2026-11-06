-- Сборная таблица: почасовой срез поля (без ников).
-- Одна строка = день × час × лимит × сегмент.
-- См. v2/analytics/docs/AGGREGATES_AND_CACHE.md

CREATE TABLE IF NOT EXISTS analytics_hour_slice (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    day DATE NOT NULL COMMENT 'scraped_date_milan',
    hour TINYINT UNSIGNED NOT NULL COMMENT '0-23 Milan/Rome',
    tournament_limit VARCHAR(16) NOT NULL COMMENT 'один бай-ин: 50, 100, …',
    segment VARCHAR(32) NOT NULL DEFAULT 'all' COMMENT 'all|regs|ours|theirs|nonregs',
    players_seen INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'ников с 00:00 до конца H на этом лимите',
    players_new INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'впервые за день на лимите в часу H',
    players_active_hour INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'был снимок в часу H',
    cumulative INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'C(H)=Σ max с carry',
    volume INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'C(H)-C(H-1); дыра→0',
    has_records TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'был снимок лимита в часу',
    computed_at DATETIME NOT NULL COMMENT 'UTC время пересчёта строки',
    PRIMARY KEY (id),
    UNIQUE KEY uq_slice (day, hour, tournament_limit, segment),
    KEY idx_slice_day_limit (day, tournament_limit, segment),
    KEY idx_slice_computed (computed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_job_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_key VARCHAR(64) NOT NULL COMMENT 'hour_slice | hour_avg | …',
    status ENUM('running','ok','error') NOT NULL DEFAULT 'running',
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    message VARCHAR(1000) NULL,
    meta_json JSON NULL COMMENT 'days, rows, limits, …',
    PRIMARY KEY (id),
    KEY idx_job_key_started (job_key, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
