<?php

declare(strict_types=1);

/**
 * Каталог сборных таблиц + джобы пересчёта (админка).
 */

require_once __DIR__ . '/../bootstrap.php';
/** Лимиты, для которых строим срезы (включая 16-25). */
function aggregate_limits(): array
{
    return ['16-25', '50', '100', '250'];
}

function ensure_aggregate_tables(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS analytics_player_hour (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            player_name VARCHAR(255) NOT NULL,
            day DATE NOT NULL,
            hour TINYINT UNSIGNED NOT NULL,
            tournament_limit VARCHAR(16) NOT NULL,
            max_points_carry INT UNSIGNED NOT NULL DEFAULT 0,
            min_points_hour INT UNSIGNED NOT NULL DEFAULT 0,
            max_points_hour INT UNSIGNED NOT NULL DEFAULT 0,
            diff_points INT UNSIGNED NOT NULL DEFAULT 0,
            diff_seconds INT UNSIGNED NOT NULL DEFAULT 0,
            delta_hour INT UNSIGNED NOT NULL DEFAULT 0,
            speed DECIMAL(16, 6) NULL,
            rank_at_max INT UNSIGNED NULL,
            has_snapshot TINYINT(1) NOT NULL DEFAULT 0,
            min_at DATETIME NULL,
            max_at DATETIME NULL,
            computed_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_player_hour (day, hour, tournament_limit, player_name),
            KEY idx_ph_player_day (player_name, day),
            KEY idx_ph_day_limit_hour (day, tournament_limit, hour),
            KEY idx_ph_computed (computed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS analytics_hour_slice (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            day DATE NOT NULL,
            hour TINYINT UNSIGNED NOT NULL,
            tournament_limit VARCHAR(16) NOT NULL,
            segment VARCHAR(32) NOT NULL DEFAULT 'all',
            players_seen INT UNSIGNED NOT NULL DEFAULT 0,
            players_new INT UNSIGNED NOT NULL DEFAULT 0,
            players_active_hour INT UNSIGNED NOT NULL DEFAULT 0,
            cumulative INT UNSIGNED NOT NULL DEFAULT 0,
            volume INT UNSIGNED NOT NULL DEFAULT 0,
            has_records TINYINT(1) NOT NULL DEFAULT 0,
            computed_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_slice (day, hour, tournament_limit, segment),
            KEY idx_slice_day_limit (day, tournament_limit, segment),
            KEY idx_slice_computed (computed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS analytics_job_runs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            job_key VARCHAR(64) NOT NULL,
            status ENUM('running','ok','error') NOT NULL DEFAULT 'running',
            started_at DATETIME NOT NULL,
            finished_at DATETIME NULL,
            message VARCHAR(1000) NULL,
            meta_json JSON NULL,
            PRIMARY KEY (id),
            KEY idx_job_key_started (job_key, started_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS analytics_player_hour_day (
            day DATE NOT NULL,
            status ENUM('ok','partial','no_data','subset','today') NOT NULL,
            source_snapshots INT UNSIGNED NOT NULL DEFAULT 0,
            row_count INT UNSIGNED NOT NULL DEFAULT 0,
            limits_n TINYINT UNSIGNED NOT NULL DEFAULT 0,
            computed_at DATETIME NOT NULL,
            note VARCHAR(255) NULL,
            PRIMARY KEY (day),
            KEY idx_ph_day_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    // Расширение ENUM на уже созданных БД (идемпотентно)
    try {
        $pdo->exec(
            "ALTER TABLE analytics_player_hour_day
             MODIFY status ENUM('ok','partial','no_data','subset','today') NOT NULL"
        );
    } catch (Throwable $e) {
        // ignore if already applied / no rights
    }
    // Колонки скорости / diff / min-max часа (идемпотентно)
    $alters = [
        'ADD COLUMN min_points_hour INT UNSIGNED NOT NULL DEFAULT 0',
        'ADD COLUMN max_points_hour INT UNSIGNED NOT NULL DEFAULT 0',
        'ADD COLUMN max_points_carry INT UNSIGNED NOT NULL DEFAULT 0',
        'ADD COLUMN diff_points INT UNSIGNED NOT NULL DEFAULT 0',
        'ADD COLUMN diff_seconds INT UNSIGNED NOT NULL DEFAULT 0',
        'ADD COLUMN speed DECIMAL(16,6) NULL',
        'ADD COLUMN min_at DATETIME NULL',
        'ADD COLUMN max_at DATETIME NULL',
        'ADD COLUMN delta_hour INT UNSIGNED NOT NULL DEFAULT 0',
    ];
    foreach ($alters as $alter) {
        try {
            $pdo->exec("ALTER TABLE analytics_player_hour {$alter}");
        } catch (Throwable $e) {
            // колонка уже есть
        }
    }
    // Старые имена → новые (идемпотентно)
    $renames = [
        'CHANGE COLUMN volume diff_points INT UNSIGNED NOT NULL DEFAULT 0',
        'CHANGE COLUMN max_points max_points_carry INT UNSIGNED NOT NULL DEFAULT 0',
        'CHANGE COLUMN min_points min_points_hour INT UNSIGNED NOT NULL DEFAULT 0',
    ];
    foreach ($renames as $sql) {
        try {
            $pdo->exec("ALTER TABLE analytics_player_hour {$sql}");
        } catch (Throwable $e) {
            // уже переименовано или исходной колонки нет
        }
    }
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS analytics_scrape_hour (
            day DATE NOT NULL,
            hour TINYINT UNSIGNED NOT NULL,
            snapshot_count INT UNSIGNED NOT NULL DEFAULT 0,
            has_data TINYINT(1) NOT NULL DEFAULT 0,
            status ENUM('ok','down','pending') NOT NULL DEFAULT 'pending',
            computed_at DATETIME NOT NULL,
            PRIMARY KEY (day, hour),
            KEY idx_scrape_hour_status (status, day),
            KEY idx_scrape_hour_down (has_data, day)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS analytics_job_schedule (
            job_key VARCHAR(64) NOT NULL,
            enabled TINYINT(1) NOT NULL DEFAULT 0,
            interval_minutes INT UNSIGNED NOT NULL DEFAULT 10,
            last_run_at DATETIME NULL,
            last_status VARCHAR(16) NULL,
            last_message VARCHAR(1000) NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (job_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

/**
 * @return list<array<string, mixed>>
 */
function admin_tables_catalog(): array
{
    return [
        [
            'id' => 'player_hour',
            'tableName' => 'analytics_player_hour',
            'title' => 'Почасовой max игрока',
            'short' => 'Игрок × день × час × лимит: max, min/max в часу, diff и скорость',
            'status' => 'ready',
            'jobKey' => 'player_hour',
            'hasControl' => true,
            'group' => 'pipeline',
            'purpose' => 'Шаг 1 конвейера. Из tournament_snapshots строит почасовой max каждого игрока '
                . 'внутри суток ES и одного лимита (50€ и 100€ — разные строки). Carry между часами. '
                . 'Скорость — внутри часа (max−min; час 0: max−0). Heatmap/плотность — междучасовая '
                . 'разница delta_hour (max часа − max прошлого). '
                . 'Нужна для профиля, Points, скорости и как сырьё для hour_slice.',
            'rules' => [
                'Ключ: day + hour + tournament_limit + player_name.',
                'Carry только внутри суток ES и одного лимита; до первого появления строк нет.',
                'С часа первого появления — строка каждый час до 23 (даже без снимка).',
                'При новом пике очков обновляются max_points_carry и rank_at_max.',
                'Если в tournament_snapshots за сутки нет ни одной строки по нашим лимитам — день '
                    . 'помечается no_data в analytics_player_hour_day (не путать с «ещё не собирали»).',
                'partial = дыры по часам / нет данных после 22:00 ES / сырьё есть, а в агрегате не всё.',
                'subset = в сырье не все 4 лимита (лимиты, видимо, были выключены) — это не недосбор.',
                'today = текущие сутки ES, день ещё идёт.',
            ],
            'fields' => [
                ['name' => 'player_name', 'type' => 'VARCHAR', 'desc' => 'Ник игрока на maxwin.'],
                ['name' => 'day', 'type' => 'DATE', 'desc' => 'Календарные сутки лидерборда по Испании (Europe/Madrid). В 00:00 ES очки обнуляются; это не UTC-дата из scraped_at.'],
                ['name' => 'hour', 'type' => 'TINYINT 0–23', 'desc' => 'Час этих же испанских суток (0 = с 00:00 до 00:59 ES, 23 = с 23:00 до 23:59 ES).'],
                ['name' => 'tournament_limit', 'type' => 'VARCHAR', 'desc' => 'Один бай-ин стола (16-25, 50, 100 или 250). У одного игрока в один час разные лимиты — разные строки.'],
                ['name' => 'max_points_carry', 'type' => 'INT', 'desc' => 'Накопленный максимум с начала суток ES до конца этого часа (carry). Не сбрасывается внутри дня: если пик был в 10:00, в 15:00 здесь всё ещё тот пик. Нужен для сумм поля и срезов.'],
                ['name' => 'min_points_hour', 'type' => 'INT', 'desc' => 'Минимум очков среди снимков только внутри часа H (пара к max_points_hour). Если в часу снимков не было (только carry) — равно текущему max_points_carry.'],
                ['name' => 'max_points_hour', 'type' => 'INT', 'desc' => 'Максимум очков среди снимков только внутри часа H (пара к min_points_hour), без накопления с утра. Может быть меньше max_points_carry, если рекорд дня был раньше.'],
                ['name' => 'diff_points', 'type' => 'INT', 'desc' => 'Разница очков внутри часа для скорости: max_points_hour − min_points_hour. Час 0 / первое появление: максимум часа − 0.'],
                ['name' => 'diff_seconds', 'type' => 'INT', 'desc' => 'Окно внутри часа: |max_at − min_at|. Час 0 / первое появление: max_at − 00:00 ES.'],
                ['name' => 'delta_hour', 'type' => 'INT', 'desc' => 'Междучасовая разница для heatmap/плотности: max_points_hour(H) − max_points_hour(H−1). Час 0: max − 0. Сумма за день ≈ dayMax.'],
                ['name' => 'speed', 'type' => 'DECIMAL', 'desc' => 'Скорость внутри часа: (diff_points ÷ diff_seconds) × 3600. NULL, если интервал 0 секунд.'],
                ['name' => 'rank_at_max', 'type' => 'INT NULL', 'desc' => 'Место (rank) из того снимка, на котором зафиксировали текущий max_points_carry. Может быть пустым, если места в сырье не было.'],
                ['name' => 'has_snapshot', 'type' => 'BOOL', 'desc' => '1 = в этом часу H по этому лимиту реально был хотя бы один снимок; 0 = строки нет в сырье, значение только «дотянули» carry с прошлого часа.'],
                ['name' => 'min_at', 'type' => 'DATETIME UTC', 'desc' => 'Момент времени (UTC+0), когда в часу H впервые увидели min_points_hour. Если очки в часу не менялись — граница начала часа ES, записанная в UTC.'],
                ['name' => 'max_at', 'type' => 'DATETIME UTC', 'desc' => 'Момент времени (UTC+0), когда в часу H зафиксировали max_points_hour. Если очки не менялись — граница часа ES в UTC.'],
                ['name' => 'computed_at', 'type' => 'DATETIME UTC', 'desc' => 'Когда эта строка агрегата была пересчитана (UTC+0), не время снимка игрока.'],
                ['name' => 'analytics_player_hour_day.status', 'type' => 'ENUM', 'desc' => 'Статус дня в соседней таблице: ok — день полный; partial — дыры/нет вечера/недонабор; no_data — в сырье пусто; subset — не все 4 лимита; today — текущие сутки ещё идут.'],
            ],
            'updatePlan' => 'Вручную из админки (окно дней / один день). '
                . 'Авто: расписание «сегодня» — интервал задаётся в контроле player_hour; '
                . 'тикер на сервере сбора (Node) дергает /api/cron/player-hour-today. '
                . 'Автозаполнение: empty + partial + no_data (no_data пишет 24× down в scrape_hour). subset / today — не крутит.',
            'defaultDaysBack' => 14,
        ],
        [
            'id' => 'hour_slice',
            'tableName' => 'analytics_hour_slice',
            'title' => 'Почасовой срез поля',
            'short' => 'C(H), volume и счётчики игроков за каждый час дня по лимиту',
            'status' => 'ready',
            'jobKey' => 'hour_slice',
            'hasControl' => true,
            'group' => 'pipeline',
            'purpose' => 'Шаг 2 конвейера. Суммы поля без ников. При «Обновить» сначала пересобирает '
                . 'analytics_player_hour за окно, затем SUM → cumulative / volume / счётчики. '
                . 'Дальше из неё — средние и JSON-кэш Home.',
            'rules' => [
                'Источник: analytics_player_hour (не сырой лог напрямую).',
                'Carry только внутри day + tournament_limit.',
                'Если в H−1 не было записей лимита — volume[H]=0 (дыра после простоя).',
                'Сейчас segment=all; реги позже.',
            ],
            'fields' => [
                ['name' => 'day', 'type' => 'DATE', 'desc' => 'Сутки лидерборда по Испании (scraped_date_milan), не UTC-дата.'],
                ['name' => 'hour', 'type' => 'TINYINT 0–23', 'desc' => 'Час Europe/Madrid внутри этих суток.'],
                ['name' => 'tournament_limit', 'type' => 'VARCHAR', 'desc' => 'Один бай-ин: 16-25, 50, 100 или 250. Срезы по лимитам независимы.'],
                ['name' => 'segment', 'type' => 'VARCHAR', 'desc' => 'Сегмент игроков. Сейчас всегда all; позже — наши/чужие реги и т.п.'],
                ['name' => 'players_seen', 'type' => 'INT', 'desc' => 'Сколько разных ников уже встречалось на этом лимите с 00:00 ES до конца часа H (накопительно за день).'],
                ['name' => 'players_new', 'type' => 'INT', 'desc' => 'Сколько ников впервые за эти сутки появились именно в часу H (не раньше).'],
                ['name' => 'players_active_hour', 'type' => 'INT', 'desc' => 'Сколько ников имели хотя бы один реальный снимок в часу H (has_snapshot=1), без чистого carry.'],
                ['name' => 'cumulative', 'type' => 'INT', 'desc' => 'C(H) — сумма max_points_carry всех игроков лимита к концу часа H. «Сколько всего очков на поле накопилось к этому часу».'],
                ['name' => 'volume', 'type' => 'INT', 'desc' => 'Прирост поля за час: C(H) − C(H−1). Если в предыдущем часу не было записей лимита (дыра после простоя) — пишем 0, чтобы не раздувать скачок.'],
                ['name' => 'has_records', 'type' => 'BOOL', 'desc' => '1 = в сырье за этот час по этому лимиту были снимки; 0 = час пустой для лимита.'],
                ['name' => 'computed_at', 'type' => 'DATETIME UTC', 'desc' => 'Когда строка среза пересчитана (UTC+0).'],
            ],
            'updatePlan' => 'Вручную из админки («Обновить» = player_hour + slice за окно, по умолчанию 60 + сегодня). '
                . 'Позже: cron / вызов после сбора.',
            'defaultDaysBack' => 60,
        ],
        [
            'id' => 'hour_avg',
            'tableName' => 'analytics_hour_avg',
            'title' => 'Средние по часам',
            'short' => 'AVG(volume) за окно дней / день недели — из hour_slice',
            'status' => 'planned',
            'jobKey' => null,
            'group' => 'pipeline',
            'purpose' => 'Шаг 3 конвейера. Не читает сырой лог: только analytics_hour_slice. '
                . 'Даст линии «среднее все дни» и «среднее этот день недели» для Home без тяжёлого SELECT.',
            'rules' => [
                'Строится только после hour_slice.',
                'По-прежнему per tournament_limit.',
            ],
            'fields' => [
                ['name' => 'window_days', 'type' => 'INT', 'desc' => 'За сколько последних дней усредняем (например 60).'],
                ['name' => 'avg_kind', 'type' => 'ENUM', 'desc' => 'Тип средней: all_days — все дни окна; weekday — только выбранный день недели.'],
                ['name' => 'weekday', 'type' => 'INT', 'desc' => 'День недели 0–6 для avg_kind=weekday; для all_days обычно −1.'],
                ['name' => 'hour', 'type' => 'TINYINT', 'desc' => 'Час суток ES 0–23, для которого посчитана средняя.'],
                ['name' => 'tournament_limit', 'type' => 'VARCHAR', 'desc' => 'Бай-ин, к которому относится средняя.'],
                ['name' => 'segment', 'type' => 'VARCHAR', 'desc' => 'Сегмент (all / …), как в hour_slice.'],
                ['name' => 'avg_volume', 'type' => 'DECIMAL', 'desc' => 'Средний volume (прирост поля за этот час) по выбранному окну дней.'],
                ['name' => 'sample_days', 'type' => 'INT', 'desc' => 'Сколько дней реально вошло в среднее (после пропусков/дыр).'],
                ['name' => 'computed_at', 'type' => 'DATETIME UTC', 'desc' => 'Когда средние пересчитаны (UTC+0).'],
            ],
            'updatePlan' => 'После hour_slice; вручную из админки, затем ночной job. Пока не реализовано.',
            'defaultDaysBack' => null,
        ],
        // --- отдельно от конвейера агрегатов: инфраструктура / простой сервера ---
        [
            'id' => 'scrape_hour',
            'tableName' => 'analytics_scrape_hour',
            'title' => 'Часы сбора (downtime)',
            'short' => 'День × час: было ли сырьё в snapshots (нерабочие часы сервера)',
            'status' => 'ready',
            'jobKey' => 'scrape_hour',
            'hasControl' => true,
            'group' => 'ops',
            'purpose' => 'Не ступень конвейера очков. Слой «когда сервер не писал» для отчётов и админки. '
                . 'Строка на каждый час суток ES: snapshot_count / has_data / status ok|down|pending. '
                . 'Даже если за сутки 0 снимков — пишем 24× down (целый день простоя). '
                . 'Заполняется при сборке player_hour и отдельной джобой.',
            'rules' => [
                'Ключ: day + hour (0–23, Europe/Madrid).',
                'Считаем по tournament_snapshots и нашим 4 лимитам суммарно.',
                'down = час уже прошёл, а снимков 0; pending = будущий час сегодня; missing = ещё не считали.',
                'Дневной downtime.json — длинные ручные интервалы; эта таблица — авто по часам.',
            ],
            'fields' => [
                ['name' => 'day', 'type' => 'DATE', 'desc' => 'Сутки по Испании, за которые смотрим, писал ли сбор.'],
                ['name' => 'hour', 'type' => 'TINYINT 0–23', 'desc' => 'Час ES 0–23. Считается в PHP/JS из UTC-снимков (не через CONVERT_TZ на Hostland).'],
                ['name' => 'snapshot_count', 'type' => 'INT', 'desc' => 'Сколько строк tournament_snapshots попало в этот час по нашим 4 лимитам суммарно.'],
                ['name' => 'has_data', 'type' => 'BOOL', 'desc' => '1 = snapshot_count > 0 (сбор в этот час что-то записал); 0 = пусто.'],
                ['name' => 'status', 'type' => 'ENUM', 'desc' => 'ok — час прошёл и данные есть; down — час уже прошёл, снимков 0 (простой); pending — час ещё в будущем сегодня.'],
                ['name' => 'computed_at', 'type' => 'DATETIME UTC', 'desc' => 'Когда строка downtime-часа пересчитана (UTC+0).'],
            ],
            'updatePlan' => 'Автоматически при сборке player_hour; также «Обновить» на этой карточке.',
            'defaultDaysBack' => 60,
        ],
    ];
}

function require_admin_token(): void
{
    require_admin_session();
}

function admin_cache_dir(): string
{
    $dir = analytics_root() . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function admin_client_ip(): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return preg_replace('/[^a-zA-Z0-9:._-]/', '', $ip) ?: 'unknown';
}

/**
 * @return array{fails:int,lockedUntil:int}
 */
function admin_auth_state_read(): array
{
    $path = admin_cache_dir() . DIRECTORY_SEPARATOR . 'admin_auth_lock.json';
    if (!is_readable($path)) {
        return ['fails' => 0, 'lockedUntil' => 0];
    }
    $raw = file_get_contents($path);
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) {
        return ['fails' => 0, 'lockedUntil' => 0];
    }
    $ip = admin_client_ip();
    $row = $data[$ip] ?? null;
    if (!is_array($row)) {
        return ['fails' => 0, 'lockedUntil' => 0];
    }
    return [
        'fails' => (int) ($row['fails'] ?? 0),
        'lockedUntil' => (int) ($row['lockedUntil'] ?? 0),
    ];
}

/**
 * @param array{fails:int,lockedUntil:int} $state
 */
function admin_auth_state_write(array $state): void
{
    $path = admin_cache_dir() . DIRECTORY_SEPARATOR . 'admin_auth_lock.json';
    $all = [];
    if (is_readable($path)) {
        $decoded = json_decode((string) file_get_contents($path), true);
        if (is_array($decoded)) {
            $all = $decoded;
        }
    }
    $ip = admin_client_ip();
    $all[$ip] = [
        'fails' => (int) $state['fails'],
        'lockedUntil' => (int) $state['lockedUntil'],
        'updatedAt' => time(),
    ];
    file_put_contents($path, json_encode($all, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function admin_sessions_path(): string
{
    return admin_cache_dir() . DIRECTORY_SEPARATOR . 'admin_sessions.json';
}

/**
 * @return array<string, array{exp:int}>
 */
function admin_sessions_read(): array
{
    $path = admin_sessions_path();
    if (!is_readable($path)) {
        return [];
    }
    $data = json_decode((string) file_get_contents($path), true);
    if (!is_array($data)) {
        return [];
    }
    $now = time();
    $clean = [];
    foreach ($data as $hash => $row) {
        if (!is_array($row)) {
            continue;
        }
        $exp = (int) ($row['exp'] ?? 0);
        if ($exp > $now) {
            $clean[(string) $hash] = ['exp' => $exp];
        }
    }
    return $clean;
}

/**
 * @param array<string, array{exp:int}> $sessions
 */
function admin_sessions_write(array $sessions): void
{
    file_put_contents(
        admin_sessions_path(),
        json_encode($sessions, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

function admin_password_configured(): bool
{
    return trim((string) (env('ANALYTICS_ADMIN_PASSWORD', '') ?? '')) !== '';
}

function admin_lock_remaining_sec(): int
{
    $state = admin_auth_state_read();
    $left = (int) $state['lockedUntil'] - time();
    return max(0, $left);
}

function require_admin_session(): void
{
    if (!admin_password_configured()) {
        json_error('Задайте ANALYTICS_ADMIN_PASSWORD в v2/analytics/.env', 503);
    }
    $token = (string) ($_SERVER['HTTP_X_ADMIN_SESSION'] ?? '');
    if ($token === '') {
        json_error('Нужна авторизация админки', 401);
    }
    $hash = hash('sha256', $token);
    $sessions = admin_sessions_read();
    if (!isset($sessions[$hash])) {
        json_error('Сессия недействительна или истекла', 401);
    }
}

function handle_admin_login(): void
{
    if (!admin_password_configured()) {
        json_error('Задайте ANALYTICS_ADMIN_PASSWORD в v2/analytics/.env', 503);
    }

    $lockLeft = admin_lock_remaining_sec();
    if ($lockLeft > 0) {
        json_response([
            'ok' => false,
            'locked' => true,
            'retryAfterSec' => $lockLeft,
            'error' => 'Слишком много попыток. Подождите около часа.',
        ], 429);
    }

    $body = [];
    $raw = file_get_contents('php://input');
    if ($raw) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $body = $decoded;
        }
    }
    $password = (string) ($body['password'] ?? '');
    $expected = (string) env('ANALYTICS_ADMIN_PASSWORD', '');

    if ($password !== '' && hash_equals($expected, $password)) {
        admin_auth_state_write(['fails' => 0, 'lockedUntil' => 0]);
        $token = bin2hex(random_bytes(32));
        $sessions = admin_sessions_read();
        $sessions[hash('sha256', $token)] = ['exp' => time() + 12 * 3600];
        admin_sessions_write($sessions);
        json_response([
            'ok' => true,
            'token' => $token,
            'expiresInSec' => 12 * 3600,
        ]);
    }

    $state = admin_auth_state_read();
    $fails = (int) $state['fails'] + 1;
    $lockedUntil = 0;
    if ($fails >= 3) {
        $lockedUntil = time() + 3600;
        $fails = 0;
    }
    admin_auth_state_write(['fails' => $fails, 'lockedUntil' => $lockedUntil]);

    if ($lockedUntil > 0) {
        json_response([
            'ok' => false,
            'locked' => true,
            'retryAfterSec' => 3600,
            'attemptsLeft' => 0,
            'error' => 'Три неверных попытки. Вход заморожен на 1 час.',
        ], 429);
    }

    json_response([
        'ok' => false,
        'locked' => false,
        'attemptsLeft' => max(0, 3 - $fails),
        'error' => 'Неверный пароль',
    ], 401);
}

function handle_admin_session(): void
{
    $lockLeft = admin_lock_remaining_sec();
    if ($lockLeft > 0) {
        json_response([
            'ok' => false,
            'configured' => admin_password_configured(),
            'locked' => true,
            'retryAfterSec' => $lockLeft,
        ]);
    }

    $token = (string) ($_SERVER['HTTP_X_ADMIN_SESSION'] ?? '');
    if ($token === '' || !admin_password_configured()) {
        json_response([
            'ok' => false,
            'configured' => admin_password_configured(),
            'locked' => false,
            'attemptsLeft' => max(0, 3 - (int) admin_auth_state_read()['fails']),
        ]);
    }

    $hash = hash('sha256', $token);
    $sessions = admin_sessions_read();
    if (!isset($sessions[$hash])) {
        json_response([
            'ok' => false,
            'configured' => true,
            'locked' => false,
            'attemptsLeft' => max(0, 3 - (int) admin_auth_state_read()['fails']),
        ]);
    }

    json_response([
        'ok' => true,
        'configured' => true,
        'locked' => false,
        'expiresAt' => $sessions[$hash]['exp'],
    ]);
}

function handle_admin_logout(): void
{
    $token = (string) ($_SERVER['HTTP_X_ADMIN_SESSION'] ?? '');
    if ($token !== '') {
        $sessions = admin_sessions_read();
        unset($sessions[hash('sha256', $token)]);
        admin_sessions_write($sessions);
    }
    json_response(['ok' => true]);
}

function job_last_run(PDO $pdo, string $jobKey): ?array
{
    $row = fetch_one(
        $pdo,
        'SELECT id, job_key, status, started_at, finished_at, message, meta_json
         FROM analytics_job_runs
         WHERE job_key = ?
         ORDER BY id DESC
         LIMIT 1',
        [$jobKey]
    );
    if (!$row) {
        return null;
    }
    $meta = null;
    if (!empty($row['meta_json'])) {
        $meta = json_decode((string) $row['meta_json'], true);
    }
    return [
        'id' => (int) $row['id'],
        'jobKey' => $row['job_key'],
        'status' => $row['status'],
        'startedAt' => $row['started_at'],
        'finishedAt' => $row['finished_at'],
        'message' => $row['message'],
        'meta' => $meta,
    ];
}

function aggregate_table_stats(PDO $pdo, string $tableName): ?array
{
    if (!in_array($tableName, [
        'analytics_hour_slice',
        'analytics_player_hour',
        'analytics_scrape_hour',
        'analytics_player_hour_day',
    ], true)) {
        return null;
    }
    $row = fetch_one(
        $pdo,
        "SELECT COUNT(*) AS n, MIN(day) AS min_day, MAX(day) AS max_day, MAX(computed_at) AS last_computed
         FROM {$tableName}"
    );
    return [
        'rowCount' => (int) ($row['n'] ?? 0),
        'minDay' => $row['min_day'] ?? null,
        'maxDay' => $row['max_day'] ?? null,
        'lastComputedAt' => $row['last_computed'] ?? null,
    ];
}

/** @deprecated use aggregate_table_stats */
function slice_table_stats(PDO $pdo): array
{
    return aggregate_table_stats($pdo, 'analytics_hour_slice') ?? [
        'rowCount' => 0,
        'minDay' => null,
        'maxDay' => null,
        'lastComputedAt' => null,
    ];
}

function handle_admin_tables(PDO $pdo): void
{
    require_admin_token();
    ensure_aggregate_tables($pdo);
    $out = [];
    foreach (admin_tables_catalog() as $item) {
        $last = $item['jobKey'] ? job_last_run($pdo, $item['jobKey']) : null;
        $stats = aggregate_table_stats($pdo, $item['tableName']);
        $out[] = [
            'id' => $item['id'],
            'tableName' => $item['tableName'],
            'title' => $item['title'],
            'short' => $item['short'],
            'status' => $item['status'],
            'canRun' => $item['status'] === 'ready' && $item['jobKey'] !== null,
            'hasControl' => !empty($item['hasControl']),
            'group' => $item['group'] ?? 'pipeline',
            'defaultDaysBack' => $item['defaultDaysBack'],
            'lastRun' => $last,
            'stats' => $stats,
        ];
    }
    json_response(['tables' => $out]);
}

function handle_admin_table_detail(PDO $pdo, string $id): void
{
    require_admin_token();
    ensure_aggregate_tables($pdo);
    foreach (admin_tables_catalog() as $item) {
        if ($item['id'] !== $id) {
            continue;
        }
        $last = $item['jobKey'] ? job_last_run($pdo, $item['jobKey']) : null;
        $stats = aggregate_table_stats($pdo, $item['tableName']);
        json_response([
            'table' => array_merge($item, [
                'canRun' => $item['status'] === 'ready' && $item['jobKey'] !== null,
                'hasControl' => !empty($item['hasControl']),
                'lastRun' => $last,
                'stats' => $stats,
            ]),
        ]);
    }
    json_error('Неизвестная таблица: ' . $id, 404);
}

/**
 * Последние N строк агрегата для просмотра в админке (не выгрузка всей таблицы).
 */
function handle_admin_table_rows(PDO $pdo, string $id): void
{
    require_admin_token();
    ensure_aggregate_tables($pdo);

    $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 100;
    $limit = max(1, min(200, $limit));

    $item = null;
    foreach (admin_tables_catalog() as $row) {
        if ($row['id'] === $id) {
            $item = $row;
            break;
        }
    }
    if ($item === null) {
        json_error('Неизвестная таблица: ' . $id, 404);
    }
    if (($item['status'] ?? '') !== 'ready') {
        json_error('Таблица ещё в плане — строк нет', 400);
    }

    $tableName = (string) ($item['tableName'] ?? '');
    $allowed = [
        'analytics_hour_slice',
        'analytics_player_hour',
        'analytics_scrape_hour',
        'analytics_player_hour_day',
    ];
    if (!in_array($tableName, $allowed, true)) {
        json_error('Просмотр этой таблицы запрещён', 400);
    }

    try {
        // Свежие по computed_at, затем id если есть
        $hasId = false;
        $cols = fetch_all($pdo, "SHOW COLUMNS FROM {$tableName}");
        foreach ($cols as $c) {
            if (($c['Field'] ?? '') === 'id') {
                $hasId = true;
                break;
            }
        }
        $order = $hasId ? 'computed_at DESC, id DESC' : 'computed_at DESC';
        $rows = fetch_all(
            $pdo,
            "SELECT * FROM {$tableName} ORDER BY {$order} LIMIT {$limit}"
        );
    } catch (Throwable $e) {
        json_error('Ошибка чтения: ' . $e->getMessage(), 500);
    }

    $columns = [];
    if ($rows) {
        $columns = array_keys($rows[0]);
    } elseif (!empty($cols)) {
        foreach ($cols as $c) {
            if (!empty($c['Field'])) {
                $columns[] = $c['Field'];
            }
        }
    }

    json_response([
        'id' => $id,
        'tableName' => $tableName,
        'title' => $item['title'] ?? $tableName,
        'limit' => $limit,
        'count' => count($rows),
        'columns' => $columns,
        'rows' => $rows,
        'note' => 'UTC в датах как в БД. Показаны последние записи по computed_at.',
    ]);
}

/**
 * Сколько строк сырья за сутки ES по нашим лимитам.
 */
function count_day_source_snapshots(PDO $pdo, string $day): int
{
    $limits = aggregate_limits();
    $ph = implode(',', array_fill(0, count($limits), '?'));
    $row = fetch_one(
        $pdo,
        "SELECT COUNT(*) AS n
         FROM tournament_snapshots
         WHERE scraped_date_milan = ?
           AND tournament_limit IN ($ph)",
        array_merge([$day], $limits)
    );
    return (int) ($row['n'] ?? 0);
}

/**
 * @return list<bool> length 24
 */
function empty_hour_flags(): array
{
    return array_fill(0, 24, false);
}

/**
 * Есть ли наблюдение после 22:00 ES (часы 22 и/или 23).
 *
 * @param list<bool> $hours
 */
function hours_have_evening(array $hours): bool
{
    return !empty($hours[22]) || !empty($hours[23]);
}

/**
 * Дыры между первым и последним часом с данными.
 *
 * @param list<bool> $hours
 */
function hours_have_internal_gaps(array $hours): bool
{
    $min = null;
    $max = null;
    for ($h = 0; $h < 24; $h++) {
        if (empty($hours[$h])) {
            continue;
        }
        if ($min === null) {
            $min = $h;
        }
        $max = $h;
    }
    if ($min === null || $max === null || $min === $max) {
        return false;
    }
    for ($h = $min; $h <= $max; $h++) {
        if (empty($hours[$h])) {
            return true;
        }
    }
    return false;
}

/**
 * Классификация дня для контроля покрытия.
 *
 * @param array{
 *   isToday:bool,
 *   hasMetaNoData?:bool,
 *   rowCount:int,
 *   sourceSnapshots:int,
 *   limitsWanted:list<string>,
 *   aggLimits:list<string>,
 *   srcLimits:list<string>,
 *   aggHours:list<bool>,
 *   srcHours:list<bool>
 * } $f
 * @return array{status:string, note:?string, reasons:list<string>}
 */
function classify_player_hour_day_status(array $f): array
{
    $wanted = $f['limitsWanted'];
    $aggLimits = array_values(array_unique($f['aggLimits']));
    $srcLimits = array_values(array_unique($f['srcLimits']));
    $srcN = (int) $f['sourceSnapshots'];
    $rowCount = (int) $f['rowCount'];
    $reasons = [];

    // Живая проверка сырья важнее meta
    if ($srcN <= 0) {
        return [
            'status' => 'no_data',
            'note' => 'Нет строк в tournament_snapshots за сутки',
            'reasons' => ['no_source'],
        ];
    }

    if ($rowCount <= 0) {
        return [
            'status' => 'empty',
            'note' => 'Сырьё есть, агрегат ещё не собран',
            'reasons' => ['not_aggregated'],
        ];
    }

    if (!empty($f['isToday'])) {
        return [
            'status' => 'today',
            'note' => 'Текущие сутки ES — день ещё идёт',
            'reasons' => ['today'],
        ];
    }

    $srcHours = $f['srcHours'];
    $aggHours = $f['aggHours'];
    $scrapeReady = !empty($f['scrapeReady']);

    // Часовые дыры / вечер — только если scrape_hour уже заполнен
    if ($scrapeReady) {
        if (!hours_have_evening($srcHours)) {
            $reasons[] = 'no_evening';
        }
        if (hours_have_internal_gaps($srcHours)) {
            $reasons[] = 'source_hour_gaps';
        }
    }

    foreach ($srcLimits as $lim) {
        if (!in_array($lim, $aggLimits, true)) {
            $reasons[] = 'aggregate_limit_lag';
            break;
        }
    }

    $qualityIssues = array_values(array_intersect($reasons, [
        'no_evening',
        'source_hour_gaps',
        'aggregate_limit_lag',
    ]));
    if ($qualityIssues) {
        $noteParts = [];
        if (in_array('no_evening', $qualityIssues, true)) {
            $noteParts[] = 'нет данных после 22:00 ES (по scrape_hour)';
        }
        if (in_array('source_hour_gaps', $qualityIssues, true)) {
            $noteParts[] = 'дыры по часам (scrape_hour)';
        }
        if (in_array('aggregate_limit_lag', $qualityIssues, true)) {
            $noteParts[] = 'в snapshots есть лимит, которого нет в агрегате';
        }
        return [
            'status' => 'partial',
            'note' => 'Неполный день: ' . implode('; ', $noteParts),
            'reasons' => $qualityIssues,
        ];
    }

    if (count($aggLimits) < count($wanted)) {
        return [
            'status' => 'subset',
            'note' => sprintf(
                'В сырье %d из %d лимитов (остальные, видимо, выключены)',
                count($srcLimits),
                count($wanted)
            ),
            'reasons' => ['limits_subset'],
        ];
    }

    return [
        'status' => 'ok',
        'note' => null,
        'reasons' => [],
    ];
}

/**
 * Факты покрытия одного дня (лимиты + часы сырья/агрегата).
 *
 * @param list<string> $limitsWanted
 * @param array<string, mixed>|null $preSrc day → {limits:{}, hours:[]}
 * @param array<string, mixed>|null $preAgg day → {limits:{}, hours:[], rowCount, players}
 * @return array<string, mixed>
 */
function collect_player_hour_day_facts(
    PDO $pdo,
    string $day,
    string $today,
    array $limitsWanted,
    ?array $meta = null,
    ?array $preSrc = null,
    ?array $preAgg = null
): array {
    if ($preSrc !== null && $preAgg !== null) {
        $srcPack = $preSrc[$day] ?? [
            'limits' => [],
            'hours' => empty_hour_flags(),
            'n' => 0,
            'scrapeReady' => false,
        ];
        $aggPack = $preAgg[$day] ?? [
            'limits' => [],
            'hours' => empty_hour_flags(),
            'rowCount' => 0,
            'players' => 0,
        ];
        $srcHours = $srcPack['hours'];
        $srcLimits = $srcPack['limits'];
        $aggHours = $aggPack['hours'];
        $aggLimits = $aggPack['limits'];
        $sourceSnapshots = (int) ($srcPack['n'] ?? 0);
        $rowCount = (int) ($aggPack['rowCount'] ?? 0);
        $players = (int) ($aggPack['players'] ?? 0);
        $scrapeReady = !empty($srcPack['scrapeReady']);
    } else {
        // Один день: лимиты из snapshots (лёгко), часы из scrape_hour
        $ph = implode(',', array_fill(0, count($limitsWanted), '?'));
        $srcGrouped = fetch_all(
            $pdo,
            "SELECT tournament_limit, COUNT(*) AS n
             FROM tournament_snapshots
             WHERE scraped_date_milan = ?
               AND tournament_limit IN ($ph)
             GROUP BY tournament_limit",
            array_merge([$day], $limitsWanted)
        );
        $srcHours = empty_hour_flags();
        $srcLimits = [];
        $sourceSnapshots = 0;
        foreach ($srcGrouped as $r) {
            $lim = (string) ($r['tournament_limit'] ?? '');
            if ($lim !== '') {
                $srcLimits[$lim] = true;
            }
            $sourceSnapshots += (int) ($r['n'] ?? 0);
        }

        $scrapeRows = fetch_all(
            $pdo,
            'SELECT hour, snapshot_count, has_data, status
             FROM analytics_scrape_hour WHERE day = ?',
            [$day]
        );
        $scrapeReady = $scrapeRows !== [];
        foreach ($scrapeRows as $r) {
            $h = (int) ($r['hour'] ?? -1);
            if ($h >= 0 && $h <= 23 && (!empty($r['has_data']) || (string) ($r['status'] ?? '') === 'ok')) {
                $srcHours[$h] = true;
            }
        }

        $aggRows = fetch_all(
            $pdo,
            "SELECT tournament_limit, hour, MAX(has_snapshot) AS has_snap, COUNT(*) AS n
             FROM analytics_player_hour
             WHERE day = ?
             GROUP BY tournament_limit, hour",
            [$day]
        );
        $aggHours = empty_hour_flags();
        $aggLimits = [];
        $rowCount = 0;
        foreach ($aggRows as $r) {
            $lim = (string) ($r['tournament_limit'] ?? '');
            if ($lim !== '') {
                $aggLimits[$lim] = true;
            }
            $h = (int) ($r['hour'] ?? -1);
            $rowCount += (int) ($r['n'] ?? 0);
            if ($h >= 0 && $h <= 23 && !empty($r['has_snap'])) {
                $aggHours[$h] = true;
            }
        }
        $playersRow = fetch_one(
            $pdo,
            'SELECT COUNT(DISTINCT player_name) AS n FROM analytics_player_hour WHERE day = ?',
            [$day]
        );
        $players = (int) ($playersRow['n'] ?? 0);
    }

    $facts = [
        'isToday' => $day === $today,
        'hasMetaNoData' => $meta && (string) ($meta['status'] ?? '') === 'no_data',
        'processed' => $meta !== null,
        'forceNoData' => $meta && (string) ($meta['status'] ?? '') === 'no_data',
        'rowCount' => $rowCount,
        'sourceSnapshots' => $sourceSnapshots,
        'limitsWanted' => $limitsWanted,
        'aggLimits' => array_keys($aggLimits),
        'srcLimits' => array_keys($srcLimits),
        'aggHours' => $aggHours,
        'srcHours' => $srcHours,
        'scrapeReady' => $scrapeReady ?? false,
    ];

    $classified = classify_player_hour_day_status($facts);
    $limitFlags = [];
    foreach ($limitsWanted as $lim) {
        $limitFlags[$lim] = [
            'agg' => !empty($aggLimits[$lim]),
            'src' => !empty($srcLimits[$lim]),
        ];
    }

    return [
        'facts' => $facts,
        'classified' => $classified,
        'limitFlags' => $limitFlags,
        'hoursAgg' => array_map(static fn ($v) => (bool) $v, $aggHours),
        'hoursSrc' => array_map(static fn ($v) => (bool) $v, $srcHours),
        'scrapeReady' => !empty($facts['scrapeReady']),
        'sourceSnapshots' => $sourceSnapshots,
        'rowCount' => $rowCount,
        'players' => $players ?? 0,
        'limitsN' => count($aggLimits),
    ];
}

/**
 * Часы сырья из analytics_scrape_hour (не из snapshots).
 *
 * @return array<string, array{hours:list<bool>, n:int, ready:bool, down:int}>
 */
function preload_scrape_hours_map(PDO $pdo, string $dayFrom, string $dayTo): array
{
    $rows = fetch_all(
        $pdo,
        'SELECT day, hour, snapshot_count, has_data, status
         FROM analytics_scrape_hour
         WHERE day >= ? AND day <= ?',
        [$dayFrom, $dayTo]
    );
    $out = [];
    foreach ($rows as $r) {
        $d = substr((string) $r['day'], 0, 10);
        if (!isset($out[$d])) {
            $out[$d] = [
                'hours' => empty_hour_flags(),
                'n' => 0,
                'ready' => true,
                'down' => 0,
            ];
        }
        $h = (int) ($r['hour'] ?? -1);
        $n = (int) ($r['snapshot_count'] ?? 0);
        $out[$d]['n'] += $n;
        if ($h >= 0 && $h <= 23) {
            if (!empty($r['has_data']) || (string) ($r['status'] ?? '') === 'ok') {
                $out[$d]['hours'][$h] = true;
            }
            if ((string) ($r['status'] ?? '') === 'down') {
                $out[$d]['down']++;
            }
        }
    }
    return $out;
}

/**
 * Лимиты в сырье за диапазон (лёгкий GROUP BY, без часов).
 *
 * @param list<string> $limitsWanted
 * @return array<string, array{limits:array<string,bool>, n:int}>
 */
function preload_source_limits_map(PDO $pdo, string $dayFrom, string $dayTo, array $limitsWanted): array
{
    $ph = implode(',', array_fill(0, count($limitsWanted), '?'));
    $rows = fetch_all(
        $pdo,
        "SELECT scraped_date_milan AS day, tournament_limit, COUNT(*) AS n
         FROM tournament_snapshots
         WHERE scraped_date_milan >= ? AND scraped_date_milan <= ?
           AND tournament_limit IN ($ph)
         GROUP BY day, tournament_limit",
        array_merge([$dayFrom, $dayTo], $limitsWanted)
    );
    $out = [];
    foreach ($rows as $r) {
        $d = substr((string) $r['day'], 0, 10);
        if (!isset($out[$d])) {
            $out[$d] = ['limits' => [], 'n' => 0];
        }
        $lim = (string) ($r['tournament_limit'] ?? '');
        if ($lim !== '') {
            $out[$d]['limits'][$lim] = true;
        }
        $out[$d]['n'] += (int) ($r['n'] ?? 0);
    }
    return $out;
}

/**
 * Батч сырья по диапазону дней: часы + лимиты + COUNT.
 * @deprecated для coverage — используйте preload_scrape_hours_map + preload_source_limits_map
 *
 * @param list<string> $limitsWanted
 * @return array<string, array{limits:array<string,bool>, hours:list<bool>, n:int}>
 */
function preload_source_day_hours(PDO $pdo, string $dayFrom, string $dayTo, array $limitsWanted): array
{
    $ph = implode(',', array_fill(0, count($limitsWanted), '?'));
    // Named CONVERT_TZ недоступен на Hostland — час через milan_hour_from_utc.
    $rows = fetch_all(
        $pdo,
        "SELECT scraped_date_milan AS day, tournament_limit, scraped_at
         FROM tournament_snapshots
         WHERE scraped_date_milan >= ? AND scraped_date_milan <= ?
           AND tournament_limit IN ($ph)",
        array_merge([$dayFrom, $dayTo], $limitsWanted)
    );
    $out = [];
    foreach ($rows as $r) {
        $d = substr((string) $r['day'], 0, 10);
        if (!isset($out[$d])) {
            $out[$d] = ['limits' => [], 'hours' => empty_hour_flags(), 'n' => 0];
        }
        $lim = (string) ($r['tournament_limit'] ?? '');
        if ($lim !== '') {
            $out[$d]['limits'][$lim] = true;
        }
        $out[$d]['n']++;
        $h = milan_hour_from_utc((string) ($r['scraped_at'] ?? ''));
        if ($h >= 0 && $h <= 23) {
            $out[$d]['hours'][$h] = true;
        }
    }
    return $out;
}

/**
 * Батч агрегата по диапазону.
 *
 * @return array<string, array{limits:array<string,bool>, hours:list<bool>, rowCount:int, players:int}>
 */
function preload_agg_day_hours(PDO $pdo, string $dayFrom, string $dayTo): array
{
    $rows = fetch_all(
        $pdo,
        'SELECT day, tournament_limit, hour,
                MAX(has_snapshot) AS has_snap,
                COUNT(*) AS n,
                COUNT(DISTINCT player_name) AS players
         FROM analytics_player_hour
         WHERE day >= ? AND day <= ?
         GROUP BY day, tournament_limit, hour',
        [$dayFrom, $dayTo]
    );
    $out = [];
    $playersAcc = [];
    foreach ($rows as $r) {
        $d = substr((string) $r['day'], 0, 10);
        if (!isset($out[$d])) {
            $out[$d] = [
                'limits' => [],
                'hours' => empty_hour_flags(),
                'rowCount' => 0,
                'players' => 0,
            ];
            $playersAcc[$d] = [];
        }
        $lim = (string) ($r['tournament_limit'] ?? '');
        if ($lim !== '') {
            $out[$d]['limits'][$lim] = true;
        }
        $h = (int) ($r['hour'] ?? -1);
        $out[$d]['rowCount'] += (int) ($r['n'] ?? 0);
        if ($h >= 0 && $h <= 23 && !empty($r['has_snap'])) {
            $out[$d]['hours'][$h] = true;
        }
    }

    $playerRows = fetch_all(
        $pdo,
        'SELECT day, COUNT(DISTINCT player_name) AS players
         FROM analytics_player_hour
         WHERE day >= ? AND day <= ?
         GROUP BY day',
        [$dayFrom, $dayTo]
    );
    foreach ($playerRows as $r) {
        $d = substr((string) $r['day'], 0, 10);
        if (!isset($out[$d])) {
            $out[$d] = [
                'limits' => [],
                'hours' => empty_hour_flags(),
                'rowCount' => 0,
                'players' => 0,
            ];
        }
        $out[$d]['players'] = (int) ($r['players'] ?? 0);
    }
    return $out;
}

/**
 * День × час: было ли сырьё в snapshots (слой downtime / покрытия сбора).
 *
 * @return array{hoursOk:int, hoursDown:int, hoursPending:int}
 */
function rebuild_scrape_hours_for_day(PDO $pdo, string $day): array
{
    $limits = aggregate_limits();
    $today = milan_date_only();
    $ph = implode(',', array_fill(0, count($limits), '?'));

    // Не CONVERT_TZ(..., 'Europe/Madrid'): на Hostland нет mysql tz tables → NULL,
    // и HOUR(NULL)/Number(null)→все строки в час 0. Час ES считаем в PHP (IANA).
    $snapAts = fetch_all(
        $pdo,
        "SELECT scraped_at
         FROM tournament_snapshots
         WHERE scraped_date_milan = ?
           AND tournament_limit IN ($ph)",
        array_merge([$day], $limits)
    );
    $counts = array_fill(0, 24, 0);
    foreach ($snapAts as $r) {
        $h = milan_hour_from_utc((string) ($r['scraped_at'] ?? ''));
        if ($h >= 0 && $h <= 23) {
            $counts[$h]++;
        }
    }

    $lastEvaluated = $day < $today ? 23 : ($day === $today ? milan_hour_now() : -1);
    $computedAt = gmdate('Y-m-d H:i:s');
    $ok = 0;
    $down = 0;
    $pending = 0;

    $sql = 'INSERT INTO analytics_scrape_hour
        (day, hour, snapshot_count, has_data, status, computed_at)
        VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          snapshot_count = VALUES(snapshot_count),
          has_data = VALUES(has_data),
          status = VALUES(status),
          computed_at = VALUES(computed_at)';
    $stmt = $pdo->prepare($sql);

    for ($h = 0; $h < 24; $h++) {
        $n = $counts[$h];
        $has = $n > 0 ? 1 : 0;
        if ($h > $lastEvaluated) {
            $status = 'pending';
            $pending++;
        } elseif ($has) {
            $status = 'ok';
            $ok++;
        } else {
            $status = 'down';
            $down++;
        }
        $stmt->execute([$day, $h, $n, $has, $status, $computedAt]);
    }

    return ['hoursOk' => $ok, 'hoursDown' => $down, 'hoursPending' => $pending];
}

/**
 * Окно дней для scrape_hour.
 *
 * @return array{dayFrom:string,dayTo:string,days:int,hoursDown:int,rowsUpserted:int}
 */
function run_job_scrape_hour(PDO $pdo, ?string $dayFrom, ?string $dayTo): array
{
    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    $today = milan_date_only();
    if ($dayTo === null || $dayTo === '') {
        $dayTo = $today;
    }
    if ($dayFrom === null || $dayFrom === '') {
        $dayFrom = (new DateTimeImmutable($dayTo, $tz))->modify('-14 days')->format('Y-m-d');
    }
    if ($dayFrom > $dayTo) {
        throw new InvalidArgumentException('dayFrom > dayTo');
    }

    $daysDone = 0;
    $hoursDown = 0;
    $cursor = new DateTimeImmutable($dayFrom, $tz);
    $end = new DateTimeImmutable($dayTo, $tz);
    while ($cursor <= $end) {
        $day = $cursor->format('Y-m-d');
        $r = rebuild_scrape_hours_for_day($pdo, $day);
        $hoursDown += $r['hoursDown'];
        $daysDone++;
        $cursor = $cursor->modify('+1 day');
    }

    return [
        'dayFrom' => $dayFrom,
        'dayTo' => $dayTo,
        'days' => $daysDone,
        'hoursDown' => $hoursDown,
        'rowsUpserted' => $daysDone * 24,
    ];
}

/**
 * Фиксируем итог обработки дня.
 */
function upsert_player_hour_day_status(
    PDO $pdo,
    string $day,
    string $status,
    int $sourceSnapshots,
    int $rowCount,
    int $limitsN,
    ?string $note = null
): void {
    // empty не храним — только явные исходы обработки
    if ($status === 'empty') {
        return;
    }
    $pdo->prepare(
        'INSERT INTO analytics_player_hour_day
            (day, status, source_snapshots, row_count, limits_n, computed_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            source_snapshots = VALUES(source_snapshots),
            row_count = VALUES(row_count),
            limits_n = VALUES(limits_n),
            computed_at = VALUES(computed_at),
            note = VALUES(note)'
    )->execute([
        $day,
        $status,
        $sourceSnapshots,
        $rowCount,
        $limitsN,
        gmdate('Y-m-d H:i:s'),
        $note,
    ]);
}

/**
 * Обработать один день player_hour: при пустом сырье — no_data, иначе пересчёт лимитов.
 *
 * @return array{status:string, sourceSnapshots:int, rowsUpserted:int, limitsN:int}
 */
function process_player_hour_day(PDO $pdo, string $day): array
{
    $limits = aggregate_limits();
    $today = milan_date_only();
    $sourceSnapshots = count_day_source_snapshots($pdo, $day);

    if ($sourceSnapshots <= 0) {
        $pdo->prepare('DELETE FROM analytics_player_hour WHERE day = ?')->execute([$day]);
        upsert_player_hour_day_status(
            $pdo,
            $day,
            'no_data',
            0,
            0,
            0,
            'Нет строк в tournament_snapshots за сутки (сервер/сбор не писал)'
        );
        $scrape = rebuild_scrape_hours_for_day($pdo, $day);
        return [
            'status' => 'no_data',
            'sourceSnapshots' => 0,
            'rowsUpserted' => 0,
            'limitsN' => 0,
            'scrape' => $scrape,
        ];
    }

    $rowsUpserted = 0;
    foreach ($limits as $limit) {
        $phRows = build_player_hour_rows_for_day_limit($pdo, $day, $limit);
        $rowsUpserted += replace_player_hour_day_limit($pdo, $day, $limit, $phRows);
    }

    $pack = collect_player_hour_day_facts($pdo, $day, $today, $limits, null);
    $status = $pack['classified']['status'];
    $note = $pack['classified']['note'];

    upsert_player_hour_day_status(
        $pdo,
        $day,
        $status,
        $pack['sourceSnapshots'],
        $pack['rowCount'],
        $pack['limitsN'],
        $note
    );

    $scrape = rebuild_scrape_hours_for_day($pdo, $day);

    return [
        'status' => $status,
        'sourceSnapshots' => $pack['sourceSnapshots'],
        'rowsUpserted' => $rowsUpserted,
        'limitsN' => $pack['limitsN'],
        'scrape' => $scrape,
    ];
}

/**
 * Сырьё: снимки дня/лимита → строки analytics_player_hour (с carry до 23:00).
 * Внутри часа: min/max очков + min_at/max_at (UTC) для скорости.
 *
 * @return list<array<string, mixed>>
 */
function build_player_hour_rows_for_day_limit(PDO $pdo, string $day, string $limit): array
{
    $rows = fetch_all(
        $pdo,
        'SELECT player_name, scraped_at, points, `rank`
         FROM tournament_snapshots
         WHERE scraped_date_milan = ? AND tournament_limit = ?
         ORDER BY scraped_at ASC',
        [$day, $limit]
    );

    /**
     * Все снимки по часу (для min/max очков и времён).
     * Ключ игрока — lowercase (MySQL UNIQUE case-insensitive → иначе ER_DUP_ENTRY).
     * @var array<string, array{display:string, hours:array<int, list<array{at:string, points:int, rank:int|null}>>}> $players
     */
    $players = [];
    foreach ($rows as $row) {
        $display = (string) ($row['player_name'] ?? '');
        if ($display === '') {
            continue;
        }
        $key = mb_strtolower($display, 'UTF-8');
        $at = (string) ($row['scraped_at'] ?? '');
        // Не доверяем только scraped_date_milan: сутки берём из scraped_at (ES)
        $snapDay = milan_date_from_utc($at);
        if ($snapDay === '' || $snapDay !== $day) {
            continue;
        }
        $hour = milan_hour_from_utc($at);
        if ($hour < 0 || $hour > 23) {
            continue;
        }
        if (milan_is_early_minutes_utc($at, player_hour_skip_first_minutes())) {
            continue;
        }
        $pts = (int) ($row['points'] ?? 0);
        $rankRaw = $row['rank'] ?? null;
        $rank = $rankRaw === null || $rankRaw === '' ? null : (int) $rankRaw;
        // нормализуем scraped_at к 'Y-m-d H:i:s' UTC
        $atNorm = $at;
        try {
            $raw = str_replace(' ', 'T', $at);
            if (!str_contains($raw, 'Z') && !preg_match('/[+-]\d{2}:?\d{2}$/', $raw)) {
                $raw .= 'Z';
            }
            $atNorm = (new DateTimeImmutable($raw))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            $atNorm = substr(str_replace('T', ' ', $at), 0, 19);
        }
        if (!isset($players[$key])) {
            $players[$key] = ['display' => $display, 'hours' => []];
        }
        $players[$key]['hours'][$hour][] = ['at' => $atNorm, 'points' => $pts, 'rank' => $rank];
    }

    $computedAt = gmdate('Y-m-d H:i:s');
    $firstSnapMax = player_hour_first_snap_max_points();
    $out = [];

    foreach ($players as $pack) {
        $name = $pack['display'];
        $byHour = $pack['hours'];
        $maxSoFar = null;
        $rankAtMax = null;
        $dayStarted = false;
        $prevHourMax = null;

        for ($h = 0; $h < 24; $h++) {
            $rawSnaps = $byHour[$h] ?? [];
            // До первого «нормального» снимка суток отбрасываем хвост вчера (points > порога)
            $snaps = [];
            foreach ($rawSnaps as $s) {
                $pts = (int) $s['points'];
                if (!$dayStarted) {
                    if ($pts > $firstSnapMax) {
                        continue;
                    }
                    $dayStarted = true;
                }
                $snaps[] = $s;
            }
            $hasSnap = $snaps !== [];

            $hourMin = null;
            $hourMax = null;
            $minAt = null;
            $maxAt = null;

            if ($hasSnap) {
                foreach ($snaps as $s) {
                    $pts = $s['points'];
                    $at = $s['at'];
                    $rank = $s['rank'];

                    if ($hourMin === null || $pts < $hourMin) {
                        $hourMin = $pts;
                        $minAt = $at;
                    } elseif ($pts === $hourMin && ($minAt === null || $at < $minAt)) {
                        $minAt = $at;
                    }

                    if ($hourMax === null || $pts > $hourMax) {
                        $hourMax = $pts;
                        $maxAt = $at;
                    } elseif ($pts === $hourMax && ($maxAt === null || $at > $maxAt)) {
                        $maxAt = $at;
                    }

                    // carry-max дня + rank при новом пике
                    if ($maxSoFar === null || $pts > $maxSoFar) {
                        $maxSoFar = $pts;
                        $rankAtMax = $rank;
                    } elseif ($pts === $maxSoFar && $rank !== null
                        && ($rankAtMax === null || $rank < $rankAtMax)) {
                        $rankAtMax = $rank;
                    }
                }
            }

            if ($maxSoFar === null) {
                continue;
            }

            $isFirstHour = $prevHourMax === null;

            // carry-only час: очки = carry, время = границы часа
            if (!$hasSnap) {
                $hourMin = $maxSoFar;
                $hourMax = $maxSoFar;
                [$minAt, $maxAt] = milan_hour_bounds_utc($day, $h);
            } elseif (!$isFirstHour && $hourMin === $hourMax) {
                [$minAt, $maxAt] = milan_hour_bounds_utc($day, $h);
            }

            [$diffPoints, $diffSeconds, $speed] = player_hour_within_hour_speed(
                $isFirstHour,
                (int) $hourMin,
                (int) $hourMax,
                $minAt,
                $maxAt,
                $day
            );
            $deltaHour = player_hour_delta_vs_prev($prevHourMax, (int) $hourMax);
            $prevHourMax = (int) $hourMax;

            $out[] = [
                'player_name' => $name,
                'day' => $day,
                'hour' => $h,
                'tournament_limit' => $limit,
                'max_points_carry' => $maxSoFar,
                'min_points_hour' => (int) $hourMin,
                'max_points_hour' => (int) $hourMax,
                'diff_points' => $diffPoints,
                'diff_seconds' => $diffSeconds,
                'delta_hour' => $deltaHour,
                'speed' => $speed,
                'rank_at_max' => $rankAtMax,
                'has_snapshot' => $hasSnap ? 1 : 0,
                'min_at' => $minAt,
                'max_at' => $maxAt,
                'computed_at' => $computedAt,
            ];
        }
    }

    return $out;
}

/**
 * @param list<array<string, mixed>> $rows
 */
function replace_player_hour_day_limit(PDO $pdo, string $day, string $limit, array $rows): int
{
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'DELETE FROM analytics_player_hour WHERE day = ? AND tournament_limit = ?'
        )->execute([$day, $limit]);

        if (!$rows) {
            $pdo->commit();
            return 0;
        }

        $chunkSize = 120;
        $n = 0;
        $chunks = array_chunk($rows, $chunkSize);
        foreach ($chunks as $chunk) {
            $placeholders = [];
            $params = [];
            foreach ($chunk as $r) {
                $placeholders[] = '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
                $params[] = $r['player_name'];
                $params[] = $r['day'];
                $params[] = $r['hour'];
                $params[] = $r['tournament_limit'];
                $params[] = $r['max_points_carry'];
                $params[] = $r['min_points_hour'];
                $params[] = $r['max_points_hour'];
                $params[] = $r['diff_points'];
                $params[] = $r['diff_seconds'];
                $params[] = $r['delta_hour'];
                $params[] = $r['speed'];
                $params[] = $r['rank_at_max'];
                $params[] = $r['has_snapshot'];
                $params[] = $r['min_at'];
                $params[] = $r['max_at'];
                $params[] = $r['computed_at'];
            }
            $sql = 'INSERT INTO analytics_player_hour
                (player_name, day, hour, tournament_limit, max_points_carry, min_points_hour, max_points_hour,
                 diff_points, diff_seconds, delta_hour, speed, rank_at_max, has_snapshot, min_at, max_at, computed_at)
                VALUES ' . implode(',', $placeholders);
            $pdo->prepare($sql)->execute($params);
            $n += count($chunk);
        }
        $pdo->commit();
        return $n;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/**
 * Σ по игрокам → 24 строки hour_slice (segment=all).
 *
 * @param list<array<string, mixed>> $phRows
 * @return list<array<string, mixed>>
 */
function aggregate_hour_slice_from_player_rows(string $day, string $limit, array $phRows): array
{
    $computedAt = gmdate('Y-m-d H:i:s');
    $sum = array_fill(0, 24, 0);
    $seen = array_fill(0, 24, 0);
    $active = array_fill(0, 24, 0);
    $hasRecords = array_fill(0, 24, false);
    $firstHour = [];

    foreach ($phRows as $r) {
        $h = (int) $r['hour'];
        if ($h < 0 || $h > 23) {
            continue;
        }
        $sum[$h] += (int) $r['max_points_carry'];
        $seen[$h]++;
        if (!empty($r['has_snapshot'])) {
            $active[$h]++;
            $hasRecords[$h] = true;
        }
        $name = (string) $r['player_name'];
        if (!isset($firstHour[$name]) || $h < $firstHour[$name]) {
            $firstHour[$name] = $h;
        }
    }

    $newCount = array_fill(0, 24, 0);
    foreach ($firstHour as $h0) {
        $newCount[$h0]++;
    }

    $out = [];
    for ($h = 0; $h < 24; $h++) {
        $prevCum = $h === 0 ? 0 : $sum[$h - 1];
        $rawVolume = $h === 0 ? $sum[$h] : max(0, $sum[$h] - $prevCum);
        $volume = ($h > 0 && !$hasRecords[$h - 1]) ? 0 : $rawVolume;
        $out[] = [
            'day' => $day,
            'hour' => $h,
            'tournament_limit' => $limit,
            'segment' => 'all',
            'players_seen' => $seen[$h],
            'players_new' => $newCount[$h],
            'players_active_hour' => $active[$h],
            'cumulative' => $sum[$h],
            'volume' => $volume,
            'has_records' => $hasRecords[$h] ? 1 : 0,
            'computed_at' => $computedAt,
        ];
    }
    return $out;
}

/**
 * Полный срез одного дня / одного лимита / segment=all.
 * Пишет player_hour и возвращает строки slice.
 *
 * @return array{playerRows:int, sliceRows:list<array<string,mixed>>}
 */
function rebuild_day_limit_pipeline(PDO $pdo, string $day, string $limit): array
{
    $phRows = build_player_hour_rows_for_day_limit($pdo, $day, $limit);
    $playerRows = replace_player_hour_day_limit($pdo, $day, $limit, $phRows);
    $sliceRows = aggregate_hour_slice_from_player_rows($day, $limit, $phRows);
    return [
        'playerRows' => $playerRows,
        'sliceRows' => $sliceRows,
    ];
}

function upsert_hour_slice_rows(PDO $pdo, array $rows): int
{
    if (!$rows) {
        return 0;
    }
    $sql = 'INSERT INTO analytics_hour_slice
        (day, hour, tournament_limit, segment, players_seen, players_new, players_active_hour,
         cumulative, volume, has_records, computed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          players_seen = VALUES(players_seen),
          players_new = VALUES(players_new),
          players_active_hour = VALUES(players_active_hour),
          cumulative = VALUES(cumulative),
          volume = VALUES(volume),
          has_records = VALUES(has_records),
          computed_at = VALUES(computed_at)';
    $stmt = $pdo->prepare($sql);
    $n = 0;
    foreach ($rows as $r) {
        $stmt->execute([
            $r['day'],
            $r['hour'],
            $r['tournament_limit'],
            $r['segment'],
            $r['players_seen'],
            $r['players_new'],
            $r['players_active_hour'],
            $r['cumulative'],
            $r['volume'],
            $r['has_records'],
            $r['computed_at'],
        ]);
        $n++;
    }
    return $n;
}

/**
 * @return array{dayFrom:string,dayTo:string,days:int,limits:list<string>,rowsUpserted:int,playerRowsUpserted?:int,segment:string}
 */
function run_job_over_days(PDO $pdo, ?string $dayFrom, ?string $dayTo, string $mode): array
{
    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    $today = milan_date_only();
    if ($dayTo === null || $dayTo === '') {
        $dayTo = $today;
    }
    if ($dayFrom === null || $dayFrom === '') {
        $back = $mode === 'player_hour' ? 14 : 60;
        $dayFrom = (new DateTimeImmutable($dayTo, $tz))->modify("-{$back} days")->format('Y-m-d');
    }
    if ($dayFrom > $dayTo) {
        throw new InvalidArgumentException('dayFrom > dayTo');
    }

    $limits = aggregate_limits();
    $playerUpserted = 0;
    $sliceUpserted = 0;
    $daysDone = 0;
    $noDataDays = 0;
    $cursor = new DateTimeImmutable($dayFrom, $tz);
    $end = new DateTimeImmutable($dayTo, $tz);

    while ($cursor <= $end) {
        $day = $cursor->format('Y-m-d');
        if ($mode === 'player_hour') {
            $dayResult = process_player_hour_day($pdo, $day);
            $playerUpserted += $dayResult['rowsUpserted'];
            if ($dayResult['status'] === 'no_data') {
                $noDataDays++;
            }
        } else {
            // hour_slice: сначала player_hour (+ no_data), затем SUM → slice
            $dayResult = process_player_hour_day($pdo, $day);
            $playerUpserted += $dayResult['rowsUpserted'];
            if ($dayResult['status'] === 'no_data') {
                $noDataDays++;
                $pdo->prepare('DELETE FROM analytics_hour_slice WHERE day = ? AND segment = ?')
                    ->execute([$day, 'all']);
            } else {
                foreach ($limits as $limit) {
                    $phRows = fetch_all(
                        $pdo,
                        'SELECT player_name, day, hour, tournament_limit, max_points_carry,
                                rank_at_max, has_snapshot, computed_at
                         FROM analytics_player_hour
                         WHERE day = ? AND tournament_limit = ?',
                        [$day, $limit]
                    );
                    $sliceRows = aggregate_hour_slice_from_player_rows($day, $limit, $phRows);
                    $sliceUpserted += upsert_hour_slice_rows($pdo, $sliceRows);
                }
            }
        }
        $daysDone++;
        $cursor = $cursor->modify('+1 day');
    }

    $meta = [
        'dayFrom' => $dayFrom,
        'dayTo' => $dayTo,
        'days' => $daysDone,
        'limits' => $limits,
        'rowsUpserted' => $mode === 'player_hour' ? $playerUpserted : $sliceUpserted,
        'noDataDays' => $noDataDays,
        'segment' => 'all',
    ];
    if ($mode === 'hour_slice') {
        $meta['playerRowsUpserted'] = $playerUpserted;
    }
    return $meta;
}

function run_job_player_hour(PDO $pdo, ?string $dayFrom, ?string $dayTo): array
{
    return run_job_over_days($pdo, $dayFrom, $dayTo, 'player_hour');
}

function run_job_hour_slice(PDO $pdo, ?string $dayFrom, ?string $dayTo): array
{
    return run_job_over_days($pdo, $dayFrom, $dayTo, 'hour_slice');
}

function handle_admin_job_run(PDO $pdo, string $id): void
{
    require_admin_token();
    ensure_aggregate_tables($pdo);

    $catalog = null;
    foreach (admin_tables_catalog() as $item) {
        if ($item['id'] === $id) {
            $catalog = $item;
            break;
        }
    }
    if (!$catalog || $catalog['status'] !== 'ready' || !$catalog['jobKey']) {
        json_error('Джоба недоступна для: ' . $id, 400);
    }

    $body = [];
    $raw = file_get_contents('php://input');
    if ($raw) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $body = $decoded;
        }
    }

    $daysBack = isset($body['daysBack']) ? (int) $body['daysBack'] : (int) ($catalog['defaultDaysBack'] ?? 60);
    $daysBack = max(0, min(400, $daysBack));
    $dayTo = isset($body['dayTo']) ? (string) $body['dayTo'] : milan_date_only();
    $dayFrom = isset($body['dayFrom'])
        ? (string) $body['dayFrom']
        : (new DateTimeImmutable($dayTo))->modify("-{$daysBack} days")->format('Y-m-d');

    $jobKey = $catalog['jobKey'];
    $started = gmdate('Y-m-d H:i:s');
    $pdo->prepare(
        'INSERT INTO analytics_job_runs (job_key, status, started_at) VALUES (?, ?, ?)'
    )->execute([$jobKey, 'running', $started]);
    $runId = (int) $pdo->lastInsertId();

    @set_time_limit(900);
    ignore_user_abort(true);

    try {
        if ($jobKey === 'player_hour') {
            $meta = run_job_player_hour($pdo, $dayFrom, $dayTo);
        } elseif ($jobKey === 'hour_slice') {
            $meta = run_job_hour_slice($pdo, $dayFrom, $dayTo);
        } elseif ($jobKey === 'scrape_hour') {
            $meta = run_job_scrape_hour($pdo, $dayFrom, $dayTo);
        } else {
            throw new RuntimeException('Unknown job');
        }
        $finished = gmdate('Y-m-d H:i:s');
        $msg = sprintf(
            'OK: %s…%s, %d дн., %d строк',
            $meta['dayFrom'],
            $meta['dayTo'],
            $meta['days'],
            $meta['rowsUpserted']
        );
        if (!empty($meta['playerRowsUpserted'])) {
            $msg .= sprintf(', player_hour=%d', $meta['playerRowsUpserted']);
        }
        $pdo->prepare(
            'UPDATE analytics_job_runs SET status = ?, finished_at = ?, message = ?, meta_json = ? WHERE id = ?'
        )->execute(['ok', $finished, $msg, json_encode($meta, JSON_UNESCAPED_UNICODE), $runId]);

        json_response([
            'ok' => true,
            'run' => job_last_run($pdo, $jobKey),
            'stats' => aggregate_table_stats($pdo, $catalog['tableName']),
        ]);
    } catch (Throwable $e) {
        $finished = gmdate('Y-m-d H:i:s');
        $pdo->prepare(
            'UPDATE analytics_job_runs SET status = ?, finished_at = ?, message = ? WHERE id = ?'
        )->execute(['error', $finished, $e->getMessage(), $runId]);
        json_error('Job failed: ' . $e->getMessage(), 500);
    }
}

/**
 * Календарь покрытия analytics_player_hour за диапазон (по умолчанию с 2026-04-01).
 * Часы/дыры — из analytics_scrape_hour; лимиты — лёгкий GROUP BY snapshots.
 */
function handle_admin_player_hour_coverage(PDO $pdo): void
{
    require_admin_token();
    ensure_aggregate_tables($pdo);

    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    $today = milan_date_only();
    $dayFrom = isset($_GET['dayFrom']) ? substr((string) $_GET['dayFrom'], 0, 10) : '2026-04-01';
    $dayTo = isset($_GET['dayTo']) ? substr((string) $_GET['dayTo'], 0, 10) : $today;
    if ($dayFrom > $dayTo) {
        json_error('dayFrom > dayTo', 400);
    }

    $limitsWanted = aggregate_limits();
    $scrapeMap = preload_scrape_hours_map($pdo, $dayFrom, $dayTo);
    $limitsMap = preload_source_limits_map($pdo, $dayFrom, $dayTo, $limitsWanted);
    $preAgg = preload_agg_day_hours($pdo, $dayFrom, $dayTo);

    // Собираем preSrc: часы из scrape_hour, лимиты/count из snapshots
    $preSrc = [];
    $cursorMerge = new DateTimeImmutable($dayFrom, $tz);
    $endMerge = new DateTimeImmutable($dayTo, $tz);
    while ($cursorMerge <= $endMerge) {
        $d = $cursorMerge->format('Y-m-d');
        $limPack = $limitsMap[$d] ?? ['limits' => [], 'n' => 0];
        $sc = $scrapeMap[$d] ?? null;
        $preSrc[$d] = [
            'limits' => $limPack['limits'],
            'hours' => $sc['hours'] ?? empty_hour_flags(),
            'n' => (int) ($limPack['n'] ?? 0),
            'scrapeReady' => $sc !== null,
        ];
        $cursorMerge = $cursorMerge->modify('+1 day');
    }

    $dayMetaRows = fetch_all(
        $pdo,
        'SELECT day, status, source_snapshots, row_count, limits_n, computed_at, note
         FROM analytics_player_hour_day
         WHERE day >= ? AND day <= ?',
        [$dayFrom, $dayTo]
    );
    $dayMeta = [];
    foreach ($dayMetaRows as $row) {
        $dayMeta[substr((string) $row['day'], 0, 10)] = $row;
    }

    $days = [];
    $counts = [
        'ok' => 0,
        'empty' => 0,
        'partial' => 0,
        'no_data' => 0,
        'subset' => 0,
        'today' => 0,
    ];
    $scrapeMissingDays = 0;
    $cursor = new DateTimeImmutable($dayFrom, $tz);
    $endDt = new DateTimeImmutable($dayTo, $tz);
    while ($cursor <= $endDt) {
        $d = $cursor->format('Y-m-d');
        $meta = $dayMeta[$d] ?? null;
        $pack = collect_player_hour_day_facts(
            $pdo,
            $d,
            $today,
            $limitsWanted,
            $meta,
            $preSrc,
            $preAgg
        );
        $status = $pack['classified']['status'];
        if (isset($counts[$status])) {
            $counts[$status]++;
        }
        if (empty($pack['scrapeReady'])) {
            $scrapeMissingDays++;
        }

        if ($status === 'no_data' && (!$meta || (string) $meta['status'] !== 'no_data')) {
            upsert_player_hour_day_status(
                $pdo,
                $d,
                'no_data',
                0,
                0,
                0,
                $pack['classified']['note']
            );
        }

        $days[] = [
            'day' => $d,
            'status' => $status,
            'rowCount' => $pack['rowCount'],
            'players' => $pack['players'],
            'limitsN' => $pack['limitsN'],
            'limitsWanted' => count($limitsWanted),
            'limits' => $limitsWanted,
            'limitFlags' => $pack['limitFlags'],
            'scrapeReady' => !empty($pack['scrapeReady']),
            'reasons' => $pack['classified']['reasons'],
            'sourceSnapshots' => $pack['sourceSnapshots'],
            'note' => $pack['classified']['note'] ?? ($meta['note'] ?? null),
            'computedAt' => $meta['computed_at'] ?? null,
        ];
        $cursor = $cursor->modify('+1 day');
    }

    $nextEmpty = null;
    foreach ($days as $d) {
        if ($d['status'] === 'empty' || $d['status'] === 'partial') {
            $nextEmpty = $d['day'];
            break;
        }
    }

    json_response([
        'dayFrom' => $dayFrom,
        'dayTo' => $dayTo,
        'limits' => $limitsWanted,
        'summary' => [
            'totalDays' => count($days),
            'ok' => $counts['ok'],
            'partial' => $counts['partial'],
            'empty' => $counts['empty'],
            'noData' => $counts['no_data'],
            'subset' => $counts['subset'],
            'today' => $counts['today'],
            'nextEmpty' => $nextEmpty,
            'scrapeMissingDays' => $scrapeMissingDays,
            'tableRows' => (int) (aggregate_table_stats($pdo, 'analytics_player_hour')['rowCount'] ?? 0),
        ],
        'days' => $days,
    ]);
}

function handle_admin_player_hour_run_day(PDO $pdo): void
{
    require_admin_token();
    ensure_aggregate_tables($pdo);

    $body = read_json_body();
    $day = isset($body['day']) ? substr((string) $body['day'], 0, 10) : '';
    if ($day === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        json_error('Нужен day=YYYY-MM-DD', 400);
    }

    $started = gmdate('Y-m-d H:i:s');
    $pdo->prepare(
        'INSERT INTO analytics_job_runs (job_key, status, started_at) VALUES (?, ?, ?)'
    )->execute(['player_hour', 'running', $started]);
    $runId = (int) $pdo->lastInsertId();

    @set_time_limit(300);
    @ini_set('memory_limit', '512M');
    ignore_user_abort(true);

    try {
        $meta = run_job_player_hour($pdo, $day, $day);
        $finished = gmdate('Y-m-d H:i:s');
        $msg = sprintf('OK day %s, %d строк', $day, $meta['rowsUpserted']);
        if (!empty($meta['noDataDays'])) {
            $msg = sprintf('OK day %s: нет данных в snapshots (no_data)', $day);
        }
        $pdo->prepare(
            'UPDATE analytics_job_runs SET status = ?, finished_at = ?, message = ?, meta_json = ? WHERE id = ?'
        )->execute(['ok', $finished, $msg, json_encode($meta, JSON_UNESCAPED_UNICODE), $runId]);

        json_response([
            'ok' => true,
            'day' => $day,
            'meta' => $meta,
            'run' => job_last_run($pdo, 'player_hour'),
            'stats' => aggregate_table_stats($pdo, 'analytics_player_hour'),
        ]);
    } catch (Throwable $e) {
        $finished = gmdate('Y-m-d H:i:s');
        $pdo->prepare(
            'UPDATE analytics_job_runs SET status = ?, finished_at = ?, message = ? WHERE id = ?'
        )->execute(['error', $finished, $e->getMessage(), $runId]);
        json_error('Job failed: ' . $e->getMessage(), 500);
    }
}

/**
 * Матрица day × hour для analytics_scrape_hour (heatmap downtime).
 */
function handle_admin_scrape_hour_coverage(PDO $pdo): void
{
    require_admin_token();
    ensure_aggregate_tables($pdo);

    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    $today = milan_date_only();
    $dayFrom = isset($_GET['dayFrom']) ? substr((string) $_GET['dayFrom'], 0, 10) : '2026-04-01';
    $dayTo = isset($_GET['dayTo']) ? substr((string) $_GET['dayTo'], 0, 10) : $today;
    if ($dayFrom > $dayTo) {
        json_error('dayFrom > dayTo', 400);
    }

    $rows = fetch_all(
        $pdo,
        'SELECT day, hour, snapshot_count, has_data, status, computed_at
         FROM analytics_scrape_hour
         WHERE day >= ? AND day <= ?
         ORDER BY day ASC, hour ASC',
        [$dayFrom, $dayTo]
    );
    $byDay = [];
    foreach ($rows as $r) {
        $d = substr((string) $r['day'], 0, 10);
        if (!isset($byDay[$d])) {
            $byDay[$d] = array_fill(0, 24, null);
        }
        $h = (int) ($r['hour'] ?? -1);
        if ($h >= 0 && $h <= 23) {
            $byDay[$d][$h] = [
                'status' => (string) ($r['status'] ?? 'pending'),
                'count' => (int) ($r['snapshot_count'] ?? 0),
                'hasData' => !empty($r['has_data']),
            ];
        }
    }

    $days = [];
    $ok = 0;
    $down = 0;
    $pending = 0;
    $missing = 0;
    $cursor = new DateTimeImmutable($dayFrom, $tz);
    $end = new DateTimeImmutable($dayTo, $tz);
    while ($cursor <= $end) {
        $d = $cursor->format('Y-m-d');
        $cells = [];
        for ($h = 0; $h < 24; $h++) {
            $cell = $byDay[$d][$h] ?? null;
            if ($cell === null) {
                // Нет строки в таблице: для уже прошедших часов это простой сервера
                // (сутки целиком без сырья раньше часто не пересчитывали → «missing»).
                $hourNow = milan_hour_now();
                $isPast = $d < $today || ($d === $today && $h <= $hourNow);
                if ($isPast) {
                    $down++;
                    $cells[] = [
                        'hour' => $h,
                        'status' => 'down',
                        'count' => 0,
                        'inferred' => true,
                    ];
                } else {
                    $missing++;
                    $cells[] = ['hour' => $h, 'status' => 'missing', 'count' => 0];
                }
            } else {
                $status = $cell['status'];
                if ($status === 'ok') {
                    $ok++;
                } elseif ($status === 'down') {
                    $down++;
                } else {
                    $pending++;
                }
                $cells[] = [
                    'hour' => $h,
                    'status' => $status,
                    'count' => $cell['count'],
                ];
            }
        }
        $days[] = [
            'day' => $d,
            'monthKey' => substr($d, 0, 7),
            'hours' => $cells,
        ];
        $cursor = $cursor->modify('+1 day');
    }

    json_response([
        'dayFrom' => $dayFrom,
        'dayTo' => $dayTo,
        'summary' => [
            'totalDays' => count($days),
            'ok' => $ok,
            'down' => $down,
            'pending' => $pending,
            'missing' => $missing,
            'tableRows' => (int) (aggregate_table_stats($pdo, 'analytics_scrape_hour')['rowCount'] ?? 0),
        ],
        'days' => $days,
    ]);
}

/**
 * Секрет для машинных вызовов (Node-тикер), не сессия админки.
 */
function require_cron_secret(): void
{
    $expected = trim((string) (env('ANALYTICS_CRON_SECRET', '') ?? ''));
    if ($expected === '') {
        json_error('Задайте ANALYTICS_CRON_SECRET в v2/analytics/.env', 503);
    }
    $got = (string) ($_SERVER['HTTP_X_ANALYTICS_CRON_SECRET'] ?? '');
    if ($got === '' || !hash_equals($expected, $got)) {
        json_error('Forbidden', 403);
    }
}

function cron_secret_configured(): bool
{
    return trim((string) (env('ANALYTICS_CRON_SECRET', '') ?? '')) !== '';
}

/**
 * @return array{jobKey:string,enabled:bool,intervalMinutes:int,lastRunAt:?string,lastStatus:?string,lastMessage:?string,updatedAt:?string}
 */
function player_hour_schedule_row(PDO $pdo): array
{
    ensure_aggregate_tables($pdo);
    $row = fetch_one(
        $pdo,
        'SELECT job_key, enabled, interval_minutes, last_run_at, last_status, last_message, updated_at
         FROM analytics_job_schedule WHERE job_key = ? LIMIT 1',
        ['player_hour_today']
    );
    if (!$row) {
        $now = gmdate('Y-m-d H:i:s');
        $pdo->prepare(
            'INSERT INTO analytics_job_schedule
             (job_key, enabled, interval_minutes, last_run_at, last_status, last_message, updated_at)
             VALUES (?, 0, 10, NULL, NULL, NULL, ?)'
        )->execute(['player_hour_today', $now]);
        return [
            'jobKey' => 'player_hour_today',
            'enabled' => false,
            'intervalMinutes' => 10,
            'lastRunAt' => null,
            'lastStatus' => null,
            'lastMessage' => null,
            'updatedAt' => $now,
        ];
    }
    return [
        'jobKey' => (string) $row['job_key'],
        'enabled' => (int) $row['enabled'] === 1,
        'intervalMinutes' => max(1, (int) $row['interval_minutes']),
        'lastRunAt' => $row['last_run_at'] ? (string) $row['last_run_at'] : null,
        'lastStatus' => $row['last_status'] ? (string) $row['last_status'] : null,
        'lastMessage' => $row['last_message'] ? (string) $row['last_message'] : null,
        'updatedAt' => $row['updated_at'] ? (string) $row['updated_at'] : null,
    ];
}

/**
 * @param array{jobKey:string,enabled:bool,intervalMinutes:int,lastRunAt:?string,lastStatus:?string,lastMessage:?string,updatedAt:?string} $sched
 */
function player_hour_schedule_next_run_at(array $sched): ?string
{
    if (!$sched['enabled']) {
        return null;
    }
    $interval = max(1, (int) $sched['intervalMinutes']);
    if (!$sched['lastRunAt']) {
        return gmdate('Y-m-d H:i:s');
    }
    $ts = strtotime($sched['lastRunAt'] . ' UTC');
    if ($ts === false) {
        return gmdate('Y-m-d H:i:s');
    }
    return gmdate('Y-m-d H:i:s', $ts + $interval * 60);
}

function handle_admin_player_hour_schedule_get(PDO $pdo): void
{
    require_admin_token();
    $sched = player_hour_schedule_row($pdo);
    json_response([
        'ok' => true,
        'schedule' => $sched,
        'nextRunAt' => player_hour_schedule_next_run_at($sched),
        'cronSecretConfigured' => cron_secret_configured(),
        'todayEs' => milan_date_only(),
        'serverTimeUtc' => gmdate('c'),
    ]);
}

function handle_admin_player_hour_schedule_save(PDO $pdo): void
{
    require_admin_token();
    ensure_aggregate_tables($pdo);
    $body = read_json_body();
    $enabled = !empty($body['enabled']);
    $interval = isset($body['intervalMinutes']) ? (int) $body['intervalMinutes'] : 10;
    if ($interval < 1 || $interval > 1440) {
        json_error('intervalMinutes: от 1 до 1440', 400);
    }
    player_hour_schedule_row($pdo);
    $now = gmdate('Y-m-d H:i:s');
    $pdo->prepare(
        'UPDATE analytics_job_schedule
         SET enabled = ?, interval_minutes = ?, updated_at = ?
         WHERE job_key = ?'
    )->execute([$enabled ? 1 : 0, $interval, $now, 'player_hour_today']);

    $sched = player_hour_schedule_row($pdo);
    json_response([
        'ok' => true,
        'schedule' => $sched,
        'nextRunAt' => player_hour_schedule_next_run_at($sched),
        'cronSecretConfigured' => cron_secret_configured(),
        'todayEs' => milan_date_only(),
        'serverTimeUtc' => gmdate('c'),
    ]);
}

function player_hour_schedule_mark(PDO $pdo, string $status, string $message): void
{
    $now = gmdate('Y-m-d H:i:s');
    $pdo->prepare(
        'UPDATE analytics_job_schedule
         SET last_run_at = ?, last_status = ?, last_message = ?, updated_at = ?
         WHERE job_key = ?'
    )->execute([$now, $status, substr($message, 0, 1000), $now, 'player_hour_today']);
}

/**
 * Тикер: если расписание включено и интервал прошёл — пересобрать сегодня ES.
 * Вызывается с сервера сбора (Node) раз в минуту.
 */
function handle_cron_player_hour_today(PDO $pdo): void
{
    require_cron_secret();
    ensure_aggregate_tables($pdo);

    $sched = player_hour_schedule_row($pdo);
    if (!$sched['enabled']) {
        json_response([
            'ok' => true,
            'ran' => false,
            'reason' => 'disabled',
            'schedule' => $sched,
            'nextRunAt' => null,
        ]);
    }

    $next = player_hour_schedule_next_run_at($sched);
    $nowTs = time();
    $nextTs = $next ? strtotime($next . ' UTC') : $nowTs;
    if ($nextTs !== false && $nowTs < $nextTs) {
        json_response([
            'ok' => true,
            'ran' => false,
            'reason' => 'too_soon',
            'schedule' => $sched,
            'nextRunAt' => $next,
            'serverTimeUtc' => gmdate('c'),
        ]);
    }

    $running = fetch_one(
        $pdo,
        "SELECT id FROM analytics_job_runs
         WHERE job_key = 'player_hour' AND status = 'running'
           AND started_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 45 MINUTE)
         LIMIT 1"
    );
    if ($running) {
        json_response([
            'ok' => true,
            'ran' => false,
            'reason' => 'busy',
            'schedule' => $sched,
            'nextRunAt' => $next,
        ]);
    }

    $day = milan_date_only();
    $started = gmdate('Y-m-d H:i:s');
    $pdo->prepare(
        'INSERT INTO analytics_job_runs (job_key, status, started_at) VALUES (?, ?, ?)'
    )->execute(['player_hour', 'running', $started]);
    $runId = (int) $pdo->lastInsertId();

    @set_time_limit(300);
    @ini_set('memory_limit', '512M');
    ignore_user_abort(true);

    try {
        $meta = run_job_player_hour($pdo, $day, $day);
        $finished = gmdate('Y-m-d H:i:s');
        $msg = sprintf('auto today %s, %d строк', $day, $meta['rowsUpserted']);
        if (!empty($meta['noDataDays'])) {
            $msg = sprintf('auto today %s: нет данных в snapshots (no_data)', $day);
        }
        $pdo->prepare(
            'UPDATE analytics_job_runs SET status = ?, finished_at = ?, message = ?, meta_json = ? WHERE id = ?'
        )->execute(['ok', $finished, $msg, json_encode($meta, JSON_UNESCAPED_UNICODE), $runId]);
        player_hour_schedule_mark($pdo, 'ok', $msg);

        $sched = player_hour_schedule_row($pdo);
        json_response([
            'ok' => true,
            'ran' => true,
            'day' => $day,
            'meta' => $meta,
            'message' => $msg,
            'schedule' => $sched,
            'nextRunAt' => player_hour_schedule_next_run_at($sched),
        ]);
    } catch (Throwable $e) {
        $finished = gmdate('Y-m-d H:i:s');
        $pdo->prepare(
            'UPDATE analytics_job_runs SET status = ?, finished_at = ?, message = ? WHERE id = ?'
        )->execute(['error', $finished, $e->getMessage(), $runId]);
        player_hour_schedule_mark($pdo, 'error', $e->getMessage());
        json_error('Cron player_hour today failed: ' . $e->getMessage(), 500);
    }
}
