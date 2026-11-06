/**
 * Local PHP API launcher (finds php / XAMPP on Windows).
 * Usage: node v2/analytics/api/serve.js
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = path.join(__dirname, 'router-dev.php');
const host = '127.0.0.1';
const port = process.env.ANALYTICS_PORT || '3010';
const managedPhp = path.resolve(__dirname, '../../../runtime/php-security/php-8.2.35/php.exe');
const managedIni = path.resolve(__dirname, '../php-local.ini');

const fileCandidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'PHP', 'php.exe'),
    'C:\\xampp\\php\\php.exe',
    'C:\\laragon\\bin\\php\\php.exe',
    'C:\\php\\php.exe'
].filter(Boolean);

function phpOnPath() {
    const probe = spawnSync('php', ['-v'], { encoding: 'utf8', windowsHide: true });
    return probe.status === 0 ? 'php' : null;
}

function resolvePhp() {
    // An explicit choice must not silently fall back to a different interpreter.
    if (process.env.PHP_BIN) return process.env.PHP_BIN;
    if (fs.existsSync(managedPhp)) return managedPhp;
    const fromPath = phpOnPath();
    if (fromPath) return fromPath;
    for (const bin of fileCandidates) {
        if (bin && fs.existsSync(bin)) return bin;
    }
    return null;
}

const php = resolvePhp();
if (!php) {
    console.error('PHP не найден. Нужен исправленный PHP: см. docs/PHP_SECURITY.md. PHP_BIN задаёт явный путь.');
    process.exit(1);
}

// Set before request parsing; ini_set() and FPM .user.ini are too late.
const startupArgs = ['-d', 'session.upload_progress.enabled=0'];
const childEnv = { ...process.env };
if (path.resolve(php) === managedPhp) {
    startupArgs.unshift('-c', managedIni, '-d', `extension_dir=${path.join(path.dirname(managedPhp), 'ext')}`);
    childEnv.PHP_INI_SCAN_DIR = '';
}
const probe = spawnSync(php, [...startupArgs, '-r',
    'echo json_encode(["version"=>PHP_VERSION,"id"=>PHP_VERSION_ID,"upload_progress"=>ini_get("session.upload_progress.enabled")]);'
], { encoding: 'utf8', windowsHide: true, env: childEnv });
let runtime;
try {
    if (probe.status !== 0 || probe.stderr?.trim()) throw new Error('PHP startup failed');
    runtime = JSON.parse(probe.stdout);
} catch {
    console.error('[analytics] PHP не запустился без ошибок. Проверьте PHP_BIN, расширения и php.ini.');
    process.exit(1);
}
// Upstream Windows releases only. Vendor backports need separate verification.
const patched = { 802: 80235, 803: 80336, 804: 80427, 805: 80512 };
const minimum = patched[Math.floor(runtime.id / 100)];
if (!minimum || runtime.id < minimum || /(?:dev|alpha|beta|RC)/i.test(runtime.version)) {
    console.error(`[analytics] PHP ${runtime.version} не прошёл проверку PHP2Shell. Нужны 8.2.35+, 8.3.36+, 8.4.27+ или 8.5.12+ в своей ветке; см. docs/PHP_SECURITY.md.`);
    process.exit(1);
}
if (!['', '0'].includes(runtime.upload_progress)) {
    console.error('[analytics] Не удалось отключить session.upload_progress.enabled при запуске.');
    process.exit(1);
}

console.log(`[analytics] PHP ${runtime.version}; session.upload_progress.enabled=0; http://${host}:${port}`);
const child = spawn(php, [...startupArgs, '-S', `${host}:${port}`, router], {
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    cwd: path.resolve(__dirname, '..'),
    env: childEnv
});

child.on('error', () => {
    console.error('[analytics] Не удалось запустить PHP API.');
    process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 1));
