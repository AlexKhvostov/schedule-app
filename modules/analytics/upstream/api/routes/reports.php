<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/regs.php';
require_once __DIR__ . '/notes.php';

/**
 * Плотность поля = очки, не число снимков.
 *
 * ВАЖНО — лимиты НЕ смешиваются:
 * очки 50€ и 100€ независимы. Carry/MAX только внутри пары (игрок + tournament_limit).
 * Если в выборке несколько лимитов — считаем каждый отдельно, затем СКЛАДЫВАЕМ
 * C/volume/activePlayers (сумма независимых полей), не MAX по нику across limits.
 *
 * Срез на конец часа H (для каждой пары игрок+лимит, уже встречавшейся сегодня):
 *   max очков с начала суток до конца H.
 * Если в часе H снимка не было — держим последний известный max (carry).
 * Carry только внутри суток лидерборда; через полночь нельзя.
 *
 * C(H) = Σ max по всем парам (игрок, лимит) к концу H.
 * Объём часа H = C(H) − C(H−1)  (для H=0: C(0)).
 * Дыра: если в H−1 не было записей по ЭТОМУ лимиту → volume[H]=0 для него
 * (потом суммируем по лимитам).
 *
 * @param list<array{player_name:string,scraped_at:string,points:int|string,tournament_limit?:string}> $rows
 * @return array{volume: list<int>, cumulative: list<int>, activePlayers: list<int>, hasRecords: list<bool>}
 */
function points_density_hourly(array $rows): array
{
    /** @var array<string, list<array{player_name:string,scraped_at:string,points:int|string}>> $byLimit */
    $byLimit = [];
    foreach ($rows as $row) {
        $limit = trim((string) ($row['tournament_limit'] ?? ''));
        if ($limit === '') {
            // Без лимита в расчёт плотности не берём — иначе неизбежен чужой carry
            continue;
        }
        $byLimit[$limit][] = $row;
    }

    $volume = array_fill(0, 24, 0);
    $cumulative = array_fill(0, 24, 0);
    $activePlayers = array_fill(0, 24, 0);
    $hasRecords = array_fill(0, 24, false);

    foreach ($byLimit as $limitRows) {
        $part = points_density_hourly_one_limit($limitRows);
        for ($h = 0; $h < 24; $h++) {
            $volume[$h] += $part['volume'][$h];
            $cumulative[$h] += $part['cumulative'][$h];
            $activePlayers[$h] += $part['activePlayers'][$h];
            if ($part['hasRecords'][$h]) {
                $hasRecords[$h] = true;
            }
        }
    }

    return [
        'volume' => $volume,
        'cumulative' => $cumulative,
        'activePlayers' => $activePlayers,
        'hasRecords' => $hasRecords,
    ];
}

/**
 * Плотность для ОДНОГО tournament_limit (строки уже одного лимита).
 *
 * @param list<array{player_name:string,scraped_at:string,points:int|string}> $rows
 * @return array{volume: list<int>, cumulative: list<int>, activePlayers: list<int>, hasRecords: list<bool>}
 */
function points_density_hourly_one_limit(array $rows): array
{
    /** @var array<string, array<int, int>> $observedMax player => hour => max points in that hour */
    $observedMax = [];
    foreach ($rows as $row) {
        $name = (string) ($row['player_name'] ?? '');
        if ($name === '') {
            continue;
        }
        $hour = milan_hour_from_utc((string) ($row['scraped_at'] ?? ''));
        if ($hour < 0 || $hour > 23) {
            continue;
        }
        $pts = (int) ($row['points'] ?? 0);
        if (!isset($observedMax[$name][$hour]) || $pts > $observedMax[$name][$hour]) {
            $observedMax[$name][$hour] = $pts;
        }
    }

    $hasRecords = array_fill(0, 24, false);
    foreach ($observedMax as $byHour) {
        foreach (array_keys($byHour) as $hour) {
            $hasRecords[(int) $hour] = true;
        }
    }

    $volume = array_fill(0, 24, 0);
    $cumulative = array_fill(0, 24, 0);
    $activePlayers = array_fill(0, 24, 0);
    $carry = [];
    foreach (array_keys($observedMax) as $name) {
        $carry[$name] = null;
    }

    for ($h = 0; $h < 24; $h++) {
        $sum = 0;
        $active = 0;
        foreach ($observedMax as $name => $byHour) {
            if (isset($byHour[$h])) {
                $prev = $carry[$name];
                $carry[$name] = $prev === null ? $byHour[$h] : max($prev, $byHour[$h]);
            }
            if ($carry[$name] !== null) {
                $sum += $carry[$name];
                $active++;
            }
        }
        $cumulative[$h] = $sum;
        $prevCum = $h === 0 ? 0 : $cumulative[$h - 1];
        $rawVolume = $h === 0 ? $sum : max(0, $sum - $prevCum);
        if ($h > 0 && !$hasRecords[$h - 1]) {
            $volume[$h] = 0;
        } else {
            $volume[$h] = $rawVolume;
        }
        $activePlayers[$h] = $active;
    }

    return [
        'volume' => $volume,
        'cumulative' => $cumulative,
        'activePlayers' => $activePlayers,
        'hasRecords' => $hasRecords,
    ];
}

/**
 * Расписание игрока по снимкам: по часам Milan и по дням недели.
 *
 * @param list<array{scraped_at:string,day:string,points:int|string}> $snapRows
 * @return array{
 *   byHour: list<array{hour:int,snapshots:int,avgPerActiveDay:float,avgPoints:int|null}>,
 *   byWeekday: list<array{weekday:int,label:string,snapshots:int,activeDays:int,avgPerDay:float}>,
 *   peak_hour: int|null,
 *   peak_weekday: int|null,
 *   peak_weekday_label: string|null
 * }
 */
function build_player_schedule(array $snapRows): array
{
    $wdLabels = [1 => 'Пн', 2 => 'Вт', 3 => 'Ср', 4 => 'Чт', 5 => 'Пт', 6 => 'Сб', 7 => 'Вс'];
    $activeDays = [];
    $hourDayCounts = array_fill(0, 24, []);
    $weekdaySnaps = array_fill(1, 7, 0);
    $weekdayDays = array_fill(1, 7, []);
    /** @var array<int, array<string, int>> $hourDayMaxPoints hour => day => max points (один лимит) */
    $hourDayMaxPoints = array_fill(0, 24, []);

    $limitsSeen = [];
    foreach ($snapRows as $row) {
        $lim = trim((string) ($row['tournament_limit'] ?? ''));
        if ($lim !== '') {
            $limitsSeen[$lim] = true;
        }
    }
    // avgPoints только если все строки одного лимита — иначе мешали бы стеки
    $singleLimit = count($limitsSeen) <= 1;

    foreach ($snapRows as $row) {
        $day = substr((string) $row['day'], 0, 10);
        $activeDays[$day] = true;
        $hour = milan_hour_from_utc((string) $row['scraped_at']);
        if ($hour < 0 || $hour > 23) {
            $hour = 0;
        }
        if (!isset($hourDayCounts[$hour][$day])) {
            $hourDayCounts[$hour][$day] = 0;
        }
        $hourDayCounts[$hour][$day]++;
        if ($singleLimit) {
            $pts = (int) ($row['points'] ?? 0);
            if (!isset($hourDayMaxPoints[$hour][$day]) || $pts > $hourDayMaxPoints[$hour][$day]) {
                $hourDayMaxPoints[$hour][$day] = $pts;
            }
        }

        try {
            $wd = (int) (new DateTimeImmutable($day . 'T12:00:00'))->format('N');
        } catch (Exception $e) {
            $wd = 1;
        }
        $weekdaySnaps[$wd]++;
        $weekdayDays[$wd][$day] = true;
    }

    $activeDayCount = max(1, count($activeDays));
    $byHour = [];
    $peakHour = null;
    $peakHourAvg = -1.0;
    for ($h = 0; $h < 24; $h++) {
        $dayMap = $hourDayCounts[$h];
        $sum = array_sum($dayMap);
        $avg = round($sum / $activeDayCount, 2);
        $avgPts = null;
        if ($singleLimit && $hourDayMaxPoints[$h]) {
            $vals = array_values($hourDayMaxPoints[$h]);
            $avgPts = (int) round(array_sum($vals) / count($vals));
        }
        $byHour[] = [
            'hour' => $h,
            'snapshots' => $sum,
            'avgPerActiveDay' => $avg,
            'avgPoints' => $avgPts,
        ];
        if ($avg > $peakHourAvg) {
            $peakHourAvg = $avg;
            $peakHour = $h;
        }
    }

    $byWeekday = [];
    $peakWeekday = null;
    $peakWeekdaySnaps = -1;
    for ($wd = 1; $wd <= 7; $wd++) {
        $daysN = count($weekdayDays[$wd]);
        $snaps = $weekdaySnaps[$wd];
        $byWeekday[] = [
            'weekday' => $wd,
            'label' => $wdLabels[$wd],
            'snapshots' => $snaps,
            'activeDays' => $daysN,
            'avgPerDay' => $daysN ? round($snaps / $daysN, 2) : 0,
        ];
        if ($snaps > $peakWeekdaySnaps) {
            $peakWeekdaySnaps = $snaps;
            $peakWeekday = $wd;
        }
    }

    return [
        'byHour' => $byHour,
        'byWeekday' => $byWeekday,
        'peak_hour' => $peakHour,
        'peak_weekday' => $peakWeekday,
        'peak_weekday_label' => $peakWeekday ? $wdLabels[$peakWeekday] : null,
    ];
}

function home_chart_limits(): array
{
    return ['16-25', '50', '100', '250'];
}

/**
 * Home: один лимит. История читается одним SELECT и схлопывается по дням
 * (в RAM только текущий день), без выгрузки 60×4 лимитов целиком.
 *
 * @return array{limit:string,hours:list<array<string,mixed>>,kpis:array<string,mixed>}
 */
