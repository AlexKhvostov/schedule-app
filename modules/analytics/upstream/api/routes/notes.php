<?php

declare(strict_types=1);

function get_player_note(PDO $pdo, string $name): ?array
{
    return fetch_one(
        $pdo,
        'SELECT player_name, note, updated_at FROM analytics_player_notes WHERE player_name = ?',
        [$name]
    );
}

/** Лёгкий GET заметки без тяжёлого профиля. */
function handle_player_note_get(PDO $pdo, string $name): void
{
    $name = trim(rawurldecode($name));
    if ($name === '') {
        json_error('name обязателен', 400);
    }

    $row = get_player_note($pdo, $name);
    json_response([
        'player_name' => $name,
        'note' => $row['note'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
    ]);
}

function handle_player_note_upsert(PDO $pdo, string $name): void
{
    $name = trim(rawurldecode($name));
    if ($name === '') {
        json_error('name обязателен', 400);
    }

    $body = read_json_body();
    $note = trim((string) ($body['note'] ?? ''));
    if (mb_strlen($note) > 4000) {
        json_error('Комментарий слишком длинный (макс. 4000)', 400);
    }

    if ($note === '') {
        $stmt = $pdo->prepare('DELETE FROM analytics_player_notes WHERE player_name = ?');
        $stmt->execute([$name]);
        json_response(['player_name' => $name, 'note' => null, 'updated_at' => null]);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO analytics_player_notes (player_name, note)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE note = VALUES(note)'
    );
    $stmt->execute([$name, $note]);

    $row = get_player_note($pdo, $name);
    json_response([
        'player_name' => $name,
        'note' => $row['note'] ?? $note,
        'updated_at' => $row['updated_at'] ?? null,
    ]);
}
