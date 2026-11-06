-- Комментарии к игрокам (создаётся API автоматически)
CREATE TABLE IF NOT EXISTS analytics_player_notes (
    player_name VARCHAR(255) NOT NULL,
    note TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (player_name)
);