function build_home_limit_series_from_db(
    PDO $pdo,
    string $limit,
    string $day,
    array $filters,
    array $regs,
    int $avgDaysBack = 30
): array {
    $tzName = settings()['timezone'] ?: 'Europe/Madrid';
    $tz = new DateTimeZone($tzName);

    $dayBuilt = build_snapshot_filters([
        'dateFrom' => $day,
        'dateTo' => $day,
        'limits' => [$limit],
        'players' => $filters['players'],
        'segment' => $filters['segment'],
        'regs' => $regs,
    ]);
    $dayRows = fetch_all(
        $pdo,
        "SELECT player_name, scraped_at, points
         FROM tournament_snapshots
         WHERE {$dayBuilt['whereSql']}
         ORDER BY scraped_at ASC",
        $dayBuilt['params']
    );
    foreach ($dayRows as &$r) {
        $r['tournament_limit'] = $limit;
    }
    unset($r);

    $today = points_density_hourly_one_limit($dayRows);
    unset($dayRows);

    $sumAll = array_fill(0, 24, ['sum' => 0.0, 'n' => 0]);
    $sumWd = array_fill(0, 24, ['sum' => 0.0, 'n' => 0]);
    $targetWd = (int) (new DateTimeImmutable($day . 'T12:00:00', $tz))->format('w');

    $histEnd = $day;
    $histStart = (new DateTimeImmutable($day, $tz))
        ->modify('-' . max(1, $avgDaysBack) . ' days')
        ->format('Y-m-d');

    $histBase = build_snapshot_filters([
        'limits' => [$limit],
        'players' => $filters['players'],
        'segment' => $filters['segment'],
        'regs' => $regs,
    ]);

    $stmt = $pdo->prepare(
        "SELECT player_name, scraped_at, points, scraped_date_milan AS day
         FROM tournament_snapshots
         WHERE {$histBase['whereSql']}
           AND scraped_date_milan >= ?
           AND scraped_date_milan < ?
         ORDER BY scraped_date_milan ASC, scraped_at ASC"
    );
    $stmt->execute(array_merge($histBase['params'], [$histStart, $histEnd]));

    $bucketDay = null;
    $bucketRows = [];

    $flushDay = static function () use (&$bucketDay, &$bucketRows, &$sumAll, &$sumWd, $targetWd, $limit, $tz): void {
        if ($bucketDay === null || !$bucketRows) {
            $bucketRows = [];
            return;
        }
        foreach ($bucketRows as &$r) {
            $r['tournament_limit'] = $limit;
        }
        unset($r);
        $dens = points_density_hourly_one_limit($bucketRows);
        $wd = (int) (new DateTimeImmutable($bucketDay . 'T12:00:00', $tz))->format('w');
        for ($h = 0; $h < 24; $h++) {
            if ($h > 0 && empty($dens['hasRecords'][$h - 1])) {
                continue;
            }
            $v = $dens['volume'][$h];
            $sumAll[$h]['sum'] += $v;
            $sumAll[$h]['n']++;
            if ($wd === $targetWd) {
                $sumWd[$h]['sum'] += $v;
                $sumWd[$h]['n']++;
            }
        }
        $bucketRows = [];
    };

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $d = substr((string) ($row['day'] ?? ''), 0, 10);
        if ($d === '') {
            continue;
        }
        if ($bucketDay !== null && $d !== $bucketDay) {
            $flushDay();
        }
        $bucketDay = $d;
        $bucketRows[] = [
            'player_name' => $row['player_name'],
            'scraped_at' => $row['scraped_at'],
            'points' => $row['points'],
        ];
    }
    $flushDay();
    $stmt->closeCursor();

    $hours = [];
    for ($hour = 0; $hour < 24; $hour++) {
        $avgAll = $sumAll[$hour]['n'] ? $sumAll[$hour]['sum'] / $sumAll[$hour]['n'] : 0;
        $avgWd = $sumWd[$hour]['n'] ? $sumWd[$hour]['sum'] / $sumWd[$hour]['n'] : 0;
        $vol = $today['volume'][$hour];
        $hours[] = [
            'hour' => $hour,
            'volume' => $vol,
            'cumulative' => $today['cumulative'][$hour],
            'activePlayers' => $today['activePlayers'][$hour],
            'avgVolumeAll' => round($avgAll * 10) / 10,
            'avgVolumeWeekday' => round($avgWd * 10) / 10,
        ];
    }

    $peak = $hours[0];
    foreach ($hours as $h) {
        if ($h['volume'] > $peak['volume']) {
            $peak = $h;
        }
    }

    return [
        'limit' => $limit,
        'hours' => $hours,
        'kpis' => [
            'dayPointsSum' => $today['cumulative'][23],
            'peakHour' => $peak['hour'] ?? null,
            'peakVolume' => $peak['volume'] ?? 0,
            'activePlayersEnd' => $today['activePlayers'][23] ?? 0,
        ],
    ];
}

function handle_home(PDO $pdo): void
{
    // Hostland ~256M; старый Home грузил 60д×4 лимита целиком → Fatal HTML вместо JSON
    @ini_set('memory_limit', '512M');
    @set_time_limit(180);

    $filters = query_filters();
    $regs = get_all_regs($pdo);
    $day = $filters['dateTo'] ?: ($filters['dateFrom'] ?: milan_date_only());
    $limits = home_chart_limits();
    $avgDaysBack = 30;

    $byLimit = [];
    $dayPointsSum = 0;
    $peakHour = null;
    $peakVolume = -1;

    foreach ($limits as $lim) {
        $block = build_home_limit_series_from_db($pdo, $lim, $day, $filters, $regs, $avgDaysBack);
        $byLimit[] = $block;
        $dayPointsSum += (int) ($block['kpis']['dayPointsSum'] ?? 0);
        $pv = (int) ($block['kpis']['peakVolume'] ?? 0);
        if ($pv > $peakVolume) {
            $peakVolume = $pv;
            $peakHour = $block['kpis']['peakHour'];
        }
        // дать GC шанс между лимитами
        if (function_exists('gc_collect_cycles')) {
            gc_collect_cycles();
        }
    }

    $built = build_snapshot_filters([
        'dateFrom' => $day,
        'dateTo' => $day,
        'limits' => $limits,
        'players' => $filters['players'],
        'segment' => $filters['segment'],
        'regs' => $regs,
    ]);
    $uniq = fetch_one(
        $pdo,
        "SELECT COUNT(DISTINCT player_name) AS n FROM tournament_snapshots WHERE {$built['whereSql']}",
        $built['params']
    );

    json_response([
        'day' => $day,
        'timezone' => settings()['timezone'] ?: 'Europe/Madrid',
        'metric' => 'points_density',
        'metricNote' => 'Каждый чарт — один лимит. Объём часа = прирост Σ(max) внутри лимита (carry только в своих сутках ES). Средние ~' . $avgDaysBack . ' дн.',
        'byLimit' => $byLimit,
        'kpis' => [
            'dayPointsSum' => $dayPointsSum,
            'totalRecords' => $dayPointsSum,
            'peakHour' => $peakHour,
            'peakVolume' => max(0, $peakVolume),
            'peakRecords' => max(0, $peakVolume),
            'uniquePlayersDay' => (int) ($uniq['n'] ?? 0),
        ],
        'dateFrom' => $filters['dateFrom'],
        'dateTo' => $filters['dateTo'],
        'limits' => $limits,
        'players' => $filters['players'],
        'segment' => $filters['segment'],
        'avgDaysBack' => $avgDaysBack,
    ]);
}

function handle_points(PDO $pdo): void
{
    $filters = query_filters();
    $regs = get_all_regs($pdo);
    $topNRaw = $_GET['topN'] ?? '10';
    $topN = $topNRaw === 'all' ? null : max(1, min(100, (int) $topNRaw));

    // День ES: ?day=… или dateTo/dateFrom из фильтра (однодневка)
    $day = isset($_GET['day']) ? substr((string) $_GET['day'], 0, 10) : '';
    if ($day === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        $day = (string) ($filters['dateTo'] ?: $filters['dateFrom'] ?: milan_date_only());
        $day = substr($day, 0, 10);
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        json_error('day=YYYY-MM-DD', 400);
    }

    // Один лимит обязательно: очки 50€ и 100€ нельзя мешать на одной линии
    $limits = $filters['limits'] ?: ANALYTICS_LIMITS;
    $limit = (string) ($limits[0] ?? '100');
    $limits = [$limit];

    $dayFilters = build_snapshot_filters([
        'dateFrom' => $day,
        'dateTo' => $day,
        'limits' => $limits,
        'players' => $filters['players'],
        'segment' => $filters['segment'],
        'regs' => $regs,
    ]);

    $playerFilterSql = $dayFilters['whereSql'];
    $playerParams = $dayFilters['params'];

    if (!$filters['players'] && $topN) {
        $top = fetch_all(
            $pdo,
            "SELECT player_name, MAX(points) AS max_points
             FROM tournament_snapshots
             WHERE {$dayFilters['whereSql']}
             GROUP BY player_name
             ORDER BY max_points DESC
             LIMIT {$topN}",
            $dayFilters['params']
        );
        $names = array_column($top, 'player_name');
        if (!$names) {
            json_response([
                'day' => $day,
                'limit' => $limit,
                'series' => [],
                'players' => [],
                'dateFilterIgnored' => false,
            ]);
        }
        $ph = implode(',', array_fill(0, count($names), '?'));
        $playerFilterSql .= " AND player_name IN ($ph)";
        $playerParams = array_merge($dayFilters['params'], $names);
    }

    $rows = fetch_all(
        $pdo,
        "SELECT player_name, scraped_at, points, tournament_limit, `rank`
         FROM tournament_snapshots
         WHERE {$playerFilterSql}
         ORDER BY scraped_at ASC",
        $playerParams
    );

    $byPlayer = [];
    foreach ($rows as $row) {
        // Защита: чужой лимит в выборку не пускаем
        if ((string) ($row['tournament_limit'] ?? '') !== $limit) {
            continue;
        }
        $n = $row['player_name'];
        if (!isset($byPlayer[$n])) {
            $byPlayer[$n] = [];
        }
        $byPlayer[$n][] = [
            'at' => $row['scraped_at'],
            'points' => (int) $row['points'],
            'limit' => $limit,
            'rank' => $row['rank'],
        ];
    }

    $series = [];
    foreach ($byPlayer as $player_name => $points) {
        $series[] = ['player_name' => $player_name, 'points' => $points, 'limit' => $limit];
    }

    json_response([
        'day' => $day,
        'limit' => $limit,
        'series' => $series,
        'players' => array_column($series, 'player_name'),
        'dateFilterIgnored' => false,
    ]);
}

/**
 * Статусы analytics_scrape_hour за диапазон дней.
 * @return array<string, array<int, string>> day → hour → ok|down|pending
 */
function load_scrape_status_by_day(PDO $pdo, string $dayFrom, string $dayTo): array
{
    $out = [];
    try {
        $rows = fetch_all(
            $pdo,
            'SELECT day, hour, status
             FROM analytics_scrape_hour
             WHERE day >= ? AND day <= ?',
            [$dayFrom, $dayTo]
        );
    } catch (Throwable $e) {
        return [];
    }
    foreach ($rows as $r) {
        $d = substr((string) ($r['day'] ?? ''), 0, 10);
        $h = (int) ($r['hour'] ?? -1);
        if ($d === '' || $h < 0 || $h > 23) {
            continue;
        }
        if (!isset($out[$d])) {
            $out[$d] = [];
        }
        $out[$d][$h] = (string) ($r['status'] ?? 'pending');
    }
    return $out;
}

/** Простой сервера в часу: status=down или нет строки за уже прошедший час. */
function scrape_hour_is_server_down(?string $status, string $day, int $hour): bool
{
    if ($status === 'down') {
        return true;
    }
    if ($status === 'ok' || $status === 'pending') {
        return false;
    }
    // нет строки в scrape_hour
    $today = milan_date_only();
    if ($day < $today) {
        return true;
    }
    if ($day === $today && $hour <= milan_hour_now()) {
        return true;
    }
    return false;
}

/**
 * Heatmap для Points: игроки × часы за один день ES.
 * Цвет ячейки = междучасовая разница (delta_hour), в JSON как diff_points.
 * Скорость в ячейке — внутри часа (max−min). Источник: analytics_player_hour.
 */
