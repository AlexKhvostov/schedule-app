<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

function get_all_regs(PDO $pdo): array
{
    return fetch_all($pdo, 'SELECT player_name, side FROM analytics_regs');
}

/**
 * Нормализация сегмента аудитории из UI-фильтра.
 */
function normalize_audience_segment(?string $segment): string
{
    $s = (string) ($segment ?? 'all');
    return in_array($s, ['all', 'regs', 'ours', 'theirs', 'nonregs', 'not_ours', 'not_theirs'], true)
        ? $s
        : 'all';
}

/**
 * Добавляет в WHERE фильтр по списку ников и сегменту регов (как в FilterBar).
 *
 * @param list<string> $where
 * @param list<mixed> $params
 * @param list<string> $players
 * @param list<array{player_name?:string,side?:string}> $regs
 * @return bool false — аудитория пустая, отдавать пустой ответ
 */
function apply_player_audience_where(
    array &$where,
    array &$params,
    array $players,
    string $segment,
    array $regs
): bool {
    $segment = normalize_audience_segment($segment);

    if ($players) {
        $ph = implode(',', array_fill(0, count($players), '?'));
        $where[] = "player_name IN ($ph)";
        array_push($params, ...array_values($players));
    }

    if ($segment === 'all') {
        return true;
    }

    $regNames = [];
    $ours = [];
    $theirs = [];
    foreach ($regs as $r) {
        $name = (string) ($r['player_name'] ?? '');
        if ($name === '') {
            continue;
        }
        $regNames[] = $name;
        $side = (string) ($r['side'] ?? '');
        if ($side === 'ours') {
            $ours[] = $name;
        } elseif ($side === 'theirs') {
            $theirs[] = $name;
        }
    }

    if ($segment === 'regs') {
        if (!$regNames) {
            return false;
        }
        $ph = implode(',', array_fill(0, count($regNames), '?'));
        $where[] = "player_name IN ($ph)";
        array_push($params, ...$regNames);
        return true;
    }

    if ($segment === 'ours') {
        if (!$ours) {
            return false;
        }
        $ph = implode(',', array_fill(0, count($ours), '?'));
        $where[] = "player_name IN ($ph)";
        array_push($params, ...$ours);
        return true;
    }

    if ($segment === 'theirs') {
        if (!$theirs) {
            return false;
        }
        $ph = implode(',', array_fill(0, count($theirs), '?'));
        $where[] = "player_name IN ($ph)";
        array_push($params, ...$theirs);
        return true;
    }

    if ($segment === 'nonregs') {
        if (!$regNames) {
            return true;
        }
        $ph = implode(',', array_fill(0, count($regNames), '?'));
        $where[] = "player_name NOT IN ($ph)";
        array_push($params, ...$regNames);
        return true;
    }

    // Все, кроме своих (чужие + не в списке)
    if ($segment === 'not_ours') {
        if (!$ours) {
            return true;
        }
        $ph = implode(',', array_fill(0, count($ours), '?'));
        $where[] = "player_name NOT IN ($ph)";
        array_push($params, ...$ours);
        return true;
    }

    // Все, кроме чужих (свои + не в списке)
    if ($segment === 'not_theirs') {
        if (!$theirs) {
            return true;
        }
        $ph = implode(',', array_fill(0, count($theirs), '?'));
        $where[] = "player_name NOT IN ($ph)";
        array_push($params, ...$theirs);
        return true;
    }

    return true;
}

function handle_regs_list(PDO $pdo): void
{
    $rows = fetch_all(
        $pdo,
        'SELECT id, player_name, side, note, created_at, updated_at
         FROM analytics_regs ORDER BY side ASC, player_name ASC'
    );
    json_response(['regs' => $rows]);
}

function handle_regs_upsert(PDO $pdo): void
{
    $body = read_json_body();
    $name = trim((string) ($body['player_name'] ?? ''));
    $side = (($body['side'] ?? '') === 'theirs') ? 'theirs' : 'ours';
    $note = array_key_exists('note', $body) ? mb_substr((string) $body['note'], 0, 500) : null;
    if ($name === '') {
        json_error('player_name обязателен', 400);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO analytics_regs (player_name, side, note)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE side = VALUES(side), note = COALESCE(VALUES(note), note)'
    );
    $stmt->execute([$name, $side, $note]);

    $reg = fetch_one(
        $pdo,
        'SELECT id, player_name, side, note, created_at, updated_at
         FROM analytics_regs WHERE player_name = ?',
        [$name]
    );
    json_response(['reg' => $reg]);
}

/**
 * Пакетное добавление регов.
 * Уже существующие ники (без учёта регистра) пропускаются — side не меняется.
 *
 * Body: { players: string[] | "a,b,c", side: "ours"|"theirs" }
 */
function handle_regs_bulk(PDO $pdo): void
{
    $body = read_json_body();
    $side = (($body['side'] ?? '') === 'theirs') ? 'theirs' : 'ours';

    $raw = $body['players'] ?? $body['names'] ?? [];
    if (is_string($raw)) {
        $parts = preg_split('/[,;\n\r]+/', $raw) ?: [];
    } elseif (is_array($raw)) {
        $parts = $raw;
    } else {
        $parts = [];
    }

    $names = [];
    $seenKey = [];
    foreach ($parts as $p) {
        $n = trim((string) $p);
        if ($n === '') {
            continue;
        }
        $n = mb_substr($n, 0, 80);
        $key = mb_strtolower($n);
        if (isset($seenKey[$key])) {
            continue;
        }
        $seenKey[$key] = true;
        $names[] = $n;
    }

    if (!$names) {
        json_error('Укажите ники через запятую', 400);
    }

    $existingRows = fetch_all($pdo, 'SELECT player_name FROM analytics_regs');
    $existingKey = [];
    foreach ($existingRows as $r) {
        $existingKey[mb_strtolower((string) ($r['player_name'] ?? ''))] = true;
    }

    $added = [];
    $skipped = [];
    $ins = $pdo->prepare(
        'INSERT INTO analytics_regs (player_name, side, note) VALUES (?, ?, NULL)'
    );

    try {
        $pdo->beginTransaction();
        foreach ($names as $n) {
            $key = mb_strtolower($n);
            if (isset($existingKey[$key])) {
                $skipped[] = $n;
                continue;
            }
            $ins->execute([$n, $side]);
            $existingKey[$key] = true;
            $added[] = $n;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_error('Ошибка пакетного добавления: ' . $e->getMessage(), 500);
    }

    json_response([
        'side' => $side,
        'added' => $added,
        'skipped' => $skipped,
        'addedCount' => count($added),
        'skippedCount' => count($skipped),
    ]);
}

function handle_regs_delete(PDO $pdo, string $name): void
{
    $name = trim(rawurldecode($name));
    if ($name === '') {
        json_error('name обязателен', 400);
    }
    $stmt = $pdo->prepare('DELETE FROM analytics_regs WHERE player_name = ?');
    $stmt->execute([$name]);
    json_response(['ok' => true, 'player_name' => $name]);
}
