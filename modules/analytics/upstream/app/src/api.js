/** Префикс при выкладке в подпапку (XAMPP/Hostland), напр. /dashboard/ */
const ENV_BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

const ADMIN_SESSION_KEY = 'v2.analytics.adminSession';
let adminSessionToken = '';

export function setAdminSession(token) {
    adminSessionToken = token || '';
    if (token) sessionStorage.setItem(ADMIN_SESSION_KEY, token);
    else sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

export function getAdminSession() {
    if (adminSessionToken) return adminSessionToken;
    return sessionStorage.getItem(ADMIN_SESSION_KEY) || '';
}

export function clearAdminSession() {
    adminSessionToken = '';
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

/** Корень приложения: откуда реально загрузился assets/app.js (надёжнее VITE_BASE). */
function appRoot() {
    if (typeof document !== 'undefined') {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].getAttribute('src') || '';
            const m = src.match(/^(.*\/)assets\/[^/?#]+/);
            if (m) return m[1];
        }
    }
    return ENV_BASE;
}

/**
 * Hostland часто ломает PATH_INFO (/api/index.php/home → HTML).
 * Роут передаём query: api/index.php?__route=/api/home&dateTo=...
 * Home/Points читают tournament_snapshots — сборные таблицы не нужны.
 */
function toFrontController(path) {
    const [pathname, query = ''] = String(path).split('?');
    let route = pathname.replace(/^\//, '');

    if (route === 'health') {
        route = '/health';
    } else if (route.startsWith('api/index.php/')) {
        route = '/api/' + route.slice('api/index.php/'.length);
    } else if (route === 'api/index.php' || route === 'api/index.php/') {
        route = '/health';
    } else if (route.startsWith('api/')) {
        route = '/' + route;
    } else if (!route.startsWith('/')) {
        route = '/' + route;
    }

    const params = new URLSearchParams(query);
    params.set('__route', route);
    return `api/index.php?${params.toString()}`;
}

function resolveUrl(path) {
    const front = toFrontController(path);
    const root = appRoot();
    if (root.startsWith('http://') || root.startsWith('https://')) {
        return new URL(front, root).toString();
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const base = root.startsWith('/') ? `${origin}${root}` : `${origin}/${root}`;
    return new URL(front, base.endsWith('/') ? base : `${base}/`).toString();
}

async function request(path, options = {}) {
    const url = resolveUrl(path);
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const raw = await response.text();
    let data = {};
    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch {
            const looksHtml = /^\s*</.test(raw) || /<!DOCTYPE/i.test(raw);
            const looksFatal = /Fatal error|Allowed memory size|memory exhausted/i.test(raw);
            throw new Error(
                looksFatal
                    ? `API упал по памяти (Fatal error) на сервере. Залейте свежий api/routes/reports.php из hostland-upload.`
                    : looksHtml
                        ? `API вернул HTML вместо JSON (${response.status}). Проверка: ${appRoot()}api/index.php?__route=/health`
                        : `Некорректный JSON от API (${response.status})`
            );
        }
    }
    if (!response.ok) {
        const err = new Error(data.error || `HTTP ${response.status}`);
        err.status = response.status;
        err.data = data;
        throw err;
    }
    return data;
}

function adminHeaders() {
    const token = getAdminSession();
    return token ? { 'X-Admin-Session': token } : {};
}

export const api = {
    health: () => request('health'),
    regs: {
        list: () => request('api/regs'),
        upsert: (body) => request('api/regs', { method: 'POST', body: JSON.stringify(body) }),
        bulk: (body) => request('api/regs/bulk', { method: 'POST', body: JSON.stringify(body) }),
        remove: (name) => request(`api/regs/${encodeURIComponent(name)}`, { method: 'DELETE' })
    },
    home: (qs) => request(`api/home?${qs}`),
    points: (qs) => request(`api/points?${qs}`),
    pointsHeatmap: (qs) => request(`api/points/heatmap?${qs}`),
    yearly: (qs) => request(`api/yearly?${qs}`),
    speed: (qs) => request(`api/speed?${qs}`),
    heatmap: (qs) => request(`api/heatmap?${qs}`),
    heatmapCell: (qs) => request(`api/heatmap/cell?${qs}`),
    players: (qs) => request(`api/players?${qs}`),
    search: (q) => request(`api/players/search?q=${encodeURIComponent(q)}`),
    player: (name, qs) => request(`api/players/${encodeURIComponent(name)}?${qs}`),
    playerHistory: (name, qs) => request(`api/players/${encodeURIComponent(name)}/history?${qs}`),
    getPlayerNote: (name) => request(`api/players/${encodeURIComponent(name)}/note`),
    playerNote: (name, note) => request(`api/players/${encodeURIComponent(name)}/note`, {
        method: 'PUT',
        body: JSON.stringify({ note })
    }),
    admin: {
        session: () => request('api/admin/session', { headers: adminHeaders() }),
        login: async (password) => {
            try {
                return await request('api/admin/login', {
                    method: 'POST',
                    body: JSON.stringify({ password })
                });
            } catch (e) {
                if (e.data) return { ok: false, ...e.data, error: e.data.error || e.message };
                throw e;
            }
        },
        logout: () => request('api/admin/logout', { method: 'POST', headers: adminHeaders() }),
        tables: () => request('api/admin/tables', { headers: adminHeaders() }),
        table: (id) => request(`api/admin/tables/${encodeURIComponent(id)}`, { headers: adminHeaders() }),
        tableRows: (id, limit = 100) => {
            const q = new URLSearchParams();
            q.set('limit', String(limit));
            return request(`api/admin/tables/${encodeURIComponent(id)}/rows?${q}`, { headers: adminHeaders() });
        },
        run: (id, body) => request(`api/admin/tables/${encodeURIComponent(id)}/run`, {
            method: 'POST',
            headers: adminHeaders(),
            body: JSON.stringify(body || {})
        }),
        playerHourCoverage: (dayFrom, dayTo) => {
            const q = new URLSearchParams();
            if (dayFrom) q.set('dayFrom', dayFrom);
            if (dayTo) q.set('dayTo', dayTo);
            return request(`api/admin/player-hour/coverage?${q}`, { headers: adminHeaders() });
        },
        playerHourRunDay: (day) => request('api/admin/player-hour/run-day', {
            method: 'POST',
            headers: adminHeaders(),
            body: JSON.stringify({ day })
        }),
        playerHourScheduleGet: () => request('api/admin/player-hour/schedule', {
            headers: adminHeaders()
        }),
        playerHourScheduleSave: (body) => request('api/admin/player-hour/schedule', {
            method: 'POST',
            headers: adminHeaders(),
            body: JSON.stringify(body || {})
        }),
        scrapeHourCoverage: (dayFrom, dayTo) => {
            const q = new URLSearchParams();
            if (dayFrom) q.set('dayFrom', dayFrom);
            if (dayTo) q.set('dayTo', dayTo);
            return request(`api/admin/scrape-hour/coverage?${q}`, { headers: adminHeaders() });
        }
    }
};

export function toQuery(filters) {
    const params = new URLSearchParams();
    if (filters.day) params.set('day', filters.day);
    if (filters.month) params.set('month', filters.month);
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.limits?.length) params.set('limits', filters.limits.join(','));
    if (filters.players?.length) params.set('players', filters.players.join(','));
    if (filters.segment && filters.segment !== 'all') params.set('segment', filters.segment);
    if (filters.topN) params.set('topN', String(filters.topN));
    if (filters.topThreshold) params.set('topThreshold', String(filters.topThreshold));
    return params.toString();
}