function handle_points_heatmap(PDO $pdo): void
{
    ensure_aggregate_tables($pdo);
    $filters = query_filters();
    $regs = get_all_regs($pdo);

    $day = isset($_GET['day']) ? substr((string) $_GET['day'], 0, 10) : milan_date_only();
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        json_error('day=YYYY-MM-DD', 400);
    }

    $limits = $filters['limits'] ?: ['100'];
    $limit = trim((string) ($_GET['limit'] ?? ($limits[0] ?? '100')));
    $allowed = ['16-25', '50', '100', '250'];
    if (!in_array($limit, $allowed, true)) {
        json_error('limit: 16-25|50|100|250', 400);
    }

    $topNRaw = $_GET['topN'] ?? '10';
    $topNAll = ($topNRaw === 'all' || $topNRaw === '0');
    $topN = $topNAll ? null : max(1, min(500, (int) $topNRaw));

    $sort = (string) ($_GET['sort'] ?? 'day_max');
    // UI: points→day_max, speed→speed, name→name; legacy max_diff ещё принимаем
    if ($sort === 'points') {
        $sort = 'day_max';
    }
    if (!in_array($sort, ['day_max', 'max_diff', 'speed', 'name'], true)) {
        $sort = 'day_max';
    }

    // Опционально сузить список игроков (фильтр / сегмент) через сырьё дня
    $nameSet = null;
    if (!empty($filters['players']) || (($filters['segment'] ?? 'all') !== 'all')) {
        $snapFilters = build_snapshot_filters([
            'dateFrom' => $day,
            'dateTo' => $day,
            'limits' => [$limit],
            'players' => $filters['players'],
            'segment' => $filters['segment'],
            'regs' => $regs,
        ]);
        $names = fetch_all(
            $pdo,
            "SELECT DISTINCT player_name
             FROM tournament_snapshots
             WHERE {$snapFilters['whereSql']}",
            $snapFilters['params']
        );
        $nameSet = [];
        foreach ($names as $r) {
            $nameSet[(string) $r['player_name']] = true;
        }
        if (!$nameSet) {
            json_response([
                'day' => $day,
                'limit' => $limit,
                'topN' => $topNAll ? 'all' : $topN,
                'sort' => $sort,
                'scaleMax' => 80,
                'players' => [],
                'source' => 'analytics_player_hour',
            ]);
        }
    }

    try {
        $rows = fetch_all(
            $pdo,
            'SELECT player_name, hour, diff_points, min_points_hour, max_points_hour,
                    max_points_carry, min_at, max_at, speed, has_snapshot, diff_seconds, delta_hour
             FROM analytics_player_hour
             WHERE day = ? AND tournament_limit = ?
             ORDER BY player_name ASC, hour ASC',
            [$day, $limit]
        );
    } catch (Throwable $e) {
        json_error('Нет таблицы analytics_player_hour или ошибка чтения: ' . $e->getMessage(), 500);
    }

    /** @var array<string, array{name:string, hours:array<int, array<string,mixed>|null>, dayMax:int, maxDiff:int, maxSpeed:float}> $byPlayer */
    $byPlayer = [];
    foreach ($rows as $r) {
        $name = (string) ($r['player_name'] ?? '');
        if ($name === '') {
            continue;
        }
        if ($nameSet !== null && !isset($nameSet[$name])) {
            continue;
        }
        $h = (int) ($r['hour'] ?? -1);
        if ($h < 0 || $h > 23) {
            continue;
        }
        if (!isset($byPlayer[$name])) {
            $byPlayer[$name] = [
                'name' => $name,
                'hours' => array_fill(0, 24, null),
                'dayMax' => 0,
                'maxDiff' => 0,
                'maxSpeed' => 0.0,
            ];
        }
        $diffWithin = (int) ($r['diff_points'] ?? 0);
        $hourMax = (int) ($r['max_points_hour'] ?? 0);
        $carry = (int) ($r['max_points_carry'] ?? 0);
        $spd = $r['speed'] !== null ? (float) $r['speed'] : 0.0;
        $storedDelta = isset($r['delta_hour']) ? (int) $r['delta_hour'] : null;
        $byPlayer[$name]['hours'][$h] = [
            'hour' => $h,
            'diff_points' => $diffWithin,
            'delta_hour' => $storedDelta,
            'min_points_hour' => (int) ($r['min_points_hour'] ?? 0),
            'max_points_hour' => $hourMax,
            'max_points_carry' => $carry,
            'min_at' => $r['min_at'] ?? null,
            'max_at' => $r['max_at'] ?? null,
            'speed' => $r['speed'] !== null ? (float) $r['speed'] : null,
            'diff_seconds' => (int) ($r['diff_seconds'] ?? 0),
            'has_snapshot' => (int) ($r['has_snapshot'] ?? 0),
        ];
        $byPlayer[$name]['dayMax'] = max($byPlayer[$name]['dayMax'], $hourMax, $carry);
        $byPlayer[$name]['maxDiff'] = max($byPlayer[$name]['maxDiff'], $diffWithin);
        if ($spd > $byPlayer[$name]['maxSpeed']) {
            $byPlayer[$name]['maxSpeed'] = $spd;
        }
    }

    // Санитизация: хвост вчера; heatmap +N = междучасовая разница; скорость не трогаем
    $firstSnapMax = player_hour_first_snap_max_points();
    foreach ($byPlayer as $name => &$pRef) {
        $prevHourMax = null;
        $dayStarted = false;
        $dayMaxFixed = 0;
        $maxDeltaFixed = 0;
        $maxSpeedFixed = 0.0;
        for ($h = 0; $h < 24; $h++) {
            $cell = $pRef['hours'][$h];
            if ($cell === null) {
                continue;
            }
            $carry = (int) ($cell['max_points_carry'] ?? 0);
            $hourMax = (int) ($cell['max_points_hour'] ?? 0);
            if (!$dayStarted) {
                if ($carry > $firstSnapMax && $hourMax > $firstSnapMax) {
                    $cell['diff_points'] = 0;
                    $cell['delta_hour'] = 0;
                    $cell['stale_yesterday_tail'] = true;
                    $pRef['hours'][$h] = $cell;
                    continue;
                }
                $dayStarted = true;
            }
            $computedDelta = player_hour_delta_vs_prev($prevHourMax, $hourMax);
            $cell['diff_within_hour'] = (int) ($cell['diff_points'] ?? 0);
            $cell['delta_hour'] = $computedDelta;
            $cell['diff_points'] = $computedDelta;
            $pRef['hours'][$h] = $cell;
            $prevHourMax = $hourMax;
            $dayMaxFixed = max($dayMaxFixed, $carry, $hourMax);
            $maxDeltaFixed = max($maxDeltaFixed, $computedDelta);
            $spd = $cell['speed'] !== null ? (float) $cell['speed'] : 0.0;
            if ($spd > $maxSpeedFixed) {
                $maxSpeedFixed = $spd;
            }
        }
        if (!$dayStarted) {
            unset($byPlayer[$name]);
            continue;
        }
        $pRef['dayMax'] = $dayMaxFixed;
        $pRef['maxDiff'] = $maxDeltaFixed;
        $pRef['maxSpeed'] = $maxSpeedFixed;
    }
    unset($pRef);

    $list = array_values($byPlayer);
    usort($list, static function ($a, $b) use ($sort) {
        if ($sort === 'name') {
            return strcasecmp($a['name'], $b['name']);
        }
        if ($sort === 'max_diff') {
            $c = $b['maxDiff'] <=> $a['maxDiff'];
            return $c !== 0 ? $c : strcasecmp($a['name'], $b['name']);
        }
        if ($sort === 'speed') {
            $c = $b['maxSpeed'] <=> $a['maxSpeed'];
            return $c !== 0 ? $c : strcasecmp($a['name'], $b['name']);
        }
        // day_max / points
        $c = $b['dayMax'] <=> $a['dayMax'];
        return $c !== 0 ? $c : strcasecmp($a['name'], $b['name']);
    });

    $totalPlayers = count($list);
    if ($topN !== null) {
        $list = array_slice($list, 0, $topN);
    }

    $scrapeMap = load_scrape_status_by_day($pdo, $day, $day);
    $scrapeDay = $scrapeMap[$day] ?? [];
    $downtimeHours = [];
    for ($h = 0; $h < 24; $h++) {
        $st = $scrapeDay[$h] ?? null;
        if (scrape_hour_is_server_down($st, $day, $h)) {
            $downtimeHours[] = $h;
        }
    }
    $downSet = array_fill_keys($downtimeHours, true);

    $playersOut = [];
    foreach ($list as $p) {
        $hoursOut = [];
        for ($h = 0; $h < 24; $h++) {
            $cell = $p['hours'][$h];
            $base = $cell ?: [
                'hour' => $h,
                'diff_points' => null,
                'empty' => true,
            ];
            $base['serverDown'] = isset($downSet[$h]);
            $hoursOut[] = $base;
        }
        $playersOut[] = [
            'player_name' => $p['name'],
            'dayMax' => $p['dayMax'],
            'maxDiff' => $p['maxDiff'],
            'maxSpeed' => $p['maxSpeed'],
            'hours' => $hoursOut,
        ];
    }

    json_response([
        'day' => $day,
        'limit' => $limit,
        'topN' => $topNAll ? 'all' : $topN,
        'sort' => $sort,
        'scaleMax' => 80,
        'totalPlayers' => $totalPlayers,
        'players' => $playersOut,
        'downtimeHours' => $downtimeHours,
        'source' => 'analytics_player_hour',
        'metric' => 'diff_points',
        'firstSnapMaxPoints' => $firstSnapMax,
    ]);
}

function handle_yearly(PDO $pdo): void
{
    $filters = query_filters();
    $regs = get_all_regs($pdo);
    $yearFilters = build_snapshot_filters([
        'limits' => $filters['limits'],
        'players' => $filters['players'],
        'segment' => $filters['segment'],
        'regs' => $regs,
    ]);

    $todayEs = milan_date_only();
    $activity = fetch_all(
        $pdo,
        "SELECT scraped_date_milan AS day, COUNT(*) AS records,
                COUNT(DISTINCT player_name) AS unique_players
         FROM tournament_snapshots
         WHERE {$yearFilters['whereSql']}
           AND scraped_date_milan >= DATE_SUB(?, INTERVAL 365 DAY)
         GROUP BY scraped_date_milan
         ORDER BY day",
        array_merge($yearFilters['params'], [$todayEs])
    );
    $activityMap = [];
    foreach ($activity as $a) {
        $activityMap[substr((string) $a['day'], 0, 10)] = $a;
    }

    $downtime = load_downtime_ranges();

    $days = [];
    $start = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $start = $start->setTime(12, 0, 0)->modify('-364 days');
    for ($i = 0; $i < 365; $i++) {
        $key = $start->modify("+{$i} days")->format('Y-m-d');
        $row = $activityMap[$key] ?? null;
        $records = (int) ($row['records'] ?? 0);
        // Как в ref: красный = день из downtime.json (сервер лежал / не собирал)
        if (is_downtime_day($key, $downtime)) {
            $status = 'downtime';
        } elseif ($records > 0) {
            $status = 'ok';
        } else {
            $status = 'empty';
        }
        $days[] = [
            'day' => $key,
            'records' => $records,
            'uniquePlayers' => (int) ($row['unique_players'] ?? 0),
            'status' => $status,
        ];
    }

    json_response([
        'days' => $days,
        'limits' => $filters['limits'],
        'downtime' => $downtime,
    ]);
}

/**
 * Окна скорости из сырых снимков.
 * speed = (max−min очков) / минуты × 60, окно 15–60 мин.
 *
 * @param list<array{player_name:string,day:string,scraped_at:string,points:int|string,tournament_limit?:string}> $rows
 * @return list<array{player_name:string,day:string,hour:int,point_min:int,point_max:int,time_diff:int,speed:float}>
 */
function compute_speed_windows(array $rows): array
{
    $buckets = [];
    foreach ($rows as $row) {
        $hour = milan_hour_from_utc((string) $row['scraped_at']);
        $limit = trim((string) ($row['tournament_limit'] ?? ''));
        // Лимиты не смешиваем: окна скорости только внутри одного лимита
        $key = $row['player_name'] . '|' . $row['day'] . '|' . $limit . '|' . $hour;
        if (!isset($buckets[$key])) {
            $buckets[$key] = [
                'player_name' => $row['player_name'],
                'day' => $row['day'],
                'hour' => $hour,
                'points' => [],
            ];
        }
        $buckets[$key]['points'][] = [
            'at' => $row['scraped_at'],
            'points' => (int) $row['points'],
        ];
    }

    $speedRows = [];
    foreach ($buckets as $bucket) {
        if (count($bucket['points']) < 2) {
            continue;
        }
        $minP = $bucket['points'][0];
        $maxP = $bucket['points'][0];
        foreach ($bucket['points'] as $p) {
            if ($p['points'] < $minP['points']) {
                $minP = $p;
            }
            if ($p['points'] > $maxP['points']) {
                $maxP = $p;
            }
        }
        if ($maxP['points'] <= $minP['points']) {
            continue;
        }
        $tMin = parse_utc_ms((string) $minP['at']);
        $tMax = parse_utc_ms((string) $maxP['at']);
        if ($tMax <= $tMin) {
            continue;
        }
        $diffMin = ($tMax - $tMin) / 60000;
        if ($diffMin < 15 || $diffMin > 60) {
            continue;
        }
        $speed = (($maxP['points'] - $minP['points']) / $diffMin) * 60;
        $speedRows[] = [
            'player_name' => $bucket['player_name'],
            'day' => $bucket['day'],
            'hour' => $bucket['hour'],
            'point_min' => $minP['points'],
            'point_max' => $maxP['points'],
            'time_diff' => (int) round($diffMin),
            'speed' => round($speed * 10) / 10,
        ];
    }
    return $speedRows;
}

