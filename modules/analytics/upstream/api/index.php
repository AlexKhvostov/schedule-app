<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/routes/regs.php';
require_once __DIR__ . '/routes/notes.php';
require_once __DIR__ . '/routes/reports.php';
require_once __DIR__ . '/routes/admin.php';

send_cors();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = request_path();

// Normalize: strip trailing slash except root
if ($path !== '/' && str_ends_with($path, '/')) {
    $path = rtrim($path, '/');
}

try {
    if ($path === '/health' && $method === 'GET') {
        $s = settings();
        $mysql = false;
        $error = null;
        try {
            if ($s['mysql']['host'] && $s['mysql']['user'] && $s['mysql']['database']) {
                $pdo = db();
                $pdo->query('SELECT 1');
                $mysql = true;
            } else {
                $error = 'Заполните MYSQL_* в ' . $s['envPath'];
            }
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }
        json_response([
            'status' => $mysql ? 'ok' : 'degraded',
            'service' => 'v2-analytics-php',
            'mysql' => $mysql,
            'database' => $s['mysql']['database'],
            'host' => $s['mysql']['host'],
            'envPath' => $s['envPath'],
            'error' => $error,
            'milanDate' => milan_date_only(),
            'time' => gmdate('c'),
        ], $mysql ? 200 : 503);
    }

    if ($path === '/api/admin/login' && $method === 'POST') {
        handle_admin_login();
    }
    if ($path === '/api/admin/session' && $method === 'GET') {
        handle_admin_session();
    }
    if ($path === '/api/admin/logout' && $method === 'POST') {
        handle_admin_logout();
    }

    $pdo = db();

    if ($path === '/api/admin/tables' && $method === 'GET') {
        handle_admin_tables($pdo);
    }
    if (preg_match('#^/api/admin/tables/([a-z0-9_]+)$#', $path, $m) && $method === 'GET') {
        handle_admin_table_detail($pdo, $m[1]);
    }
    if (preg_match('#^/api/admin/tables/([a-z0-9_]+)/rows$#', $path, $m) && $method === 'GET') {
        handle_admin_table_rows($pdo, $m[1]);
    }
    if (preg_match('#^/api/admin/tables/([a-z0-9_]+)/run$#', $path, $m) && $method === 'POST') {
        handle_admin_job_run($pdo, $m[1]);
    }
    if ($path === '/api/admin/player-hour/coverage' && $method === 'GET') {
        handle_admin_player_hour_coverage($pdo);
    }
    if ($path === '/api/admin/player-hour/run-day' && $method === 'POST') {
        handle_admin_player_hour_run_day($pdo);
    }
    if ($path === '/api/admin/player-hour/schedule' && $method === 'GET') {
        handle_admin_player_hour_schedule_get($pdo);
    }
    if ($path === '/api/admin/player-hour/schedule' && $method === 'POST') {
        handle_admin_player_hour_schedule_save($pdo);
    }
    if ($path === '/api/cron/player-hour-today' && $method === 'POST') {
        handle_cron_player_hour_today($pdo);
    }
    if ($path === '/api/admin/scrape-hour/coverage' && $method === 'GET') {
        handle_admin_scrape_hour_coverage($pdo);
    }

    if ($path === '/api/regs' && $method === 'GET') {
        handle_regs_list($pdo);
    }
    if ($path === '/api/regs/bulk' && $method === 'POST') {
        handle_regs_bulk($pdo);
    }
    if ($path === '/api/regs' && in_array($method, ['POST', 'PUT'], true)) {
        handle_regs_upsert($pdo);
    }
    if (preg_match('#^/api/regs/(.+)$#', $path, $m) && $method === 'DELETE') {
        handle_regs_delete($pdo, $m[1]);
    }

    if ($path === '/api/home' && $method === 'GET') {
        handle_home($pdo);
    }
    if ($path === '/api/points' && $method === 'GET') {
        handle_points($pdo);
    }
    if ($path === '/api/points/heatmap' && $method === 'GET') {
        handle_points_heatmap($pdo);
    }
    if ($path === '/api/yearly' && $method === 'GET') {
        handle_yearly($pdo);
    }
    if ($path === '/api/speed' && $method === 'GET') {
        handle_speed($pdo);
    }
    if ($path === '/api/heatmap' && $method === 'GET') {
        handle_heatmap($pdo);
    }
    if ($path === '/api/heatmap/cell' && $method === 'GET') {
        handle_heatmap_cell($pdo);
    }
    if ($path === '/api/players/search' && $method === 'GET') {
        handle_search($pdo);
    }
    if ($path === '/api/players' && $method === 'GET') {
        handle_players_list($pdo);
    }
    if (preg_match('#^/api/players/(.+)/history$#', $path, $m) && $method === 'GET') {
        handle_player_history($pdo, $m[1]);
    }
    if (preg_match('#^/api/players/(.+)/hour-heatmap$#', $path, $m) && $method === 'GET') {
        handle_player_hour_heatmap($pdo, $m[1]);
    }
    if (preg_match('#^/api/players/(.+)/note$#', $path, $m)) {
        if ($method === 'GET') {
            handle_player_note_get($pdo, $m[1]);
        }
        if (in_array($method, ['POST', 'PUT'], true)) {
            handle_player_note_upsert($pdo, $m[1]);
        }
    }
    if (preg_match('#^/api/players/(.+)$#', $path, $m) && $method === 'GET') {
        if ($m[1] === 'search') {
            handle_search($pdo);
        }
        handle_player_profile($pdo, $m[1]);
    }

    json_error('Not found: ' . $method . ' ' . $path, 404);
} catch (Throwable $e) {
    json_error($e->getMessage(), 500);
}
