<?php
/**
 * Router for PHP built-in server:
 *   php -S 127.0.0.1:3010 v2/analytics/api/router-dev.php
 *
 * Forwards /api/* and /health to index.php; other paths 404 (Vite serves UI).
 */

declare(strict_types=1);

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($uri === '/health' || str_starts_with($uri, '/api')) {
    require __DIR__ . '/index.php';
    return true;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['error' => 'Use Vite for UI; API is /api/* and /health']);
return true;