/**
 * @param list<array{hour:int,speed:float}> $speedRows
 * @return list<float|null>
 */
function speed_avg_by_hour(array $speedRows): array
{
    $byHourMap = [];
    foreach ($speedRows as $row) {
        $byHourMap[$row['hour']][] = $row['speed'];
    }
    $out = [];
    for ($hour = 0; $hour < 24; $hour++) {
        $list = $byHourMap[$hour] ?? [];
        $out[$hour] = $list
            ? round(array_sum($list) / count($list) * 10) / 10
            : null;
    }
    return $out;
}

/**
 * Speed не тянет год снимков в RAM: режем окно (по умолчанию 14 дней).
 *
 * @return array{dateFrom:string,dateTo:string,clamped:bool,requestedFrom:string,requestedTo:string}
 */
function clamp_report_dates(string $dateFrom, string $dateTo, int $maxDays = 14): array
{
    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    try {
        $to = new DateTimeImmutable(substr($dateTo, 0, 10), $tz);
        $from = new DateTimeImmutable(substr($dateFrom, 0, 10), $tz);
    } catch (Exception $e) {
        $to = new DateTimeImmutable('now', $tz);
        $from = $to;
    }
    if ($from > $to) {
        $from = $to;
    }
    $span = (int) $from->diff($to)->format('%a');
    $clamped = false;
    if ($span > $maxDays) {
        $from = $to->modify('-' . $maxDays . ' days');
        $clamped = true;
    }
    return [
        'dateFrom' => $from->format('Y-m-d'),
        'dateTo' => $to->format('Y-m-d'),
        'clamped' => $clamped,
        'requestedFrom' => substr($dateFrom, 0, 10),
        'requestedTo' => substr($dateTo, 0, 10),
    ];
}

/**
 * Добавить окна скорости игрока в агрегаты часа / summary.
 *
 * @param list<array{player_name:string,day:string,hour:int,point_min:int,point_max:int,time_diff:int,speed:float}> $speedRows
 * @param array<int, array{sum:float,n:int}> $hourAgg
 * @param array<string, array<string,mixed>>|null $byPlayer
 */
function speed_accumulate_windows(array $speedRows, array &$hourAgg, ?array &$byPlayer, ?array $nameSet): void
{
    foreach ($speedRows as $row) {
        $h = (int) $row['hour'];
        if ($h >= 0 && $h <= 23) {
            $hourAgg[$h]['sum'] += (float) $row['speed'];
            $hourAgg[$h]['n']++;
        }
        if ($byPlayer === null) {
            continue;
        }
        $n = (string) $row['player_name'];
        if ($nameSet !== null && !isset($nameSet[$n])) {
            continue;
        }
        if (!isset($byPlayer[$n])) {
            $byPlayer[$n] = [
                'player_name' => $n,
                'speeds' => [],
                'maxPoints' => 0,
                'best' => null,
            ];
        }
        $byPlayer[$n]['speeds'][] = $row['speed'];
        $byPlayer[$n]['maxPoints'] = max($byPlayer[$n]['maxPoints'], $row['point_max']);
        if ($byPlayer[$n]['best'] === null || $row['speed'] > $byPlayer[$n]['best']['speed']) {
            $byPlayer[$n]['best'] = $row;
        }
    }
}

function handle_speed(PDO $pdo): void
{
    @ini_set('memory_limit', '256M');
    @set_time_limit(60);

    $filters = query_filters();
    $regs = get_all_regs($pdo);

    $limitsWanted = ['16-25', '50', '100', '250'];
    $limit = trim((string) ($_GET['limit'] ?? ''));
    if ($limit === '') {
        $limit = ($filters['limits'][0] ?? '100');
    }
    if (!in_array($limit, $limitsWanted, true)) {
        json_error('Некорректный limit', 400);
    }

    $today = milan_date_only();
    $month = substr((string) ($_GET['month'] ?? ''), 0, 7);
    if ($month === '' || !preg_match('/^\d{4}-\d{2}$/', $month)) {
        // fallback из dateTo фильтра
        $month = substr((string) ($filters['dateTo'] ?? $today), 0, 7);
    }
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        $month = substr($today, 0, 7);
    }

    try {
        $dt = new DateTimeImmutable($month . '-01 12:00:00', new DateTimeZone('UTC'));
    } catch (Exception $e) {
        json_error('Некорректный month', 400);
    }
    $dayFrom = $dt->format('Y-m-d');
    $dayTo = $dt->modify('last day of this month')->format('Y-m-d');

    $topNRaw = (string) ($_GET['topN'] ?? '50');
    $topNAll = ($topNRaw === 'all' || $topNRaw === '0');
    $topN = $topNAll ? null : max(1, min(500, (int) $topNRaw));

    $players = $filters['players'] ?? [];
    $segment = normalize_audience_segment((string) ($filters['segment'] ?? 'all'));

    $where = [
        'tournament_limit = ?',
        'day >= ?',
        'day <= ?',
        'speed IS NOT NULL',
        'speed > 0',
        // Окно измерения > 20 мин — иначе скорость шумная/несопоставимая
        'diff_seconds > 1200',
    ];
    $params = [$limit, $dayFrom, $dayTo];

    if (!apply_player_audience_where($where, $params, $players, $segment, $regs)) {
            json_response([
                'rows' => [],
                'byHour' => array_map(
                    static fn($h) => ['hour' => $h, 'avg_speed' => null, 'avg_speed_all' => null],
                    range(0, 23)
                ),
                'samples' => 0,
                'samples_all' => 0,
                'source' => 'analytics_player_hour',
                'meta' => [
                    'topN' => $topNRaw,
                    'candidates' => 0,
                    'withSpeed' => 0,
                    'month' => $month,
                    'limit' => $limit,
                    'dayFrom' => $dayFrom,
                    'dayTo' => $dayTo,
                    'segment' => $segment,
                    'dateClamped' => false,
                ],
            ]);
            return;
    }

    $whereSql = implode(' AND ', $where);

    try {
        $aggRows = fetch_all(
            $pdo,
            "SELECT player_name,
                    MAX(speed) AS max_speed,
                    AVG(speed) AS avg_speed,
                    MAX(GREATEST(max_points_carry, max_points_hour)) AS max_points,
                    COUNT(*) AS samples
             FROM analytics_player_hour
             WHERE {$whereSql}
             GROUP BY player_name
             ORDER BY max_speed DESC"
            . ($topN !== null ? (' LIMIT ' . (int) $topN) : ''),
            $params
        );
    } catch (Throwable $e) {
        json_error('Нет таблицы analytics_player_hour или ошибка чтения: ' . $e->getMessage(), 500);
    }

    $summary = [];
    $listNames = [];
    foreach ($aggRows as $r) {
        $name = (string) ($r['player_name'] ?? '');
        if ($name === '') {
            continue;
        }
        $listNames[] = $name;
        $summary[] = [
            'player_name' => $name,
            'max_speed' => round((float) $r['max_speed'] * 10) / 10,
            'avg_speed' => round((float) $r['avg_speed'] * 10) / 10,
            'max_points' => (int) $r['max_points'],
            'samples' => (int) $r['samples'],
            'best_delta' => null,
            'best_minutes' => null,
            'best_day' => null,
            'best_hour' => null,
        ];
    }

    // Лучшее окно (строка часа с max speed) для игроков списка
    if ($listNames) {
        $ph = implode(',', array_fill(0, count($listNames), '?'));
        $bestParams = array_merge($params, $listNames);
        $bestRows = fetch_all(
            $pdo,
            "SELECT player_name, day, hour, speed, diff_points, diff_seconds
             FROM analytics_player_hour
             WHERE {$whereSql}
               AND player_name IN ($ph)
             ORDER BY player_name ASC, speed DESC, day ASC, hour ASC",
            $bestParams
        );
        $bestByName = [];
        foreach ($bestRows as $br) {
            $n = (string) $br['player_name'];
            if (isset($bestByName[$n])) {
                continue;
            }
            $bestByName[$n] = $br;
        }
        foreach ($summary as &$s) {
            $b = $bestByName[$s['player_name']] ?? null;
            if (!$b) {
                continue;
            }
            $s['best_delta'] = (int) ($b['diff_points'] ?? 0);
            $sec = (int) ($b['diff_seconds'] ?? 0);
            $s['best_minutes'] = $sec > 0 ? max(1, (int) round($sec / 60)) : null;
            $s['best_day'] = substr((string) ($b['day'] ?? ''), 0, 10);
            $s['best_hour'] = isset($b['hour']) ? (int) $b['hour'] : null;
            $s['max_speed'] = round((float) $b['speed'] * 10) / 10;
        }
        unset($s);
    }

    // Средняя скорость по часам: список (Top) и все по фильтру
    $hourAll = array_fill(0, 24, null);
    $hourList = array_fill(0, 24, null);
    $samplesAll = 0;
    $samplesList = 0;

    $allHourRows = fetch_all(
        $pdo,
        "SELECT hour, AVG(speed) AS avg_speed, COUNT(*) AS n
         FROM analytics_player_hour
         WHERE {$whereSql}
         GROUP BY hour",
        $params
    );
    foreach ($allHourRows as $hr) {
        $h = (int) $hr['hour'];
        if ($h < 0 || $h > 23) {
            continue;
        }
        $hourAll[$h] = round((float) $hr['avg_speed'] * 10) / 10;
        $samplesAll += (int) $hr['n'];
    }

    if ($listNames) {
        $ph = implode(',', array_fill(0, count($listNames), '?'));
        $listHourRows = fetch_all(
            $pdo,
            "SELECT hour, AVG(speed) AS avg_speed, COUNT(*) AS n
             FROM analytics_player_hour
             WHERE {$whereSql}
               AND player_name IN ($ph)
             GROUP BY hour",
            array_merge($params, $listNames)
        );
        foreach ($listHourRows as $hr) {
            $h = (int) $hr['hour'];
            if ($h < 0 || $h > 23) {
                continue;
            }
            $hourList[$h] = round((float) $hr['avg_speed'] * 10) / 10;
            $samplesList += (int) $hr['n'];
        }
    }

    $byHour = [];
    for ($hour = 0; $hour < 24; $hour++) {
        $byHour[] = [
            'hour' => $hour,
            'avg_speed' => $hourList[$hour],
            'avg_speed_all' => $hourAll[$hour],
        ];
    }

    $regMap = [];
    foreach ($regs as $r) {
        $regMap[$r['player_name']] = $r['side'];
    }

    json_response([
        'rows' => array_map(
            static fn($s) => array_merge($s, ['reg_side' => $regMap[$s['player_name']] ?? null]),
            $summary
        ),
        'byHour' => $byHour,
        'samples' => $samplesList,
        'samples_all' => $samplesAll,
        'source' => 'analytics_player_hour',
        'metric' => 'speed',
        'meta' => [
            'topN' => $topNRaw,
            'candidates' => count($summary),
            'withSpeed' => count($summary),
            'month' => $month,
            'limit' => $limit,
            'dayFrom' => $dayFrom,
            'dateTo' => $dayTo,
            'dayTo' => $dayTo,
            'segment' => $segment,
            'dateClamped' => false,
            'maxDays' => null,
        ],
    ]);
}

