/**
 * Полная пересборка analytics_player_hour + scrape_hour + day status.
 * Зачищает таблицы и заполняет с dayFrom по сегодня (ES), по одному дню.
 *
 * Usage:
 *   node v2/analytics/scripts/rebuild-player-hour.cjs
 *   node v2/analytics/scripts/rebuild-player-hour.cjs --from=2026-04-01 --to=2026-09-14
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const LIMITS = ['16-25', '50', '100', '250'];
const SPAIN_TZ = 'Europe/Madrid';
const FIRST_BUG_DEFAULT_FROM = '2026-04-01';
const STATUS_PATH = path.join(__dirname, '../../../runtime/rebuild-player-hour.status.json');

function writeRebuildStatus(payload) {
  try {
    fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
    fs.writeFileSync(
      STATUS_PATH,
      JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );
  } catch (e) {
    console.warn('[rebuild] status write skip:', e.message);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientDbError(err) {
  const code = err && err.code;
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' ||
    code === 'ER_SERVER_SHUTDOWN'
  );
}

async function openConn() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    dateStrings: true,
    multipleStatements: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  });
  await conn.query("SET time_zone = '+00:00'");
  return conn;
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function spainDateOnly(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: SPAIN_TZ });
}

function spainHourNow(d = new Date()) {
  return Number(
    d.toLocaleString('en-GB', { timeZone: SPAIN_TZ, hour: 'numeric', hour12: false })
  );
}

function milanHourFromUtc(utcAt) {
  const raw = String(utcAt || '').trim().replace(' ', 'T');
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Number(
    d.toLocaleString('en-GB', { timeZone: SPAIN_TZ, hour: 'numeric', hour12: false })
  );
}

function milanDateFromUtc(utcAt) {
  const raw = String(utcAt || '').trim().replace(' ', 'T');
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: SPAIN_TZ });
}

/** Первое появление суток: points выше порога = хвост вчерашнего лидерборда */
const FIRST_SNAP_MAX_POINTS = Math.max(
  0,
  Math.min(500, Number(process.env.PLAYER_HOUR_FIRST_SNAP_MAX || 50) || 50)
);
/** Первые N минут суток ES не берём в агрегат (хвост вчерашнего скрапа). */
const SKIP_FIRST_MINUTES = Math.max(
  0,
  Math.min(30, Number(process.env.PLAYER_HOUR_SKIP_FIRST_MINUTES || 5) || 5)
);

function milanIsEarlyMinutes(utcAt, skipMinutes) {
  if (skipMinutes <= 0) return false;
  const raw = String(utcAt || '').trim().replace(' ', 'T');
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SPAIN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  if (get('hour') !== 0) return false;
  return get('minute') * 60 + get('second') < skipMinutes * 60;
}

function withinHourSpeed(isFirstHour, hourMin, hourMax, minAt, maxAt, day) {
  let diffPoints;
  let fromAt;
  let toAt;
  if (isFirstHour) {
    diffPoints = Math.max(0, hourMax);
    fromAt = milanHourBoundsUtc(day, 0)[0];
    toAt = maxAt || fromAt;
  } else {
    diffPoints = Math.max(0, hourMax - hourMin);
    fromAt = minAt || maxAt || milanHourBoundsUtc(day, 0)[0];
    toAt = maxAt || fromAt;
  }
  const diffSeconds = Math.max(0, Math.abs(utcDiffSeconds(fromAt, toAt)));
  const speed = diffSeconds > 0 ? Math.round((diffPoints / diffSeconds) * 3600 * 1e6) / 1e6 : null;
  return { diffPoints, diffSeconds, speed };
}

