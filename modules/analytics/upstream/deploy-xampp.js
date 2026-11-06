/**
 * Сборка Vue + выкладка в XAMPP htdocs.
 * По умолчанию: C:\xampp\htdocs\dashboard
 *
 *   npm run v2:analytics-xampp
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const analyticsRoot = __dirname; // файл лежит в v2/analytics/
const appDir = path.join(analyticsRoot, 'app');
const distDir = path.join(appDir, 'dist');
const apiSrc = path.join(analyticsRoot, 'api');
const envSrc = path.join(analyticsRoot, '.env');
const htaccessSrc = path.join(analyticsRoot, 'public', '.htaccess');

const target = process.env.XAMPP_DIR || 'C:\\xampp\\htdocs\\dashboard';
const base = process.env.VITE_BASE || '/dashboard/';
const skipBuild = process.env.SKIP_BUILD === '1';

function rmrf(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (e) {
        // Windows иногда держит файлы — чистим по файлам
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
        if (entry.name === 'serve.js' || entry.name === 'router-dev.php') continue;
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(from, to);
        else fs.copyFileSync(from, to);
    }
}

function runBuild() {
    const viteJs = path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!fs.existsSync(viteJs)) {
        console.error('[xampp] нет vite. Сначала: cd v2/analytics/app && npm install');
        process.exit(1);
    }
    console.log(`[xampp] build base=${base}`);
    const vite = spawnSync(process.execPath, [viteJs, 'build'], {
        cwd: appDir,
        stdio: 'inherit',
        env: { ...process.env, VITE_BASE: base }
    });
    if (vite.status !== 0) {
        console.error('[xampp] сборка упала');
        process.exit(vite.status || 1);
    }
}

if (!skipBuild) runBuild();

if (!fs.existsSync(distDir)) {
    console.error('[xampp] нет dist/');
    process.exit(1);
}

console.log(`[xampp] deploy → ${target}`);
fs.mkdirSync(target, { recursive: true });

for (const name of ['index.html', 'assets', 'api', '.htaccess']) {
    rmrf(path.join(target, name));
}

for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    const from = path.join(distDir, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
}

copyDir(apiSrc, path.join(target, 'api'));
if (fs.existsSync(htaccessSrc)) {
    fs.copyFileSync(htaccessSrc, path.join(target, '.htaccess'));
}
if (fs.existsSync(envSrc)) {
    fs.copyFileSync(envSrc, path.join(target, '.env'));
} else {
    console.warn('[xampp] нет v2/analytics/.env — скопируйте вручную в', target);
}

console.log(`[xampp] готово: http://localhost/dashboard/`);
console.log('[xampp] Apache в XAMPP должен быть запущен');