function handle_search(PDO $pdo): void
{
    $q = trim((string) ($_GET['q'] ?? ''));
    if (mb_strlen($q) < 2) {
        json_response(['players' => []]);
    }
    $rows = fetch_all(
        $pdo,
        'SELECT DISTINCT player_name
         FROM tournament_snapshots
         WHERE player_name LIKE ?
         ORDER BY player_name
         LIMIT 15',
        ['%' . $q . '%']
    );
    json_response(['players' => array_column($rows, 'player_name')]);
}

function handle_players_list(PDO $pdo): void
{
    $filters = query_filters();
    $regs = get_all_regs($pdo);
    $built = build_snapshot_filters(array_merge($filters, ['regs' => $regs]));
    $regMap = [];
    foreach ($regs as $r) {
        $regMap[$r['player_name']] = $r['side'];
    }

    $rows = fetch_all(
        $pdo,
        "SELECT player_name,
                GROUP_CONCAT(DISTINCT tournament_limit ORDER BY tournament_limit) AS limits,
                MAX(points) AS max_points,
                MAX(scraped_at) AS last_seen,
                COUNT(*) AS snapshots,
                COUNT(DISTINCT scraped_date_milan) AS active_days
         FROM tournament_snapshots
         WHERE {$built['whereSql']}
         GROUP BY player_name
         ORDER BY max_points DESC
         LIMIT 300",
        $built['params']
    );

    json_response([
        'players' => array_map(static function ($r) use ($regMap) {
            return [
                'player_name' => $r['player_name'],
                'limits' => array_values(array_filter(explode(',', (string) ($r['limits'] ?? '')))),
                'max_points' => (int) $r['max_points'],
                'last_seen' => $r['last_seen'],
                'snapshots' => (int) $r['snapshots'],
                'active_days' => (int) $r['active_days'],
                'reg_side' => $regMap[$r['player_name']] ?? null,
            ];
        }, $rows),
    ]);
}

function handle_player_profile(PDO $pdo, string $name): void
{
    $name = trim(rawurldecode($name));
    if ($name === '') {
        json_error('name обязателен', 400);
    }

    $filters = query_filters();
    $topThreshold = max(1, (int) ($_GET['topThreshold'] ?? 50));
    $regs = get_all_regs($pdo);
    $reg = null;
    foreach ($regs as $r) {
        if (strcasecmp($r['player_name'], $name) === 0) {
            $reg = $r;
            break;
        }
    }
    $noteRow = get_player_note($pdo, $name);

    $limitClause = '';
    $dateParts = [];
    $params = [$name];
    if ($filters['dateFrom']) {
        $dateParts[] = 'scraped_date_milan >= ?';
        $params[] = $filters['dateFrom'];
    }
    if ($filters['dateTo']) {
        $dateParts[] = 'scraped_date_milan <= ?';
        $params[] = $filters['dateTo'];
    }
    $dateClause = $dateParts ? ' AND ' . implode(' AND ', $dateParts) : '';
    if ($filters['limits']) {
        $ph = implode(',', array_fill(0, count($filters['limits']), '?'));
        $limitClause = " AND tournament_limit IN ($ph)";
        array_push($params, ...$filters['limits']);
    }
    $where = "player_name = ?{$dateClause}{$limitClause}";

    $kpi = fetch_one(
        $pdo,
        "SELECT COUNT(*) AS total_snapshots,
                COUNT(DISTINCT scraped_date_milan) AS active_days,
                MIN(scraped_at) AS first_seen,
                MAX(scraped_at) AS last_seen,
                MAX(points) AS max_points,
                MIN(`rank`) AS best_rank,
                AVG(points) AS avg_points
         FROM tournament_snapshots
         WHERE {$where}",
        $params
    );

    $byLimit = fetch_all(
        $pdo,
        "SELECT tournament_limit, COUNT(*) AS snapshots,
                COUNT(DISTINCT scraped_date_milan) AS days,
                MAX(points) AS max_points
         FROM tournament_snapshots
         WHERE {$where}
         GROUP BY tournament_limit
         ORDER BY tournament_limit",
        $params
    );

    $dayEnds = fetch_all(
        $pdo,
        "SELECT t.scraped_date_milan AS day, t.tournament_limit, t.points, t.`rank`, t.scraped_at
         FROM tournament_snapshots t
         INNER JOIN (
            SELECT scraped_date_milan, tournament_limit, MAX(scraped_at) AS last_at
            FROM tournament_snapshots
            WHERE {$where}
            GROUP BY scraped_date_milan, tournament_limit
         ) x ON x.scraped_date_milan = t.scraped_date_milan
            AND x.tournament_limit = t.tournament_limit
            AND x.last_at = t.scraped_at
         WHERE t.player_name = ?",
        array_merge($params, [$name])
    );

    $timesInTop = 0;
    foreach ($dayEnds as $r) {
        $rank = (int) $r['rank'];
        if ($rank > 0 && $rank <= $topThreshold) {
            $timesInTop++;
        }
    }

    // История снимков грузится отдельно (lazy), когда пользователь развернёт блок

    // Календарь: этот игрок + выбранные лимиты, окно ~365 дней (короткий dateFrom/dateTo не схлопывает год)
    $calParams = [$name, milan_date_only()];
    $calWhere = 'player_name = ? AND scraped_date_milan >= DATE_SUB(?, INTERVAL 365 DAY)';
    if ($filters['limits']) {
        $ph = implode(',', array_fill(0, count($filters['limits']), '?'));
        $calWhere .= " AND tournament_limit IN ($ph)";
        array_push($calParams, ...$filters['limits']);
    }

    $calRows = fetch_all(
        $pdo,
        "SELECT scraped_date_milan AS day, COUNT(*) AS records, MAX(points) AS max_points
         FROM tournament_snapshots
         WHERE {$calWhere}
         GROUP BY scraped_date_milan
         ORDER BY day",
        $calParams
    );

    $calMap = [];
    foreach ($calRows as $row) {
        $d = substr((string) $row['day'], 0, 10);
        $calMap[$d] = [
            'records' => (int) ($row['records'] ?? 0),
            'max_points' => (int) ($row['max_points'] ?? 0),
        ];
    }

    $downtime = load_downtime_ranges();
    $tz = new DateTimeZone('UTC');
    $today = new DateTimeImmutable('today', $tz);
    $rangeStart = $today->modify('-364 days');
    // Выравнивание под сетку Пн→Вс (колонки = недели)
    $padDays = ((int) $rangeStart->format('N')) - 1;
    $cursor = $rangeStart->modify("-{$padDays} days");
    $calendar = [];
    while ($cursor <= $today) {
        $d = $cursor->format('Y-m-d');
        $inRange = $d >= $rangeStart->format('Y-m-d');
        $hit = $calMap[$d] ?? null;
        $records = ($inRange && $hit) ? $hit['records'] : 0;
        $maxPoints = ($inRange && $hit) ? $hit['max_points'] : 0;
        $isDown = $inRange && is_downtime_day($d, $downtime);
        if (!$inRange) {
            $status = 'pad';
        } elseif ($isDown) {
            $status = 'downtime';
        } elseif ($records > 0) {
            $status = 'ok';
        } else {
            $status = 'empty';
        }
        $calendar[] = [
            'day' => $d,
            'records' => $records,
            'max_points' => $maxPoints,
            'pad' => !$inRange,
            'status' => $status,
        ];
        $cursor = $cursor->modify('+1 day');
    }

    // Расписание игры: всегда окно ~90 дней (фильтр дат профиля на KPI не отменяет картину графика)
    $schedParams = [$name, milan_date_only()];
    $schedWhere = 'player_name = ? AND scraped_date_milan >= DATE_SUB(?, INTERVAL 90 DAY)';
    if ($filters['limits']) {
        $ph = implode(',', array_fill(0, count($filters['limits']), '?'));
        $schedWhere .= " AND tournament_limit IN ($ph)";
        array_push($schedParams, ...$filters['limits']);
    }

    $snapRows = fetch_all(
        $pdo,
        "SELECT scraped_at, scraped_date_milan AS day, points, tournament_limit
         FROM tournament_snapshots
         WHERE {$schedWhere}",
        $schedParams
    );

    $scheduleOverall = build_player_schedule($snapRows);
    $byLimitBuckets = [];
    foreach ($snapRows as $row) {
        $lim = (string) ($row['tournament_limit'] ?? '');
        if ($lim === '') {
            continue;
        }
        $byLimitBuckets[$lim][] = $row;
    }
    ksort($byLimitBuckets, SORT_NATURAL);
    $scheduleByLimit = [];
    foreach ($byLimitBuckets as $lim => $rows) {
        $built = build_player_schedule($rows);
        $scheduleByLimit[] = [
            'limit' => (string) $lim,
            'byHour' => $built['byHour'],
            'byWeekday' => $built['byWeekday'],
            'peak_hour' => $built['peak_hour'],
            'peak_weekday' => $built['peak_weekday'],
            'peak_weekday_label' => $built['peak_weekday_label'],
        ];
    }

    json_response([
        'player_name' => $name,
        'reg' => $reg,
        'note' => ($noteRow['note'] ?? null),
        'note_updated_at' => ($noteRow['updated_at'] ?? null),
        'topThreshold' => $topThreshold,
        'kpi' => [
            'total_snapshots' => (int) ($kpi['total_snapshots'] ?? 0),
            'active_days' => (int) ($kpi['active_days'] ?? 0),
            'first_seen' => $kpi['first_seen'] ?? null,
            'last_seen' => $kpi['last_seen'] ?? null,
            'max_points' => (int) ($kpi['max_points'] ?? 0),
            'best_rank' => isset($kpi['best_rank']) ? (int) $kpi['best_rank'] : null,
            'avg_points' => isset($kpi['avg_points']) ? (int) round((float) $kpi['avg_points']) : null,
            'times_in_top' => $timesInTop,
            'peak_hour' => $scheduleOverall['peak_hour'],
            'peak_weekday' => $scheduleOverall['peak_weekday'],
            'peak_weekday_label' => $scheduleOverall['peak_weekday_label'],
        ],
        'byLimit' => $byLimit,
        'history' => [],
        'historyLazy' => true,
        'calendar' => $calendar,
        'calendarMeta' => [
            'windowDays' => 365,
            'limitsApplied' => (bool) $filters['limits'],
        ],
        'downtime' => $downtime,
        'dayEnds' => $dayEnds,
        'schedule' => [
            'windowDays' => 90,
            'byHour' => $scheduleOverall['byHour'],
            'byWeekday' => $scheduleOverall['byWeekday'],
            'byLimit' => $scheduleByLimit,
            'limitsApplied' => (bool) $filters['limits'],
        ],
    ]);
}

