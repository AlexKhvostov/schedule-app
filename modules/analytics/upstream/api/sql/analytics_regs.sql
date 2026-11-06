-- Таблица регов (создаётся API автоматически; файл для ручного деплоя)
CREATE TABLE IF NOT EXISTS analytics_regs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_name VARCHAR(255) NOT NULL,
    side ENUM('ours', 'theirs') NOT NULL DEFAULT 'ours',
    note VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_player_name (player_name)
);
