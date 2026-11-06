/**
 * Сборка пакета для выгрузки на Hostland.
 * Результат: v2/analytics/hostland-upload/
 *   (содержимое этой папки заливать в корень dashboard.redparty.ru)
 *
 *   npm run v2:analytics-hostland
 *
 * Другой URL-путь:
 *   $env:VITE_BASE = '/analytics/'
 *   npm run v2:analytics-hostland
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const analyticsRoot = __dirname;
const appDir = path.join(analyticsRoot, 'app');
const distDir = path.join(appDir, 'dist');
const apiSrc = path.join(analyticsRoot, 'api');
const envSrc = path.join(analyticsRoot, '.env');
const htaccessSrc = path.join(analyticsRoot, 'public', '.htaccess');
const target = path.join(analyticsRoot, 'hostland-upload');

const base = process.env.VITE_BASE || '/';
const skipBuild = process.env.SKIP_BUILD === '1';

function rmrf(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) rmrf(p);
            else {
                try { fs.unlinkSync(p); } catch { /* ignore */ }
            }
        }
        try { fs.rmdirSync(dir); } catch { /* ignore */ }
    }
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        // Локальные/dev-файлы на хостинг не нужны
        if (entry.name === 'serve.js' || entry.name === 'router-dev.php') continue;
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(from, to);
        else fs.copyFileSync(from, to);
    }
}

function loadAnalyticsEnv() {
    const out = {};
    if (!fs.existsSync(envSrc)) return out;
    for (const line of fs.readFileSync(envSrc, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i < 1) continue;
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        out[key] = val;
    }
    return out;
}

function runBuild() {
    const viteJs = path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!fs.existsSync(viteJs)) {
        console.error('[hostland] нет vite. Сначала: cd v2/analytics/app && npm install');
        process.exit(1);
    }
    const fileEnv = loadAnalyticsEnv();
    const metrikaId = process.env.VITE_YANDEX_METRIKA_ID || fileEnv.VITE_YANDEX_METRIKA_ID || '';
    const webvisor = process.env.VITE_YANDEX_METRIKA_WEBVISOR || fileEnv.VITE_YANDEX_METRIKA_WEBVISOR || '';
    console.log(`[hostland] build base=${base}`);
    console.log(`[hostland] metrika id=${metrikaId || '(выкл)'}`);
    const vite = spawnSync(process.execPath, [viteJs, 'build'], {
        cwd: appDir,
        stdio: 'inherit',
        env: {
            ...process.env,
            VITE_BASE: base,
            VITE_YANDEX_METRIKA_ID: metrikaId,
            VITE_YANDEX_METRIKA_WEBVISOR: webvisor
        }
    });
    if (vite.status !== 0) {
        console.error('[hostland] сборка упала');
        process.exit(vite.status || 1);
    }
}

if (!skipBuild) runBuild();

if (!fs.existsSync(distDir)) {
    console.error('[hostland] нет dist/');
    process.exit(1);
}

console.log(`[hostland] пакет → ${target}`);
rmrf(target);
fs.mkdirSync(target, { recursive: true });

for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    const from = path.join(distDir, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
}

copyDir(apiSrc, path.join(target, 'api'));

// Запасной rewrite внутри api/ (если кто-то бьёт /api/home без index.php)
fs.writeFileSync(
    path.join(target, 'api', '.htaccess'),
    [
        'RewriteEngine On',
        'RewriteCond %{REQUEST_FILENAME} !-f',
        'RewriteRule ^(.*)$ index.php [L,QSA]',
        ''
    ].join('\n'),
    'utf8'
);

let ht = fs.existsSync(htaccessSrc) ? fs.readFileSync(htaccessSrc, 'utf8') : '';
if (ht) {
    const rewriteBase = base.endsWith('/') ? base : `${base}/`;
    // Только директива, не текст в комментариях
    if (/^\s*RewriteBase\s+/m.test(ht)) {
        ht = ht.replace(/^\s*RewriteBase\s+\S+/m, `    RewriteBase ${rewriteBase}`);
    } else {
        ht = ht.replace(/RewriteEngine On/, `RewriteEngine On\n    RewriteBase ${rewriteBase}`);
    }
    fs.writeFileSync(path.join(target, '.htaccess'), ht, 'utf8');
}

if (fs.existsSync(envSrc)) {
    fs.copyFileSync(envSrc, path.join(target, '.env'));
} else {
    console.warn('[hostland] нет v2/analytics/.env — положите .env в пакет вручную');
}

const readme = `# Пакет для Hostland

Собран: ${new Date().toISOString()}
VITE_BASE / RewriteBase: ${base}

## Куда заливать

Залейте СОДЕРЖИМОЕ этой папки в каталог сайта на Hostland,
который открывается как URL с путём ${base}

Основной адрес: http://dashboard.redparty.ru/
При базе / файлы должны лежать непосредственно в корневом каталоге поддомена:
index.html, assets/ и api/ рядом, без дополнительной папки dashboard/.
Точный корневой каталог смотрите в настройках поддомена в панели Hostland.

## Структура (уже собрана)

- index.html, assets/  — фронт
- api/                 — PHP API
- .htaccess            — роутинг
- .env                 — MySQL (не светить в git / публично)

При обновлении существующего сайта сохраните рабочую серверную .env.
Не заменяйте её локальной без проверки настроек подключения.
Обязательно загрузите скрытый файл .htaccess.

## Проверка

1. http://ВАШ_ДОМЕН${base}api/index.php?__route=/health
   → должен быть JSON (status/mysql), НЕ HTML-страница
2. http://ВАШ_ДОМЕН${base}assets/app.js → JavaScript, загрузка завершается
3. http://ВАШ_ДОМЕН${base} → интерфейс и данные
4. Обновление страницы ${base}points → интерфейс продолжает работать
5. Home в Network: .../api/index.php?__route=%2Fapi%2Fhome&... → JSON

Если п.1 = HTML: не залит api/ или PHP не исполняется на хостинге.
После настройки SSL повторите проверки через https://.
Если автоматический пересчёт включён, задайте в окружении работающего скрапера
ANALYTICS_API_BASE_URL=http://dashboard.redparty.ru/
(после настройки SSL можно использовать https://dashboard.redparty.ru/).
`;

fs.writeFileSync(path.join(target, 'README-UPLOAD.txt'), readme, 'utf8');

console.log('[hostland] готово.');
console.log(`[hostland] заливайте содержимое: ${target}`);
console.log(`[hostland] URL-путь: ${base}`);