/** Последние снимки игрока — lazy endpoint для профиля. */
function handle_player_history(PDO $pdo, string $name): void
{
    $name = trim(rawurldecode($name));
    if ($name === '') {
        json_error('name обязателен', 400);
    }

    $filters = query_filters();
    $limit = max(1, min(500, (int) ($_GET['limit'] ?? 100)));

    $params = [$name];
    $dateParts = [];
    if ($filters['dateFrom']) {
        $dateParts[] = 'scraped_date_milan >= ?';
        $params[] = $filters['dateFrom'];
    }
    if ($filters['dateTo']) {
        $dateParts[] = 'scraped_date_milan <= ?';
        $params[] = $filters['dateTo'];
    }
    $dateClause = $dateParts ? ' AND ' . implode(' AND ', $dateParts) : '';
    $limitClause = '';
    if ($filters['limits']) {
        $ph = implode(',', array_fill(0, count($filters['limits']), '?'));
        $limitClause = " AND tournament_limit IN ($ph)";
        array_push($params, ...$filters['limits']);
    }
    $where = "player_name = ?{$dateClause}{$limitClause}";

    $history = fetch_all(
        $pdo,
        "SELECT scraped_at, scraped_date_milan, tournament_limit, points, `rank`
         FROM tournament_snapshots
         WHERE {$where}
         ORDER BY scraped_at DESC
         LIMIT {$limit}",
        $params
    );

    json_response([
        'player_name' => $name,
        'history' => $history,
        'limit' => $limit,
    ]);
}

/**
 * Тепловая карта день×час за месяц.
 * mode=player (по умолчанию) — один игрок (профиль).
 * mode=density — сумма diff_points по аудитории (игроки / сегмент / все).
 * Источник: analytics_player_hour.
 */
function handle_heatmap(PDO $pdo): void
{
    ensure_aggregate_tables($pdo);
    $mode = strtolower(trim((string) ($_GET['mode'] ?? 'player')));
    if ($mode === 'sum' || $mode === 'aggregate') {
        $mode = 'density';
    }
    if ($mode !== 'density') {
        $mode = 'player';
    }

    $limitsWanted = ['16-25', '50', '100', '250'];
    $limit = trim((string) ($_GET['limit'] ?? ''));
    if ($limit === '') {
        $fromFilters = parse_list($_GET['limits'] ?? null);
        $limit = $fromFilters[0] ?? '100';
    }
    if (!in_array($limit, $limitsWanted, true)) {
        json_error('Некорректный limit', 400);
    }

    $today = milan_date_only();
    $month = substr((string) ($_GET['month'] ?? ''), 0, 7);
    if ($month === '' || !preg_match('/^\d{4}-\d{2}$/', $month)) {
        $month = substr($today, 0, 7);
    }

    $dayFrom = $month . '-01';
    try {
        $dt = new DateTimeImmutable($dayFrom . ' 12:00:00', new DateTimeZone('UTC'));
    } catch (Exception $e) {
        json_error('Некорректный month', 400);
    }
    $dayTo = $dt->modify('last day of this month')->format('Y-m-d');
    $daysInMonth = (int) $dt->format('t');

    if ($mode === 'density') {
        handle_heatmap_density($pdo, $limit, $month, $dayFrom, $dayTo, $daysInMonth);
        return;
    }

    $player = trim((string) ($_GET['player'] ?? ''));
    if ($player === '') {
        $players = parse_list($_GET['players'] ?? null);
        $player = $players[0] ?? '';
    }
    if ($player === '') {
        json_error('Нужен player (или players=ник)', 400);
    }

    // Доступные месяцы по агрегату (без учёта лимита — шире выбор)
    $monthRows = fetch_all(
        $pdo,
        "SELECT DISTINCT DATE_FORMAT(day, '%Y-%m') AS ym
         FROM analytics_player_hour
         WHERE LOWER(player_name) = LOWER(?)
         ORDER BY ym DESC
         LIMIT 36",
        [$player]
    );
    $monthsAvailable = array_values(array_filter(array_map(
        static fn($r) => (string) ($r['ym'] ?? ''),
        $monthRows
    )));

    $rows = fetch_all(
        $pdo,
        "SELECT day, hour, diff_points, delta_hour, min_points_hour, max_points_hour,
                min_at, max_at, speed, has_snapshot, max_points_carry, diff_seconds
         FROM analytics_player_hour
         WHERE LOWER(player_name) = LOWER(?)
           AND tournament_limit = ?
           AND day >= ? AND day <= ?
         ORDER BY day ASC, hour ASC",
        [$player, $limit, $dayFrom, $dayTo]
    );

    $wdLabels = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']; // PHP date('w'): 0=Sun
    $byKey = [];
    $maxDiff = 0;
    $prevMaxByDay = [];
    foreach ($rows as $r) {
        $day = substr((string) $r['day'], 0, 10);
        $hour = (int) $r['hour'];
        $hourMax = (int) ($r['max_points_hour'] ?? 0);
        $storedDelta = isset($r['delta_hour']) ? (int) $r['delta_hour'] : null;
        $prev = $prevMaxByDay[$day] ?? null;
        $computed = player_hour_delta_vs_prev($prev, $hourMax);
        $diff = ($storedDelta !== null && !($storedDelta === 0 && $computed > 0))
            ? $storedDelta
            : $computed;
        $prevMaxByDay[$day] = $hourMax;
        if ($diff > $maxDiff) {
            $maxDiff = $diff;
        }
        $byKey[$day . '|' . $hour] = [
            'day' => $day,
            'hour' => $hour,
            'diff_points' => $diff,
            'diff_within_hour' => (int) ($r['diff_points'] ?? 0),
            'min_points_hour' => (int) ($r['min_points_hour'] ?? 0),
            'max_points_hour' => $hourMax,
            'min_at' => $r['min_at'] ?? null,
            'max_at' => $r['max_at'] ?? null,
            'speed' => $r['speed'] !== null ? (float) $r['speed'] : null,
            'diff_seconds' => (int) ($r['diff_seconds'] ?? 0),
            'has_snapshot' => (int) ($r['has_snapshot'] ?? 0),
            'max_points_carry' => (int) ($r['max_points_carry'] ?? 0),
        ];
    }

    $scrapeMap = load_scrape_status_by_day($pdo, $dayFrom, $dayTo);

    $days = [];
    for ($dom = 1; $dom <= $daysInMonth; $dom++) {
        $day = sprintf('%s-%02d', $month, $dom);
        $w = (int) (new DateTimeImmutable($day . 'T12:00:00Z'))->format('w');
        $scrapeDay = $scrapeMap[$day] ?? [];
        $hours = [];
        $dayMax = 0;
        $dayHasPts = false;
        for ($h = 0; $h < 24; $h++) {
            $cell = $byKey[$day . '|' . $h] ?? null;
            $base = $cell ?: [
                'day' => $day,
                'hour' => $h,
                'diff_points' => null,
                'min_points_hour' => null,
                'max_points_hour' => null,
                'min_at' => null,
                'max_at' => null,
                'speed' => null,
                'diff_seconds' => null,
                'has_snapshot' => 0,
                'max_points_carry' => null,
                'empty' => true,
            ];
            $st = $scrapeDay[$h] ?? null;
            $base['serverDown'] = scrape_hour_is_server_down($st, $day, $h);
            if ($cell) {
                $carry = (int) ($cell['max_points_carry'] ?? 0);
                $hourMax = (int) ($cell['max_points_hour'] ?? 0);
                $dayMax = max($dayMax, $carry, $hourMax);
                $dayHasPts = true;
            }
            $hours[] = $base;
        }
        $days[] = [
            'day' => $day,
            'dom' => $dom,
            'weekday' => $w,
            'weekdayLabel' => $wdLabels[$w],
            'dayMax' => $dayHasPts ? $dayMax : null,
            'hours' => $hours,
        ];
    }

    json_response([
        'mode' => 'player',
        'player' => $player,
        'month' => $month,
        'limit' => $limit,
        'dayFrom' => $dayFrom,
        'dayTo' => $dayTo,
        'daysInMonth' => $daysInMonth,
        'maxDiff' => $maxDiff,
        'monthsAvailable' => $monthsAvailable,
        'days' => $days,
        'source' => 'analytics_player_hour',
        'metric' => 'diff_points',
        'timezone' => settings()['timezone'] ?: 'Europe/Madrid',
    ]);
}

/**
 * Суммарная плотность: прирост поля за день×час.
 * Без фильтра игроков/сегмента — из analytics_hour_slice.volume (готовый срез поля).
 * С фильтром аудитории — SUM прироста carry (час − час−1) по analytics_player_hour.
 */
function handle_heatmap_density(
    PDO $pdo,
    string $limit,
    string $month,
    string $dayFrom,
    string $dayTo,
    int $daysInMonth
): void {
    $filters = query_filters();
    $regs = get_all_regs($pdo);
    $players = $filters['players'] ?? [];
    $segment = normalize_audience_segment((string) ($filters['segment'] ?? 'all'));
    $useSlice = ($segment === 'all' && $players === []);

    if ($useSlice) {
        $sliceOk = handle_heatmap_density_from_slice(
            $pdo,
            $limit,
            $month,
            $dayFrom,
            $dayTo,
            $daysInMonth,
            $players,
            $segment
        );
        if ($sliceOk) {
            return;
        }
        // slice пуст / нет таблицы — fallback на player_hour
    }

    $where = [
        'tournament_limit = ?',
        'day >= ?',
        'day <= ?',
    ];
    $params = [$limit, $dayFrom, $dayTo];

    if (!apply_player_audience_where($where, $params, $players, $segment, $regs)) {
        json_response(heatmap_density_empty_payload($limit, $month, $dayFrom, $dayTo, $daysInMonth, $players, $segment));
        return;
    }

    $whereSql = implode(' AND ', $where);
    $deltaSub = sql_player_hour_delta_from_carry_subquery($whereSql);

    $monthsAvailable = heatmap_density_months_available($pdo, $limit);

    try {
        $rows = fetch_all(
            $pdo,
            "SELECT day, hour,
                    SUM(delta_calc) AS diff_points,
                    COUNT(*) AS players_n,
                    AVG(speed) AS speed
             FROM ({$deltaSub}) AS ph_delta
             GROUP BY day, hour
             ORDER BY day ASC, hour ASC",
            $params
        );
    } catch (Throwable $e) {
        json_error('Ошибка чтения analytics_player_hour: ' . $e->getMessage(), 500);
    }

    $uniquePlayers = fetch_one(
        $pdo,
        "SELECT COUNT(DISTINCT player_name) AS n
         FROM analytics_player_hour
         WHERE {$whereSql}",
        $params
    );
    $playerCount = (int) ($uniquePlayers['n'] ?? 0);

    $byHourAgg = [];
    try {
        $hourRows = fetch_all(
            $pdo,
            "SELECT hour,
                    SUM(delta_calc) AS diff_points,
                    COUNT(DISTINCT player_name) AS players_n,
                    AVG(speed) AS speed
             FROM ({$deltaSub}) AS ph_delta
             GROUP BY hour
             ORDER BY hour ASC",
            $params
        );
        foreach ($hourRows as $hr) {
            $byHourAgg[(int) $hr['hour']] = $hr;
        }
    } catch (Throwable $e) {
        $byHourAgg = [];
    }

    json_response(heatmap_density_build_payload(
        $pdo,
        $limit,
        $month,
        $dayFrom,
        $dayTo,
        $daysInMonth,
        $players,
        $segment,
        $playerCount,
        $rows,
        $byHourAgg,
        $monthsAvailable,
        'analytics_player_hour',
        'max_points_carry_prev_hour'
    ));
}

/**
 * Плотность из готового среза поля (C(H)−C(H−1) уже посчитан в hour_slice).
 *
 * @param list<string> $players
 * @return bool true если ответ уже отправлен
 */
