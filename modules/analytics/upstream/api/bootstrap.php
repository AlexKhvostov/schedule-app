<?php
/**
 * Bootstrap: .env, PDO, CORS helpers for analytics API.
 */

declare(strict_types=1);

const ANALYTICS_LIMITS = ['50', '100', '250'];

function analytics_root(): string
{
    return dirname(__DIR__);
}

function load_env(string $path): void
{
    if (!is_readable($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        if (!str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (
            (str_starts_with($value, '"') && str_ends_with($value, '"')) ||
            (str_starts_with($value, "'") && str_ends_with($value, "'"))
        ) {
            $value = substr($value, 1, -1);
        }
        if ($key !== '' && getenv($key) === false) {
            putenv("$key=$value");
            $_ENV[$key] = $value;
        }
    }
}

function env(string $key, ?string $default = null): ?string
{
    $v = $_ENV[$key] ?? getenv($key);
    if ($v === false || $v === null || $v === '') {
        return $default;
    }
    return (string) $v;
}

load_env(analytics_root() . DIRECTORY_SEPARATOR . '.env');

function settings(): array
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $cached = [
        'mysql' => [
            'host' => env('MYSQL_HOST', ''),
            'port' => (int) env('MYSQL_PORT', '3306'),
            'user' => env('MYSQL_USERNAME', ''),
            'password' => env('MYSQL_PASSWORD', ''),
            'database' => env('MYSQL_DATABASE', ''),
        ],
        // Сутки лидерборда = Испания (Madrid ≈ civil time Rome; канон — Madrid)
        'timezone' => env('TIMEZONE', 'Europe/Madrid'),
        'envPath' => analytics_root() . DIRECTORY_SEPARATOR . '.env',
    ];
    return $cached;
}

function validate_settings(): void
{
    $s = settings();
    $missing = [];
    if ($s['mysql']['host'] === '') {
        $missing[] = 'MYSQL_HOST';
    }
    if ($s['mysql']['user'] === '') {
        $missing[] = 'MYSQL_USERNAME';
    }
    if ($s['mysql']['database'] === '') {
        $missing[] = 'MYSQL_DATABASE';
    }
    if ($missing) {
        json_error(
            'Заполните ' . $s['envPath'] . ' (см. .env.example). Не хватает: ' . implode(', ', $missing),
            500
        );
    }
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    validate_settings();
    $s = settings()['mysql'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $s['host'],
        $s['port'],
        $s['database']
    );
    $pdo = new PDO($dsn, $s['user'], $s['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    // DATETIME as strings (UTC-ish), like Node dateStrings
    $pdo->exec("SET time_zone = '+00:00'");
    ensure_regs_table($pdo);
    ensure_player_notes_table($pdo);
    ensure_snapshot_indexes($pdo);
    // Сборные таблицы создаём лениво из admin; здесь не обязательно
    return $pdo;
}

function ensure_regs_table(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS analytics_regs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_name VARCHAR(255) NOT NULL,
            side ENUM('ours', 'theirs') NOT NULL DEFAULT 'ours',
            note VARCHAR(500) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_player_name (player_name)
        )
    ");
}

function ensure_player_notes_table(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS analytics_player_notes (
            player_name VARCHAR(255) NOT NULL,
            note TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (player_name)
        )
    ");
}

/**
 * Индексы для быстрых профилей/фильтров. Безопасно: не создаёт, если уже есть.
 */
function ensure_snapshot_indexes(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    $wanted = [
        'idx_ts_player_name' => 'player_name',
        'idx_ts_scraped_at' => 'scraped_at',
        'idx_ts_player_date' => 'player_name, scraped_date_milan',
        'idx_ts_player_limit_date' => 'player_name, tournament_limit, scraped_date_milan',
        'idx_ts_date_limit' => 'scraped_date_milan, tournament_limit',
    ];

    try {
        $existing = [];
        $rows = $pdo->query('SHOW INDEX FROM tournament_snapshots')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $existing[strtolower((string) $row['Key_name'])] = true;
        }
        foreach ($wanted as $name => $cols) {
            if (isset($existing[strtolower($name)])) {
                continue;
            }
            // Не дублируем смысл уже существующего индекса с тем же набором колонок
            $pdo->exec("CREATE INDEX `{$name}` ON tournament_snapshots ({$cols})");
        }
    } catch (Throwable $e) {
        // Индексы — ускорение, не блокер старта API
        error_log('ensure_snapshot_indexes: ' . $e->getMessage());
    }
}

function milan_date_only(?DateTimeInterface $date = null): string
{
    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    $d = $date ? DateTimeImmutable::createFromInterface($date) : new DateTimeImmutable('now');
    return $d->setTimezone($tz)->format('Y-m-d');
}

/** Текущий час Europe/Madrid (0–23). */
function milan_hour_now(?DateTimeInterface $date = null): int
{
    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    $d = $date ? DateTimeImmutable::createFromInterface($date) : new DateTimeImmutable('now');
    return (int) $d->setTimezone($tz)->format('G');
}

/**
 * Границы часа ES в UTC: [start, end) как DATETIME-строки.
 *
 * @return array{0:string,1:string}
 */
function milan_hour_bounds_utc(string $day, int $hour): array
{
    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    $utc = new DateTimeZone('UTC');
    $start = new DateTimeImmutable(
        sprintf('%s %02d:00:00', $day, $hour),
        $tz
    );
    $end = $start->modify('+1 hour');
    return [
        $start->setTimezone($utc)->format('Y-m-d H:i:s'),
        $end->setTimezone($utc)->format('Y-m-d H:i:s'),
    ];
}

/** Разница секунд между двумя UTC DATETIME (from → to). */
function utc_datetime_diff_seconds(string $fromUtc, string $toUtc): int
{
    try {
        $a = new DateTimeImmutable(str_replace(' ', 'T', $fromUtc) . 'Z');
        $b = new DateTimeImmutable(str_replace(' ', 'T', $toUtc) . 'Z');
        return (int) ($b->getTimestamp() - $a->getTimestamp());
    } catch (Exception $e) {
        return 0;
    }
}

function send_cors(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function json_response(mixed $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $message, int $code = 400): void
{
    json_response(['error' => $message], $code);
}

function request_path(): string
{
    // Надёжный режим без PATH_INFO (Hostland): api/index.php?__route=/api/home
    $route = $_GET['__route'] ?? null;
    if (is_string($route) && $route !== '') {
        $route = trim($route);
        if ($route[0] !== '/') {
            $route = '/' . $route;
        }
        return $route;
    }

    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH) ?: '/';

    // Некоторые хосты: /dashboard/api/index.php/home или PATH_INFO=/home
    if (preg_match('#/api/index\.php(/.*)?$#', $path, $m)) {
        $rest = $m[1] ?? '';
        if ($rest === '' || $rest === '/') {
            $pi = (string) ($_SERVER['PATH_INFO'] ?? $_SERVER['ORIG_PATH_INFO'] ?? '');
            if ($pi !== '' && $pi !== '/') {
                return '/api' . (str_starts_with($pi, '/') ? $pi : '/' . $pi);
            }
            return '/health';
        }
        // /api/index.php/home → /api/home
        return '/api' . $rest;
    }

    // Hostland subdirectory: /dashboard/api/home → /api/home
    if (preg_match('#(/api(?:/.*)?|/health)$#', $path, $m)) {
        $p = $m[1];
        if ($p === '/api' || $p === '/api/') {
            return '/health';
        }
        return $p;
    }
    return $path;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function parse_list(mixed $value): array
{
    if (is_array($value)) {
        return array_values(array_filter(array_map(static fn($s) => trim((string) $s), $value)));
    }
    if ($value === null || $value === '') {
        return [];
    }
    return array_values(array_filter(array_map('trim', explode(',', (string) $value))));
}

function query_filters(): array
{
    $dateFrom = $_GET['dateFrom'] ?? milan_date_only();
    $dateTo = $_GET['dateTo'] ?? $dateFrom;
    $limits = parse_list($_GET['limits'] ?? null);
    if (!$limits) {
        $limits = ANALYTICS_LIMITS;
    }
    $players = parse_list($_GET['players'] ?? null);
    $segment = $_GET['segment'] ?? 'all';
    return compact('dateFrom', 'dateTo', 'limits', 'players', 'segment');
}

function build_snapshot_filters(array $opts): array
{
    $where = ['1=1'];
    $params = [];

    if (!empty($opts['dateFrom'])) {
        $where[] = 'scraped_date_milan >= ?';
        $params[] = $opts['dateFrom'];
    }
    if (!empty($opts['dateTo'])) {
        $where[] = 'scraped_date_milan <= ?';
        $params[] = $opts['dateTo'];
    }
    if (!empty($opts['limits'])) {
        $ph = implode(',', array_fill(0, count($opts['limits']), '?'));
        $where[] = "tournament_limit IN ($ph)";
        array_push($params, ...$opts['limits']);
    }
    if (!empty($opts['players'])) {
        $ph = implode(',', array_fill(0, count($opts['players']), '?'));
        $where[] = "player_name IN ($ph)";
        array_push($params, ...$opts['players']);
    }

    $regs = $opts['regs'] ?? [];
    $regNames = array_column($regs, 'player_name');
    $ours = array_values(array_map(
        static fn($r) => $r['player_name'],
        array_filter($regs, static fn($r) => ($r['side'] ?? '') === 'ours')
    ));
    $theirs = array_values(array_map(
        static fn($r) => $r['player_name'],
        array_filter($regs, static fn($r) => ($r['side'] ?? '') === 'theirs')
    ));
    $segment = $opts['segment'] ?? 'all';

    if ($segment === 'regs' && $regNames) {
        $ph = implode(',', array_fill(0, count($regNames), '?'));
        $where[] = "player_name IN ($ph)";
        array_push($params, ...$regNames);
    } elseif ($segment === 'ours' && $ours) {
        $ph = implode(',', array_fill(0, count($ours), '?'));
        $where[] = "player_name IN ($ph)";
        array_push($params, ...$ours);
    } elseif ($segment === 'theirs' && $theirs) {
        $ph = implode(',', array_fill(0, count($theirs), '?'));
        $where[] = "player_name IN ($ph)";
        array_push($params, ...$theirs);
    } elseif ($segment === 'nonregs' && $regNames) {
        $ph = implode(',', array_fill(0, count($regNames), '?'));
        $where[] = "player_name NOT IN ($ph)";
        array_push($params, ...$regNames);
    } elseif ($segment === 'not_ours' && $ours) {
        $ph = implode(',', array_fill(0, count($ours), '?'));
        $where[] = "player_name NOT IN ($ph)";
        array_push($params, ...$ours);
    } elseif ($segment === 'not_theirs' && $theirs) {
        $ph = implode(',', array_fill(0, count($theirs), '?'));
        $where[] = "player_name NOT IN ($ph)";
        array_push($params, ...$theirs);
    } elseif (in_array($segment, ['regs', 'ours', 'theirs'], true) && !$regNames) {
        $where[] = '1=0';
    } elseif ($segment === 'ours' && !$ours) {
        $where[] = '1=0';
    } elseif ($segment === 'theirs' && !$theirs) {
        $where[] = '1=0';
    }

    return ['whereSql' => implode(' AND ', $where), 'params' => $params];
}

function fetch_all(PDO $pdo, string $sql, array $params = []): array
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function fetch_one(PDO $pdo, string $sql, array $params = []): ?array
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function milan_hour_from_utc(string $hourUtc): int
{
    $raw = str_replace(' ', 'T', $hourUtc) . (str_contains($hourUtc, 'Z') || str_contains($hourUtc, '+') ? '' : 'Z');
    try {
        $dt = new DateTimeImmutable($raw);
    } catch (Exception $e) {
        return 0;
    }
    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    return (int) $dt->setTimezone($tz)->format('G');
}

/** Календарная дата Europe/Madrid из UTC scraped_at (YYYY-MM-DD). */
function milan_date_from_utc(string $hourUtc): string
{
    $raw = str_replace(' ', 'T', $hourUtc);
    if (!str_contains($hourUtc, 'Z') && !preg_match('/[+-]\d{2}:?\d{2}$/', $hourUtc)) {
        $raw .= 'Z';
    }
    try {
        $dt = new DateTimeImmutable($raw);
    } catch (Exception $e) {
        return '';
    }
    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    return $dt->setTimezone($tz)->format('Y-m-d');
}

/**
 * Порог «первого валидного» снимка суток ES.
 * Первое появление с points > порога считаем хвостом вчера (до сброса лидерборда).
 */
function player_hour_first_snap_max_points(): int
{
    $n = (int) (env('PLAYER_HOUR_FIRST_SNAP_MAX', '50') ?? '50');
    return max(0, min(500, $n));
}

/** Сколько первых минут суток ES игнорировать в сырье (хвост вчерашнего сбора). */
function player_hour_skip_first_minutes(): int
{
    $n = (int) (env('PLAYER_HOUR_SKIP_FIRST_MINUTES', '5') ?? '5');
    return max(0, min(30, $n));
}

/** true, если scraped_at попадает в первые N минут суток Europe/Madrid. */
function milan_is_early_minutes_utc(string $hourUtc, int $skipMinutes): bool
{
    if ($skipMinutes <= 0) {
        return false;
    }
    $raw = str_replace(' ', 'T', $hourUtc);
    if (!str_contains($hourUtc, 'Z') && !preg_match('/[+-]\d{2}:?\d{2}$/', $hourUtc)) {
        $raw .= 'Z';
    }
    try {
        $dt = new DateTimeImmutable($raw);
    } catch (Exception $e) {
        return false;
    }
    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    $local = $dt->setTimezone($tz);
    if ((int) $local->format('G') !== 0) {
        return false;
    }
    return ((int) $local->format('i') * 60 + (int) $local->format('s')) < $skipMinutes * 60;
}

/**
 * Скорость внутри часа: max−min и |max_at−min_at|.
 * Первое появление за день (час 0 или позже): max−0, max_at − 00:00 ES.
 *
 * @return array{0:int,1:int,2:?float}
 */
function player_hour_within_hour_speed(
    bool $isFirstHour,
    int $hourMin,
    int $hourMax,
    ?string $minAt,
    ?string $maxAt,
    string $day
): array {
    if ($isFirstHour) {
        $diffPoints = max(0, $hourMax);
        $from = milan_hour_bounds_utc($day, 0)[0];
        $to = $maxAt ?: $from;
    } else {
        $diffPoints = max(0, $hourMax - $hourMin);
        $from = $minAt ?: ($maxAt ?: milan_hour_bounds_utc($day, 0)[0]);
        $to = $maxAt ?: $from;
    }
    $diffSeconds = max(0, utc_datetime_diff_seconds((string) $from, (string) $to));
    $speed = $diffSeconds > 0 ? round($diffPoints / $diffSeconds * 3600, 6) : null;
    return [$diffPoints, $diffSeconds, $speed];
}

/**
 * Междучасовая разница: max часа − max прошлого часа (час 0 / первое появление: max − 0).
 */
function player_hour_delta_vs_prev(?int $prevHourMax, int $hourMax): int
{
    if ($prevHourMax === null) {
        return max(0, $hourMax);
    }
    return max(0, $hourMax - $prevHourMax);
}

function parse_utc_ms(string $at): int
{
    $raw = trim($at);
    if ($raw === '') {
        return 0;
    }
    if (!str_contains($raw, 'T')) {
        $raw = str_replace(' ', 'T', $raw) . 'Z';
    } elseif (!str_ends_with($raw, 'Z') && !preg_match('/[+-]\d{2}:?\d{2}$/', $raw)) {
        $raw .= 'Z';
    }
    try {
        return (int) (new DateTimeImmutable($raw))->format('U') * 1000;
    } catch (Exception $e) {
        return 0;
    }
}

/**
 * Периоды простоя сервера из api/config/downtime.json
 * (как в старом дашборде — красные дни на Yearly).
 *
 * @return list<array{start:string,end:string}>
 */
function load_downtime_ranges(): array
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $path = __DIR__ . '/config/downtime.json';
    if (!is_readable($path)) {
        $cached = [];
        return $cached;
    }
    $raw = json_decode((string) file_get_contents($path), true);
    if (!is_array($raw)) {
        $cached = [];
        return $cached;
    }
    $out = [];
    foreach ($raw as $range) {
        $start = substr((string) ($range['start'] ?? ''), 0, 10);
        $end = substr((string) ($range['end'] ?? ''), 0, 10);
        if ($start !== '' && $end !== '') {
            $out[] = ['start' => $start, 'end' => $end];
        }
    }
    $cached = $out;
    return $cached;
}

function is_downtime_day(string $day, ?array $ranges = null): bool
{
    $day = substr($day, 0, 10);
    foreach ($ranges ?? load_downtime_ranges() as $range) {
        if ($day >= $range['start'] && $day <= $range['end']) {
            return true;
        }
    }
    return false;
}