function milanHourBoundsUtc(day, hour) {
  // Interpret day+hour as Madrid local, return UTC wall strings
  const startLocal = `${day}T${String(hour).padStart(2, '0')}:00:00`;
  // Use Intl to get offset... simpler: format via temporal polyfill-free approach
  // Create date that when displayed in Madrid is day hour:00
  // Binary search UTC ms — reliable enough
  const probe = (utcMs) => {
    const d = new Date(utcMs);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: SPAIN_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}`;
  };
  const target = `${day} ${String(hour).padStart(2, '0')}`;
  // approx: day noon UTC
  let lo = Date.parse(`${day}T00:00:00Z`) - 12 * 3600000;
  let hi = Date.parse(`${day}T00:00:00Z`) + 36 * 3600000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (probe(mid) < target) lo = mid;
    else hi = mid;
  }
  const start = new Date(hi);
  const end = new Date(hi + 3600000);
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  return [fmt(start), fmt(end)];
}

function utcDiffSeconds(fromUtc, toUtc) {
  const a = new Date(String(fromUtc).replace(' ', 'T') + 'Z').getTime();
  const b = new Date(String(toUtc).replace(' ', 'T') + 'Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 1000));
}

function normUtc(at) {
  const s = String(at || '').trim();
  if (!s) return s;
  const d = new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s.replace(' ', 'T') : `${s.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return s.slice(0, 19).replace('T', ' ');
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function eachDay(from, to) {
  const out = [];
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function ensureSchema(conn) {
  // columns may already exist — ignore duplicate errors
  const alters = [
    'ADD COLUMN min_points_hour INT UNSIGNED NOT NULL DEFAULT 0',
    'ADD COLUMN max_points_hour INT UNSIGNED NOT NULL DEFAULT 0',
    'ADD COLUMN max_points_carry INT UNSIGNED NOT NULL DEFAULT 0',
    'ADD COLUMN diff_points INT UNSIGNED NOT NULL DEFAULT 0',
    'ADD COLUMN diff_seconds INT UNSIGNED NOT NULL DEFAULT 0',
    'ADD COLUMN speed DECIMAL(16,6) NULL',
    'ADD COLUMN min_at DATETIME NULL',
    'ADD COLUMN max_at DATETIME NULL',
    'ADD COLUMN delta_hour INT UNSIGNED NOT NULL DEFAULT 0'
  ];
  for (const a of alters) {
    try {
      await conn.query(`ALTER TABLE analytics_player_hour ${a}`);
    } catch (e) {
      if (!/Duplicate column/i.test(e.message)) {
        if (!/diff_points|max_points_carry|min_points_hour/i.test(a)) throw e;
      }
    }
  }
  const renames = [
    'CHANGE COLUMN volume diff_points INT UNSIGNED NOT NULL DEFAULT 0',
    'CHANGE COLUMN max_points max_points_carry INT UNSIGNED NOT NULL DEFAULT 0',
    'CHANGE COLUMN min_points min_points_hour INT UNSIGNED NOT NULL DEFAULT 0'
  ];
  for (const sql of renames) {
    try {
      await conn.query(`ALTER TABLE analytics_player_hour ${sql}`);
    } catch (_) {
      /* already renamed */
    }
  }
}

function buildPlayerHourRows(day, limit, snapRows, computedAt) {
  /** @type {Map<string, { displayName: string, byHour: Map<number, Array<{at:string,points:number,rank:number|null}>> }>} */
  const hourSnaps = new Map();
  for (const row of snapRows) {
    const displayName = String(row.player_name || '');
    if (!displayName) continue;
    const key = displayName.toLowerCase();
    const atNorm = normUtc(row.scraped_at);
    const snapDay = milanDateFromUtc(atNorm);
    if (!snapDay || snapDay !== day) continue;
    if (milanIsEarlyMinutes(atNorm, SKIP_FIRST_MINUTES)) continue;
    const hour = milanHourFromUtc(atNorm);
    if (hour < 0 || hour > 23) continue;
    const pts = Number(row.points) || 0;
    const rank = row.rank == null || row.rank === '' ? null : Number(row.rank);
    if (!hourSnaps.has(key)) {
      hourSnaps.set(key, { displayName, byHour: new Map() });
    }
    const entry = hourSnaps.get(key);
    if (!entry.byHour.has(hour)) entry.byHour.set(hour, []);
    entry.byHour.get(hour).push({ at: atNorm, points: pts, rank });
  }

  const out = [];
  for (const { displayName: name, byHour } of hourSnaps.values()) {
    let maxSoFar = null;
    let rankAtMax = null;
    let dayStarted = false;
    let prevHourMax = null;

    for (let h = 0; h < 24; h++) {
      const rawSnaps = byHour.get(h) || [];
      const snaps = [];
      for (const s of rawSnaps) {
        if (!dayStarted) {
          if (s.points > FIRST_SNAP_MAX_POINTS) continue;
          dayStarted = true;
        }
        snaps.push(s);
      }
      const hasSnap = snaps.length > 0;
      let hourMin = null;
      let hourMax = null;
      let minAt = null;
      let maxAt = null;

      if (hasSnap) {
        for (const s of snaps) {
          const pts = s.points;
          const at = s.at;
          const rank = s.rank;
          if (hourMin === null || pts < hourMin) {
            hourMin = pts;
            minAt = at;
          } else if (pts === hourMin && (minAt == null || at < minAt)) {
            minAt = at;
          }
          if (hourMax === null || pts > hourMax) {
            hourMax = pts;
            maxAt = at;
          } else if (pts === hourMax && (maxAt == null || at > maxAt)) {
            maxAt = at;
          }
          if (maxSoFar === null || pts > maxSoFar) {
            maxSoFar = pts;
            rankAtMax = rank;
          } else if (pts === maxSoFar && rank != null && (rankAtMax == null || rank < rankAtMax)) {
            rankAtMax = rank;
          }
        }
      }

      if (maxSoFar === null) continue;

      const isFirstHour = prevHourMax == null;

      if (!hasSnap) {
        hourMin = maxSoFar;
        hourMax = maxSoFar;
        [minAt, maxAt] = milanHourBoundsUtc(day, h);
      } else if (!isFirstHour && hourMin === hourMax) {
        [minAt, maxAt] = milanHourBoundsUtc(day, h);
      }

      const { diffPoints, diffSeconds, speed } = withinHourSpeed(
        isFirstHour,
        hourMin,
        hourMax,
        minAt,
        maxAt,
        day
      );
      const deltaHour = prevHourMax == null
        ? Math.max(0, hourMax)
        : Math.max(0, hourMax - prevHourMax);
      prevHourMax = hourMax;

      out.push([
        name,
        day,
        h,
        limit,
        maxSoFar,
        hourMin,
        hourMax,
        diffPoints,
        diffSeconds,
        deltaHour,
        speed,
        rankAtMax,
        hasSnap ? 1 : 0,
        minAt,
        maxAt,
        computedAt
      ]);
    }
  }
  return out;
}

async function rebuildScrapeHour(conn, day, today) {
  // Не CONVERT_TZ('Europe/Madrid'): на Hostland нет tz tables → NULL → всё в час 0.
  const [snapAts] = await conn.query(
    `SELECT scraped_at
     FROM tournament_snapshots
     WHERE scraped_date_milan = ?
       AND tournament_limit IN (?,?,?,?)`,
    [day, ...LIMITS]
  );
  const counts = Array(24).fill(0);
  for (const r of snapAts) {
    const h = milanHourFromUtc(r.scraped_at);
    if (h >= 0 && h <= 23) counts[h] += 1;
  }
  const lastEvaluated = day < today ? 23 : day === today ? spainHourNow() : -1;
  const computedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let ok = 0;
  let down = 0;
  let pending = 0;
  for (let h = 0; h < 24; h++) {
    const n = counts[h];
    const has = n > 0 ? 1 : 0;
    let status;
    if (h > lastEvaluated) {
      status = 'pending';
      pending++;
    } else if (has) {
      status = 'ok';
      ok++;
    } else {
      status = 'down';
      down++;
    }
    await conn.execute(
      `INSERT INTO analytics_scrape_hour
        (day, hour, snapshot_count, has_data, status, computed_at)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         snapshot_count=VALUES(snapshot_count),
         has_data=VALUES(has_data),
         status=VALUES(status),
         computed_at=VALUES(computed_at)`,
      [day, h, n, has, status, computedAt]
    );
  }
  return { ok, down, pending };
}

async function upsertDayStatus(conn, day, status, sourceN, rowCount, limitsN, note) {
  if (status === 'empty') {
    await conn.execute('DELETE FROM analytics_player_hour_day WHERE day = ?', [day]);
    return;
  }
  const computedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await conn.execute(
    `INSERT INTO analytics_player_hour_day
      (day, status, source_snapshots, row_count, limits_n, note, computed_at)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       status=VALUES(status),
       source_snapshots=VALUES(source_snapshots),
       row_count=VALUES(row_count),
       limits_n=VALUES(limits_n),
       note=VALUES(note),
       computed_at=VALUES(computed_at)`,
    [day, status, sourceN, rowCount, limitsN, note, computedAt]
  );
}

async function processDay(conn, day, today) {
  const [[src]] = await conn.query(
    `SELECT COUNT(*) AS n FROM tournament_snapshots
     WHERE scraped_date_milan = ? AND tournament_limit IN (?,?,?,?)`,
    [day, ...LIMITS]
  );
  const sourceN = Number(src.n) || 0;
  await conn.execute('DELETE FROM analytics_player_hour WHERE day = ?', [day]);

  if (sourceN <= 0) {
    await upsertDayStatus(conn, day, 'no_data', 0, 0, 0, 'Нет строк в tournament_snapshots');
    const scrape = await rebuildScrapeHour(conn, day, today);
    return { status: 'no_data', rows: 0, scrape };
  }

  const computedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let rows = 0;
  let limitsN = 0;
  for (const limit of LIMITS) {
    const [snapRows] = await conn.query(
      `SELECT player_name, scraped_at, points, \`rank\`
       FROM tournament_snapshots
       WHERE scraped_date_milan = ? AND tournament_limit = ?
       ORDER BY scraped_at ASC`,
      [day, limit]
    );
    if (snapRows.length) limitsN++;
    const built = buildPlayerHourRows(day, limit, snapRows, computedAt);
    if (!built.length) continue;
    const chunkSize = 100;
    for (let i = 0; i < built.length; i += chunkSize) {
      const chunk = built.slice(i, i + chunkSize);
      const ph = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
      const params = chunk.flat();
      await conn.query(
        `INSERT INTO analytics_player_hour
          (player_name, day, hour, tournament_limit, max_points_carry, min_points_hour, max_points_hour,
           diff_points, diff_seconds, delta_hour, speed, rank_at_max, has_snapshot, min_at, max_at, computed_at)
         VALUES ${ph}`,
        params
      );
      rows += chunk.length;
    }
  }

  let status = 'ok';
  let note = null;
  if (day === today) {
    status = 'today';
    note = 'Текущие сутки ES — ещё наполняется';
  }
  await upsertDayStatus(conn, day, status, sourceN, rows, limitsN, note);
  const scrape = await rebuildScrapeHour(conn, day, today);
  return { status, rows, scrape, sourceN, limitsN };
}

async function main() {
  const today = spainDateOnly();
  const dayFrom = arg('from', FIRST_BUG_DEFAULT_FROM);
  const dayTo = arg('to', today);
  const skipTruncate = process.argv.includes('--no-truncate');
  const scrapeOnly = process.argv.includes('--scrape-only');

  let conn = await openConn();
  await ensureSchema(conn);

  console.log(`[rebuild] range ${dayFrom}…${dayTo} (today ES=${today})${scrapeOnly ? ' [scrape-only]' : ''}`);
  writeRebuildStatus({
    state: 'running',
    mode: scrapeOnly ? 'scrape-only' : 'full',
    dayFrom,
    dayTo,
    today,
    done: 0,
    total: 0,
    currentDay: null,
    totalRows: 0,
    elapsedSec: 0,
    lastLine: `[rebuild] range ${dayFrom}…${dayTo}`,
    pid: process.pid
  });

  if (!skipTruncate && !scrapeOnly) {
    console.log('[rebuild] TRUNCATE player_hour, player_hour_day, scrape_hour, hour_slice…');
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    await conn.query('TRUNCATE TABLE analytics_player_hour');
    await conn.query('TRUNCATE TABLE analytics_player_hour_day');
    await conn.query('TRUNCATE TABLE analytics_scrape_hour');
    try {
      await conn.query('TRUNCATE TABLE analytics_hour_slice');
    } catch (e) {
      console.log('[rebuild] hour_slice skip:', e.message);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  }

  const days = eachDay(dayFrom, dayTo);
  let done = 0;
  let totalRows = 0;
  const t0 = Date.now();
  writeRebuildStatus({
    state: 'running',
    mode: scrapeOnly ? 'scrape-only' : 'full',
    dayFrom,
    dayTo,
    today,
    done: 0,
    total: days.length,
    currentDay: days[0] || null,
    totalRows: 0,
    elapsedSec: 0,
    lastLine: `start ${days.length} days`,
    pid: process.pid
  });

  for (const day of days) {
    writeRebuildStatus({
      state: 'running',
      mode: scrapeOnly ? 'scrape-only' : 'full',
      dayFrom,
      dayTo,
      today,
      done,
      total: days.length,
      currentDay: day,
      totalRows,
      elapsedSec: Math.round((Date.now() - t0) / 1000),
      lastLine: `processing ${day}…`,
      pid: process.pid
    });

    const maxAttempts = 4;
    let attempt = 0;
    let lastErr = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt++;
      try {
        if (scrapeOnly) {
          const scrape = await rebuildScrapeHour(conn, day, today);
          done++;
          const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
          const lastLine =
            `[${done}/${days.length}] ${day} scrape ok=${scrape.ok} down=${scrape.down} pending=${scrape.pending} (${elapsed}s)`;
          console.log(lastLine);
          writeRebuildStatus({
            state: 'running',
            mode: 'scrape-only',
            dayFrom,
            dayTo,
            today,
            done,
            total: days.length,
            currentDay: day,
            totalRows,
            elapsedSec: Number(elapsed),
            lastLine,
            lastStatus: 'ok',
            scrapeDown: scrape.down,
            pid: process.pid
          });
        } else {
          const r = await processDay(conn, day, today);
          done++;
          totalRows += r.rows || 0;
          const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
          const lastLine =
            `[${done}/${days.length}] ${day} status=${r.status} rows=${r.rows || 0} ` +
            `scrape down=${r.scrape?.down ?? '?'} (${elapsed}s, totalRows=${totalRows})`;
          console.log(lastLine);
          writeRebuildStatus({
            state: 'running',
            mode: 'full',
            dayFrom,
            dayTo,
            today,
            done,
            total: days.length,
            currentDay: day,
            totalRows,
            elapsedSec: Number(elapsed),
            lastLine,
            lastStatus: r.status,
            lastRows: r.rows || 0,
            scrapeDown: r.scrape?.down ?? null,
            pid: process.pid
          });
        }
        break;
      } catch (e) {
        lastErr = e;
        if (!isTransientDbError(e) || attempt >= maxAttempts) throw e;
        const waitMs = attempt * 5000;
        console.warn(
          `[rebuild] transient ${e.code || e.message} on ${day}, retry ${attempt}/${maxAttempts - 1} in ${waitMs / 1000}s…`
        );
        try {
          await conn.end();
        } catch {
          /* ignore */
        }
        await sleep(waitMs);
        conn = await openConn();
      }
    }
    if (lastErr && attempt > 1) {
      console.log(`[rebuild] recovered ${day} after ${attempt} attempts`);
    }
  }

  const [[ph]] = await conn.query('SELECT COUNT(*) n FROM analytics_player_hour');
  const [[sc]] = await conn.query('SELECT COUNT(*) n FROM analytics_scrape_hour');
  const [[dd]] = await conn.query('SELECT COUNT(*) n FROM analytics_player_hour_day');
  console.log('[rebuild] DONE', { player_hour: ph.n, scrape_hour: sc.n, day_status: dd.n, totalRows });
  writeRebuildStatus({
    state: 'done',
    mode: scrapeOnly ? 'scrape-only' : 'full',
    dayFrom,
    dayTo,
    today,
    done: days.length,
    total: days.length,
    currentDay: dayTo,
    totalRows,
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    lastLine: '[rebuild] DONE',
    counts: { player_hour: ph.n, scrape_hour: sc.n, day_status: dd.n },
    pid: process.pid
  });
  await conn.end();
}

main().catch((e) => {
  console.error('[rebuild] FAIL', e);
  writeRebuildStatus({
    state: 'fail',
    lastLine: String(e && e.message ? e.message : e),
    error: String(e && e.stack ? e.stack : e),
    pid: process.pid
  });
  process.exit(1);
});