function handle_heatmap_density_from_slice(
    PDO $pdo,
    string $limit,
    string $month,
    string $dayFrom,
    string $dayTo,
    int $daysInMonth,
    array $players,
    string $segment
): bool {
    $monthsAvailable = heatmap_density_months_available_slice($pdo, $limit);

    try {
        $rows = fetch_all(
            $pdo,
            "SELECT day, hour,
                    volume AS diff_points,
                    players_active_hour AS players_n,
                    NULL AS speed
             FROM analytics_hour_slice
             WHERE tournament_limit = ?
               AND segment = 'all'
               AND day >= ?
               AND day <= ?
             ORDER BY day ASC, hour ASC",
            [$limit, $dayFrom, $dayTo]
        );
    } catch (Throwable $e) {
        return false;
    }

    if ($rows === []) {
        return false;
    }

    $uniquePlayers = fetch_one(
        $pdo,
        "SELECT COUNT(DISTINCT player_name) AS n
         FROM analytics_player_hour
         WHERE tournament_limit = ?
           AND day >= ?
           AND day <= ?",
        [$limit, $dayFrom, $dayTo]
    );
    $playerCount = (int) ($uniquePlayers['n'] ?? 0);

    $byHourAgg = [];
    try {
        $hourRows = fetch_all(
            $pdo,
            "SELECT hour,
                    SUM(volume) AS diff_points,
                    MAX(players_active_hour) AS players_n,
                    NULL AS speed
             FROM analytics_hour_slice
             WHERE tournament_limit = ?
               AND segment = 'all'
               AND day >= ?
               AND day <= ?
             GROUP BY hour
             ORDER BY hour ASC",
            [$limit, $dayFrom, $dayTo]
        );
        foreach ($hourRows as $hr) {
            $byHourAgg[(int) $hr['hour']] = $hr;
        }
    } catch (Throwable $e) {
        $byHourAgg = [];
    }

    json_response(heatmap_density_build_payload(
        $pdo,
        $limit,
        $month,
        $dayFrom,
        $dayTo,
        $daysInMonth,
        $players,
        $segment,
        $playerCount,
        $rows,
        $byHourAgg,
        $monthsAvailable,
        'analytics_hour_slice',
        'hour_slice_volume'
    ));
    return true;
}

/**
 * @return list<string>
 */
function heatmap_density_months_available(PDO $pdo, string $limit): array
{
    $monthRows = fetch_all(
        $pdo,
        "SELECT DISTINCT DATE_FORMAT(day, '%Y-%m') AS ym
         FROM analytics_player_hour
         WHERE tournament_limit = ?
         ORDER BY ym DESC
         LIMIT 36",
        [$limit]
    );
    return array_values(array_filter(array_map(
        static fn($r) => (string) ($r['ym'] ?? ''),
        $monthRows
    )));
}

/**
 * @return list<string>
 */
function heatmap_density_months_available_slice(PDO $pdo, string $limit): array
{
    try {
        $monthRows = fetch_all(
            $pdo,
            "SELECT DISTINCT DATE_FORMAT(day, '%Y-%m') AS ym
             FROM analytics_hour_slice
             WHERE tournament_limit = ?
               AND segment = 'all'
             ORDER BY ym DESC
             LIMIT 36",
            [$limit]
        );
        $list = array_values(array_filter(array_map(
            static fn($r) => (string) ($r['ym'] ?? ''),
            $monthRows
        )));
        if ($list !== []) {
            return $list;
        }
    } catch (Throwable $e) {
        // fallback ниже
    }
    return heatmap_density_months_available($pdo, $limit);
}

/**
 * Сборка JSON плотности из уже выбранных day×hour и byHour строк.
 *
 * @param list<string> $players
 * @param list<array<string,mixed>> $rows
 * @param array<int, array<string,mixed>> $byHourAgg
 * @param list<string> $monthsAvailable
 * @return array<string, mixed>
 */
function heatmap_density_build_payload(
    PDO $pdo,
    string $limit,
    string $month,
    string $dayFrom,
    string $dayTo,
    int $daysInMonth,
    array $players,
    string $segment,
    int $playerCount,
    array $rows,
    array $byHourAgg,
    array $monthsAvailable,
    string $source,
    string $deltaSource
): array {
    $wdLabels = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    $byKey = [];
    $maxDiff = 0;
    foreach ($rows as $r) {
        $day = substr((string) $r['day'], 0, 10);
        $hour = (int) $r['hour'];
        $diff = (int) round((float) ($r['diff_points'] ?? 0));
        if ($diff > $maxDiff) {
            $maxDiff = $diff;
        }
        $byKey[$day . '|' . $hour] = [
            'day' => $day,
            'hour' => $hour,
            'diff_points' => $diff,
            'players_n' => (int) ($r['players_n'] ?? 0),
            'speed' => $r['speed'] !== null ? (float) $r['speed'] : null,
            'min_points_hour' => null,
            'max_points_hour' => null,
            'min_at' => null,
            'max_at' => null,
            'diff_seconds' => null,
            'has_snapshot' => 1,
            'max_points_carry' => null,
        ];
    }

    $scrapeMap = load_scrape_status_by_day($pdo, $dayFrom, $dayTo);

    $days = [];
    for ($dom = 1; $dom <= $daysInMonth; $dom++) {
        $day = sprintf('%s-%02d', $month, $dom);
        $w = (int) (new DateTimeImmutable($day . 'T12:00:00Z'))->format('w');
        $scrapeDay = $scrapeMap[$day] ?? [];
        $hours = [];
        $daySum = 0;
        $dayHasPts = false;
        for ($h = 0; $h < 24; $h++) {
            $cell = $byKey[$day . '|' . $h] ?? null;
            $base = $cell ?: [
                'day' => $day,
                'hour' => $h,
                'diff_points' => null,
                'players_n' => 0,
                'speed' => null,
                'min_points_hour' => null,
                'max_points_hour' => null,
                'min_at' => null,
                'max_at' => null,
                'diff_seconds' => null,
                'has_snapshot' => 0,
                'max_points_carry' => null,
                'empty' => true,
            ];
            $st = $scrapeDay[$h] ?? null;
            $base['serverDown'] = scrape_hour_is_server_down($st, $day, $h);
            if ($cell) {
                $daySum += (int) ($cell['diff_points'] ?? 0);
                $dayHasPts = true;
            }
            $hours[] = $base;
        }
        $days[] = [
            'day' => $day,
            'dom' => $dom,
            'weekday' => $w,
            'weekdayLabel' => $wdLabels[$w],
            'dayMax' => $dayHasPts ? $daySum : null,
            'hours' => $hours,
        ];
    }

    $byHour = [];
    $hourMaxDiff = 0;
    $monthSum = 0;
    $monthHasPts = false;
    for ($h = 0; $h < 24; $h++) {
        $hr = $byHourAgg[$h] ?? null;
        if ($hr) {
            $diff = (int) round((float) ($hr['diff_points'] ?? 0));
            if ($diff > $hourMaxDiff) {
                $hourMaxDiff = $diff;
            }
            $monthSum += $diff;
            $monthHasPts = true;
            $byHour[] = [
                'hour' => $h,
                'diff_points' => $diff,
                'players_n' => (int) ($hr['players_n'] ?? 0),
                'speed' => $hr['speed'] !== null ? (float) $hr['speed'] : null,
                'empty' => false,
                'serverDown' => false,
                'scope' => 'month',
            ];
        } else {
            $byHour[] = [
                'hour' => $h,
                'diff_points' => null,
                'players_n' => 0,
                'speed' => null,
                'empty' => true,
                'serverDown' => false,
                'scope' => 'month',
            ];
        }
    }

    return [
        'mode' => 'density',
        'player' => null,
        'playerCount' => $playerCount,
        'players' => $players,
        'segment' => $segment,
        'month' => $month,
        'limit' => $limit,
        'dayFrom' => $dayFrom,
        'dayTo' => $dayTo,
        'daysInMonth' => $daysInMonth,
        'maxDiff' => $maxDiff,
        'hourMaxDiff' => $hourMaxDiff,
        'byHour' => $byHour,
        'byHourTotal' => $monthHasPts ? $monthSum : null,
        'monthsAvailable' => $monthsAvailable,
        'days' => $days,
        'source' => $source,
        'metric' => 'sum_diff_points',
        'deltaSource' => $deltaSource,
        'dayCol' => 'sum',
        'timezone' => settings()['timezone'] ?: 'Europe/Madrid',
    ];
}

/**
 * Подзапрос: delta_calc = прирост carry к предыдущему часу (час−1; если нет — 0).
 * Без оконных функций — совместимо с MySQL 5.7 (Hostland).
 * hour UNSIGNED: никогда не пишем `a.hour - 1` (при 0 → SQLSTATE 1690 даже в ON).
 * Связка prev: `b.hour + 1 = a.hour`.
 */
function sql_player_hour_delta_from_carry_subquery(string $whereSql): string
{
    // WHERE строится без алиаса → квалифицируем колонки под a.
    $whereA = preg_replace(
        '/\b(tournament_limit|day|hour|player_name)\b/',
        'a.$1',
        $whereSql
    );

    return "
        SELECT
            a.day,
            a.hour,
            a.player_name,
            a.speed,
            a.diff_seconds,
            a.min_points_hour,
            a.max_points_hour,
            a.max_points_carry,
            a.tournament_limit,
            GREATEST(
                0,
                CAST(a.max_points_carry AS SIGNED) - CAST(COALESCE(b.max_points_carry, 0) AS SIGNED)
            ) AS delta_calc
        FROM analytics_player_hour a
        LEFT JOIN analytics_player_hour b
          ON b.player_name = a.player_name
         AND b.day = a.day
         AND b.tournament_limit = a.tournament_limit
         AND b.hour + 1 = a.hour
        WHERE {$whereA}
    ";
}

/**
 * @param list<string> $players
 */
function heatmap_density_empty_payload(
    string $limit,
    string $month,
    string $dayFrom,
    string $dayTo,
    int $daysInMonth,
    array $players,
    string $segment
): array {
    $wdLabels = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    $days = [];
    for ($dom = 1; $dom <= $daysInMonth; $dom++) {
        $day = sprintf('%s-%02d', $month, $dom);
        $w = (int) (new DateTimeImmutable($day . 'T12:00:00Z'))->format('w');
        $hours = [];
        for ($h = 0; $h < 24; $h++) {
            $hours[] = [
                'day' => $day,
                'hour' => $h,
                'diff_points' => null,
                'players_n' => 0,
                'empty' => true,
                'serverDown' => false,
            ];
        }
        $days[] = [
            'day' => $day,
            'dom' => $dom,
            'weekday' => $w,
            'weekdayLabel' => $wdLabels[$w],
            'dayMax' => null,
            'hours' => $hours,
        ];
    }
    $byHour = [];
    for ($h = 0; $h < 24; $h++) {
        $byHour[] = [
            'hour' => $h,
            'diff_points' => null,
            'players_n' => 0,
            'empty' => true,
            'serverDown' => false,
            'scope' => 'month',
        ];
    }
    return [
        'mode' => 'density',
        'player' => null,
        'playerCount' => 0,
        'players' => $players,
        'segment' => $segment,
        'month' => $month,
        'limit' => $limit,
        'dayFrom' => $dayFrom,
        'dayTo' => $dayTo,
        'daysInMonth' => $daysInMonth,
        'maxDiff' => 0,
        'hourMaxDiff' => 0,
        'byHour' => $byHour,
        'byHourTotal' => null,
        'monthsAvailable' => [],
        'days' => $days,
        'source' => 'analytics_player_hour',
        'metric' => 'sum_diff_points',
        'dayCol' => 'sum',
        'timezone' => settings()['timezone'] ?: 'Europe/Madrid',
        'note' => 'В сегменте нет игроков',
    ];
}

/**
 * Разбор ячейки плотности:
 * - day=YYYY-MM-DD + hour → игроки за этот день×час
 * - month=YYYY-MM + hour (без day) → игроки за весь месяц в этом часу (SUM по дням)
 */
