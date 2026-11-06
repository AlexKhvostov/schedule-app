/**
 * Локальная панель прогресса rebuild + статус скрапера.
 * Usage: node v2/analytics/scripts/rebuild-status-panel.cjs
 * Открыть: http://127.0.0.1:3088/
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.REBUILD_STATUS_PORT || 3088);
const ROOT = path.join(__dirname, '../../..');
const STATUS_PATH = path.join(ROOT, 'runtime/rebuild-player-hour.status.json');
const TERMINALS_DIR =
  process.env.CURSOR_TERMINALS_DIR ||
  path.join(
    process.env.USERPROFILE || '',
    '.cursor/projects/d-P-R-O-J-E-C-T-RedParty-winamaxScraper/terminals'
  );
const SCRAPER_HEALTH = process.env.V2_SCRAPER_HEALTH || 'http://127.0.0.1:3002/health';

function parseProgressFromText(text) {
  const range = text.match(/\[rebuild\] range (\d{4}-\d{2}-\d{2}).{1,3}(\d{4}-\d{2}-\d{2})/);
  const lines = [...text.matchAll(/\[(\d+)\/(\d+)\]\s+(\d{4}-\d{2}-\d{2})\s+(.+)/g)];
  const last = lines.length ? lines[lines.length - 1] : null;
  const fail = /\[rebuild\] FAIL/.test(text);
  const doneAll = /\[rebuild\] DONE/.test(text);
  if (!range && !last) return null;

  const done = last ? Number(last[1]) : 0;
  const total = last ? Number(last[2]) : 0;
  const day = last ? last[3] : range ? range[1] : null;
  const rest = last ? last[4] : '';
  const rowsM = rest.match(/totalRows=(\d+)/);
  const elapsedM = rest.match(/\((\d+)s/);
  const statusM = rest.match(/status=(\w+)/);

  return {
    state: fail ? 'fail' : doneAll ? 'done' : 'running',
    mode: /\[scrape-only\]/.test(text) ? 'scrape-only' : 'full',
    dayFrom: range ? range[1] : null,
    dayTo: range ? range[2] : null,
    done,
    total,
    currentDay: day,
    totalRows: rowsM ? Number(rowsM[1]) : 0,
    elapsedSec: elapsedM ? Number(elapsedM[1]) : 0,
    lastStatus: statusM ? statusM[1] : null,
    lastLine: last ? last[0] : range ? range[0] : null,
    source: 'terminal'
  };
}

function findRebuildTerminal() {
  if (!fs.existsSync(TERMINALS_DIR)) return null;
  const files = fs
    .readdirSync(TERMINALS_DIR)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => {
      const p = path.join(TERMINALS_DIR, f);
      const st = fs.statSync(p);
      return { p, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const f of files) {
    let raw = '';
    try {
      raw = fs.readFileSync(f.p, 'utf8');
    } catch {
      continue;
    }
    if (!raw.includes('rebuild-player-hour.cjs')) continue;
    const metaRunning = /^status:\s*running/m.test(raw);
    const progress = parseProgressFromText(raw);
    if (!progress) continue;
    const footerExit = raw.match(/exit_code:\s*(\d+)/);
    if (footerExit && !metaRunning) {
      progress.state = Number(footerExit[1]) === 0 ? 'done' : 'fail';
    } else if (metaRunning) {
      progress.state = progress.state === 'done' ? 'running' : progress.state;
    }
    progress.terminalFile = path.basename(f.p);
    progress.updatedAt = new Date(f.mtime).toISOString();
    return progress;
  }
  return null;
}

function readStatusFile() {
  try {
    if (!fs.existsSync(STATUS_PATH)) return null;
    const j = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
    return { ...j, source: 'status-file' };
  } catch {
    return null;
  }
}

async function fetchScraper() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(SCRAPER_HEALTH, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const j = await res.json();
    return { ok: true, ...j };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function pickRebuild() {
  const fromFile = readStatusFile();
  const fromTerm = findRebuildTerminal();
  if (fromFile && fromTerm) {
    // Активный терминал важнее устаревшего status.json (текущий прогон без записи файла)
    if (fromTerm.state === 'running') return fromTerm;
    if (fromFile.state === 'running' && fromFile.updatedAt) {
      const age = Date.now() - Date.parse(fromFile.updatedAt);
      if (age < 120000) return fromFile;
    }
    return fromTerm.done >= (fromFile.done || 0) ? fromTerm : fromFile;
  }
  return fromFile || fromTerm || { state: 'idle', done: 0, total: 0, lastLine: 'Нет активного rebuild' };
}

function etaSec(r) {
  if (!r || r.state !== 'running' || !r.done || !r.total || !r.elapsedSec) return null;
  if (r.done <= 0) return null;
  const per = r.elapsedSec / r.done;
  return Math.round(per * (r.total - r.done));
}

function fmtDur(sec) {
  if (sec == null || Number.isNaN(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${r}с`;
  return `${r}с`;
}

const HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Rebuild status</title>
<style>
  :root {
    --bg: #12151a;
    --card: #1a1f27;
    --text: #e8ecf1;
    --muted: #8b95a5;
    --ok: #3ecf8e;
    --warn: #f0b429;
    --bad: #f07178;
    --accent: #5b9fd4;
    --track: #2a3140;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    font-family: "Segoe UI", system-ui, sans-serif;
    background: radial-gradient(1200px 600px at 10% -10%, #1e2a38 0%, var(--bg) 55%);
    color: var(--text);
    display: grid; place-items: center; padding: 24px;
  }
  .card {
    width: min(440px, 100%);
    background: var(--card);
    border: 1px solid #2c3544;
    border-radius: 14px;
    padding: 22px 22px 18px;
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
  }
  h1 { margin: 0 0 4px; font-size: 1.15rem; font-weight: 650; letter-spacing: .02em; }
  .sub { color: var(--muted); font-size: .85rem; margin-bottom: 18px; }
  .row { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0; font-size: .92rem; }
  .row span:last-child { font-variant-numeric: tabular-nums; text-align: right; }
  .label { color: var(--muted); }
  .bar {
    height: 10px; background: var(--track); border-radius: 999px; overflow: hidden; margin: 14px 0 8px;
  }
  .fill {
    height: 100%; width: 0%; background: linear-gradient(90deg, #3a7ca5, var(--accent));
    transition: width .4s ease;
  }
  .pct { font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 6px;
    font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
  }
  .badge.run { background: #243447; color: var(--accent); }
  .badge.ok { background: #1e3a2f; color: var(--ok); }
  .badge.fail { background: #3a2226; color: var(--bad); }
  .badge.idle { background: #2a2e36; color: var(--muted); }
  .line {
    margin-top: 14px; padding: 10px 12px; background: #12161d; border-radius: 8px;
    font-family: ui-monospace, Consolas, monospace; font-size: .72rem;
    color: #a8b3c4; word-break: break-all; line-height: 1.4;
  }
  .scraper { margin-top: 16px; padding-top: 14px; border-top: 1px solid #2c3544; }
  .scraper h2 { margin: 0 0 8px; font-size: .8rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; vertical-align: middle; }
  .dot.on { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
  .dot.off { background: var(--bad); }
  .dot.busy { background: var(--warn); box-shadow: 0 0 8px var(--warn); }
  footer { margin-top: 12px; color: var(--muted); font-size: .72rem; text-align: right; }
</style>
</head>
<body>
  <div class="card">
    <h1>Пересборка агрегатов</h1>
    <div class="sub">analytics_player_hour · локальный статус</div>
    <div class="row">
      <span class="label">Состояние</span>
      <span id="stateBadge"><span class="badge idle">idle</span></span>
    </div>
    <div class="pct" id="pct">—</div>
    <div class="bar"><div class="fill" id="fill"></div></div>
    <div class="row"><span class="label">День</span><span id="day">—</span></div>
    <div class="row"><span class="label">Диапазон</span><span id="range">—</span></div>
    <div class="row"><span class="label">Строк записано</span><span id="rows">—</span></div>
    <div class="row"><span class="label">Прошло</span><span id="elapsed">—</span></div>
    <div class="row"><span class="label">Осталось ~</span><span id="eta">—</span></div>
    <div class="line" id="line">ожидание данных…</div>
    <div class="scraper">
      <h2>Сбор данных (scraper)</h2>
      <div class="row"><span class="label">Health</span><span id="scHealth">—</span></div>
      <div class="row"><span class="label">Сейчас скрапит</span><span id="scBusy">—</span></div>
    </div>
    <footer id="updated">обновление…</footer>
  </div>
<script>
function fmt(n){ return (n??0).toLocaleString('ru-RU'); }
function fmtDur(sec){
  if(sec==null||Number.isNaN(sec)) return '—';
  sec=Math.max(0,Math.round(sec));
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  if(h) return h+'ч '+m+'м';
  if(m) return m+'м '+s+'с';
  return s+'с';
}
function badge(state){
  const map={running:['run','running'],done:['ok','done'],fail:['fail','fail'],idle:['idle','idle']};
  const [c,t]=map[state]||map.idle;
  return '<span class="badge '+c+'">'+t+'</span>';
}
async function tick(){
  try{
    const r=await fetch('/api/status').then(x=>x.json());
    const b=r.rebuild||{};
    const done=b.done||0, total=b.total||0;
    const pct=total? Math.min(100, Math.round(done*1000/total)/10) : 0;
    document.getElementById('stateBadge').innerHTML=badge(b.state||'idle');
    document.getElementById('pct').textContent=total? (pct+'%  ·  '+done+' / '+total) : '—';
    document.getElementById('fill').style.width=pct+'%';
    document.getElementById('day').textContent=b.currentDay||'—';
    document.getElementById('range').textContent=(b.dayFrom&&b.dayTo)? (b.dayFrom+' → '+b.dayTo) : '—';
    document.getElementById('rows').textContent=fmt(b.totalRows);
    document.getElementById('elapsed').textContent=fmtDur(b.elapsedSec);
    document.getElementById('eta').textContent=fmtDur(b.etaSec);
    document.getElementById('line').textContent=b.lastLine||'—';
    const s=r.scraper||{};
    const ok=!!s.ok;
    const busy=!!s.scraping;
    document.getElementById('scHealth').innerHTML=
      '<span class="dot '+(ok?'on':'off')+'"></span>'+(ok?'ok':'нет связи');
    document.getElementById('scBusy').innerHTML=
      '<span class="dot '+(busy?'busy':(ok?'on':'off'))+'"></span>'+(busy?'да':'нет');
    document.getElementById('updated').textContent=
      'обновлено '+new Date().toLocaleTimeString('ru-RU')+(b.source?(' · '+b.source):'');
  }catch(e){
    document.getElementById('line').textContent='Ошибка панели: '+e.message;
  }
}
tick();
setInterval(tick, 2000);
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }
  if (url === '/api/status') {
    const rebuild = pickRebuild();
    rebuild.etaSec = etaSec(rebuild);
    rebuild.pct = rebuild.total ? Math.round((rebuild.done / rebuild.total) * 1000) / 10 : 0;
    const scraper = await fetchScraper();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ rebuild, scraper, serverTime: new Date().toISOString() }));
    return;
  }
  res.writeHead(404).end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[rebuild-status] http://127.0.0.1:${PORT}/`);
  console.log(`[rebuild-status] status file: ${STATUS_PATH}`);
  console.log(`[rebuild-status] terminals: ${TERMINALS_DIR}`);
});