function handle_heatmap_cell(PDO $pdo): void
{
    ensure_aggregate_tables($pdo);
    $limitsWanted = ['16-25', '50', '100', '250'];
    $limit = trim((string) ($_GET['limit'] ?? ''));
    if ($limit === '') {
        $fromFilters = parse_list($_GET['limits'] ?? null);
        $limit = $fromFilters[0] ?? '100';
    }
    if (!in_array($limit, $limitsWanted, true)) {
        json_error('Некорректный limit', 400);
    }

    $hour = (int) ($_GET['hour'] ?? -1);
    if ($hour < 0 || $hour > 23) {
        json_error('hour=0..23', 400);
    }

    $day = substr((string) ($_GET['day'] ?? ''), 0, 10);
    $month = substr((string) ($_GET['month'] ?? ''), 0, 7);
    $scopeMonth = ($day === '' || $day === '0') && preg_match('/^\d{4}-\d{2}$/', $month);
    if (!$scopeMonth && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        // month+hour без day тоже ок
        if (preg_match('/^\d{4}-\d{2}$/', $month)) {
            $scopeMonth = true;
        } else {
            json_error('day=YYYY-MM-DD или month=YYYY-MM', 400);
        }
    }

    $dayFrom = null;
    $dayTo = null;
    if ($scopeMonth) {
        $dt = DateTimeImmutable::createFromFormat('!Y-m', $month);
        if (!$dt) {
            json_error('month=YYYY-MM', 400);
        }
        $dayFrom = $dt->format('Y-m-01');
        $dayTo = $dt->format('Y-m-t');
    }

    $filters = query_filters();
    $regs = get_all_regs($pdo);
    $players = $filters['players'] ?? [];
    $segment = normalize_audience_segment((string) ($filters['segment'] ?? 'all'));

    // Без hour в WHERE подзапроса: нужен JOIN к часу−1 того же дня.
    $where = ['tournament_limit = ?'];
    $params = [$limit];
    if ($scopeMonth) {
        $where[] = 'day >= ?';
        $where[] = 'day <= ?';
        $params[] = $dayFrom;
        $params[] = $dayTo;
    } else {
        $where[] = 'day = ?';
        $params[] = $day;
    }

    if (!apply_player_audience_where($where, $params, $players, $segment, $regs)) {
        json_response([
            'scope' => $scopeMonth ? 'month' : 'day',
            'day' => $scopeMonth ? null : $day,
            'month' => $scopeMonth ? $month : substr($day, 0, 7),
            'hour' => $hour,
            'limit' => $limit,
            'segment' => $segment,
            'total' => 0,
            'sum_diff' => 0,
            'players' => [],
            'deltaSource' => 'max_points_carry_prev_hour',
        ]);
        return;
    }

    $whereSql = implode(' AND ', $where);
    $deltaSub = sql_player_hour_delta_from_carry_subquery($whereSql);
    $paramsWithHour = array_merge($params, [$hour]);

    try {
        if ($scopeMonth) {
            $rows = fetch_all(
                $pdo,
                "SELECT player_name,
                        SUM(delta_calc) AS diff_points,
                        AVG(speed) AS speed,
                        SUM(diff_seconds) AS diff_seconds,
                        MIN(min_points_hour) AS min_points_hour,
                        MAX(max_points_hour) AS max_points_hour,
                        MAX(max_points_carry) AS max_points_carry,
                        COUNT(*) AS days_n
                 FROM ({$deltaSub}) AS ph_delta
                 WHERE hour = ?
                 GROUP BY player_name
                 ORDER BY diff_points DESC, player_name ASC",
                $paramsWithHour
            );
        } else {
            $rows = fetch_all(
                $pdo,
                "SELECT player_name, delta_calc AS diff_points, speed, diff_seconds,
                        min_points_hour, max_points_hour, max_points_carry
                 FROM ({$deltaSub}) AS ph_delta
                 WHERE hour = ?
                 ORDER BY diff_points DESC, player_name ASC",
                $paramsWithHour
            );
        }
    } catch (Throwable $e) {
        json_error('Ошибка чтения analytics_player_hour: ' . $e->getMessage(), 500);
    }

    $playersOut = [];
    $sumDiff = 0;
    foreach ($rows as $r) {
        $diff = (int) round((float) ($r['diff_points'] ?? 0));
        $sumDiff += $diff;
        $item = [
            'player_name' => (string) ($r['player_name'] ?? ''),
            'diff_points' => $diff,
            'speed' => $r['speed'] !== null ? (float) $r['speed'] : null,
            'diff_seconds' => isset($r['diff_seconds']) ? (int) $r['diff_seconds'] : null,
            'min_points_hour' => isset($r['min_points_hour']) ? (int) $r['min_points_hour'] : null,
            'max_points_hour' => isset($r['max_points_hour']) ? (int) $r['max_points_hour'] : null,
            'max_points_carry' => isset($r['max_points_carry']) ? (int) $r['max_points_carry'] : null,
        ];
        if ($scopeMonth && isset($r['days_n'])) {
            $item['days_n'] = (int) $r['days_n'];
        }
        $playersOut[] = $item;
    }

    json_response([
        'scope' => $scopeMonth ? 'month' : 'day',
        'day' => $scopeMonth ? null : $day,
        'month' => $scopeMonth ? $month : substr($day, 0, 7),
        'dayFrom' => $dayFrom,
        'dayTo' => $dayTo,
        'hour' => $hour,
        'limit' => $limit,
        'segment' => $segment,
        'playersFilter' => $players,
        'total' => count($playersOut),
        'sum_diff' => $sumDiff,
        'players' => $playersOut,
        'source' => 'analytics_player_hour',
        'deltaSource' => 'max_points_carry_prev_hour',
    ]);
}

/**
 * Тепловая карта день×час для профиля: analytics_player_hour за месяц/лимит.
 * Оси: строки = день месяца, столбцы = час 0–23 ES. Цвет = diff_points.
 */
function handle_player_hour_heatmap(PDO $pdo, string $name): void
{
    ensure_aggregate_tables($pdo);
    $name = trim(rawurldecode($name));
    if ($name === '') {
        json_error('name обязателен', 400);
    }

    $limitsAllowed = ['16-25', '50', '100', '250'];
    $limit = isset($_GET['limit']) ? (string) $_GET['limit'] : '100';
    if (!in_array($limit, $limitsAllowed, true)) {
        json_error('limit: 16-25|50|100|250', 400);
    }

    $month = isset($_GET['month']) ? substr((string) $_GET['month'], 0, 7) : '';
    if ($month !== '' && !preg_match('/^\d{4}-\d{2}$/', $month)) {
        json_error('month=YYYY-MM', 400);
    }

    $monthsRows = [];
    try {
        $monthsRows = fetch_all(
            $pdo,
            'SELECT DISTINCT LEFT(day, 7) AS ym
             FROM analytics_player_hour
             WHERE LOWER(player_name) = LOWER(?) AND tournament_limit = ?
             ORDER BY ym ASC',
            [$name, $limit]
        );
    } catch (Throwable $e) {
        json_response([
            'player_name' => $name,
            'limit' => $limit,
            'month' => $month !== '' ? $month : substr(milan_date_only(), 0, 7),
            'monthsAvailable' => [],
            'daysInMonth' => 0,
            'maxDiff' => 0,
            'cells' => [],
            'source' => 'analytics_player_hour',
            'error' => 'Таблица агрегата недоступна: ' . $e->getMessage(),
        ]);
    }

    $monthsAvailable = array_values(array_filter(array_map(
        static fn($r) => (string) ($r['ym'] ?? ''),
        $monthsRows
    )));

    if ($month === '') {
        $month = $monthsAvailable
            ? $monthsAvailable[count($monthsAvailable) - 1]
            : substr(milan_date_only(), 0, 7);
    }

    $tz = new DateTimeZone(settings()['timezone'] ?: 'Europe/Madrid');
    try {
        $monthStart = new DateTimeImmutable($month . '-01', $tz);
    } catch (Exception $e) {
        json_error('Некорректный месяц', 400);
    }
    $dayFrom = $monthStart->format('Y-m-d');
    $dayTo = $monthStart->modify('last day of this month')->format('Y-m-d');
    $daysInMonth = (int) $monthStart->format('t');

    $rows = fetch_all(
        $pdo,
        'SELECT day, hour, diff_points, delta_hour, min_points_hour, max_points_hour,
                min_at, max_at, diff_seconds, speed, has_snapshot, max_points_carry
         FROM analytics_player_hour
         WHERE LOWER(player_name) = LOWER(?)
           AND tournament_limit = ?
           AND day >= ? AND day <= ?
         ORDER BY day ASC, hour ASC',
        [$name, $limit, $dayFrom, $dayTo]
    );

    $byKey = [];
    $maxDiff = 0;
    $prevMaxByDay = [];
    foreach ($rows as $r) {
        $d = substr((string) $r['day'], 0, 10);
        $h = (int) $r['hour'];
        $hourMax = (int) ($r['max_points_hour'] ?? 0);
        $storedDelta = isset($r['delta_hour']) ? (int) $r['delta_hour'] : null;
        $prev = $prevMaxByDay[$d] ?? null;
        $computed = player_hour_delta_vs_prev($prev, $hourMax);
        $diff = ($storedDelta !== null && !($storedDelta === 0 && $computed > 0))
            ? $storedDelta
            : $computed;
        $prevMaxByDay[$d] = $hourMax;
        if ($diff > $maxDiff) {
            $maxDiff = $diff;
        }
        $byKey[$d . '|' . $h] = [
            'day' => $d,
            'hour' => $h,
            'diff_points' => $diff,
            'diff_within_hour' => (int) ($r['diff_points'] ?? 0),
            'min_points_hour' => (int) ($r['min_points_hour'] ?? 0),
            'max_points_hour' => $hourMax,
            'max_points_carry' => (int) ($r['max_points_carry'] ?? 0),
            'min_at' => $r['min_at'] ?? null,
            'max_at' => $r['max_at'] ?? null,
            'diff_seconds' => (int) ($r['diff_seconds'] ?? 0),
            'speed' => $r['speed'] === null ? null : (float) $r['speed'],
            'has_snapshot' => (int) ($r['has_snapshot'] ?? 0),
        ];
    }

    $wdLabels = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']; // DateTime format('w')
    $cells = [];
    for ($dom = 1; $dom <= $daysInMonth; $dom++) {
        $day = sprintf('%s-%02d', $month, $dom);
        try {
            $dt = new DateTimeImmutable($day . 'T12:00:00', $tz);
            $w = (int) $dt->format('w');
        } catch (Exception $e) {
            continue;
        }
        for ($h = 0; $h < 24; $h++) {
            $hit = $byKey[$day . '|' . $h] ?? null;
            $cells[] = [
                'day' => $day,
                'dom' => $dom,
                'weekday' => $w,
                'weekdayLabel' => $wdLabels[$w],
                'hour' => $h,
                'diff_points' => $hit ? $hit['diff_points'] : null,
                'min_points_hour' => $hit['min_points_hour'] ?? null,
                'max_points_hour' => $hit['max_points_hour'] ?? null,
                'max_points_carry' => $hit['max_points_carry'] ?? null,
                'min_at' => $hit['min_at'] ?? null,
                'max_at' => $hit['max_at'] ?? null,
                'diff_seconds' => $hit['diff_seconds'] ?? null,
                'speed' => $hit['speed'] ?? null,
                'has_snapshot' => $hit['has_snapshot'] ?? 0,
                'empty' => $hit === null,
            ];
        }
    }

    json_response([
        'player_name' => $name,
        'limit' => $limit,
        'month' => $month,
        'dayFrom' => $dayFrom,
        'dayTo' => $dayTo,
        'daysInMonth' => $daysInMonth,
        'monthsAvailable' => $monthsAvailable,
        'maxDiff' => $maxDiff,
        'cells' => $cells,
        'source' => 'analytics_player_hour',
        'metric' => 'diff_points',
        'timezone' => settings()['timezone'] ?: 'Europe/Madrid',
    ]);
}
