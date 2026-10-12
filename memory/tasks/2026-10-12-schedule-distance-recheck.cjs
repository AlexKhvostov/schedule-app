// Review harness: execute the actual TS/TSX modules with controlled hooks/network.
// No production writes, browser profiles, credentials or repo runtime changes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const web = path.join(root, 'apps/web');
const ts = require(path.join(web, 'node_modules/typescript'));
function loader(mocks = {}) {
  const cache = new Map();
  return function load(file) {
    const full = path.resolve(web, file);
    if (cache.has(full)) return cache.get(full);
    const exports = {};
    cache.set(full, exports);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const req = (id) => {
      if (id in mocks) return mocks[id];
      if (!id.startsWith('.')) throw new Error('Unmocked dependency: ' + id);
      const base = path.resolve(path.dirname(full), id);
      const next = ['', '.ts', '.tsx'].map((ext) => base + ext).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!next) throw new Error('Module missing: ' + id);
      return load(next);
    };
    vm.runInNewContext(code, { exports, require: req, process, console, setTimeout, clearTimeout, Date, Promise }, { filename: full });
    return exports;
  };
}
const tick = () => new Promise((done) => setImmediate(done));
const result = [];
function check(name, details) { result.push({ name, ...details }); }
function hooks() {
  const state = [], effects = [], refs = [], callbacks = [], memos = [];
  let si = 0, ei = 0, ri = 0, ci = 0, mi = 0;
  const queued = [];
  const changed = (previous, deps) => !previous || deps.some((dep, n) => dep !== previous.deps[n]);
  return { state, reset: () => { si = ei = ri = ci = mi = 0; }, flush: () => queued.splice(0).forEach((effect) => effect()),
    api: {
      useState(initial) { const i = si++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
        return [state[i], (next) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
      useRef(value) { const i = ri++; return refs[i] ??= { current: value }; },
      useMemo(fn, deps) { const i = mi++; if (changed(memos[i], deps)) memos[i] = { deps, value: fn() }; return memos[i].value; },
      useCallback(fn, deps) { const i = ci++; if (changed(callbacks[i], deps)) callbacks[i] = { deps, value: fn }; return callbacks[i].value; },
      useEffect(fn, deps) { const i = ei++; const previous = effects[i];
        if (!previous || deps.some((dep, n) => dep !== previous.deps[n])) {
          previous?.cleanup?.(); const item = effects[i] = { deps };
          queued.push(() => { item.cleanup = fn(); });
        }
      },
    },
  };
}
const node = (type, props) => ({ type, props: props ?? {} });
function find(tree, predicate, rows = []) {
  if (Array.isArray(tree)) tree.forEach((item) => find(item, predicate, rows));
  else if (tree && typeof tree === 'object') {
    if (predicate(tree)) rows.push(tree);
    find(tree.props?.children, predicate, rows);
  }
  return rows;
}
const person = (key, variant = 'nitro') => ({
  key, memberId: key, nick: key, discordNick: key, gameNick: key, playerId: '101', discordId: '111111111111111111',
  avatarUrl: null, onGuild: true, redParty: true, hasActiveProfile: true, orphan: false,
  slices: variant ? [{ id: key, variant, part: 1, byLimit: { 50: { hands: 10 } }, total: 10 }] : [],
  at: { nitro: variant === 'nitro' ? { 50: 10 } : {}, regular: variant === 'regular' ? { 50: 10 } : {} },
  nitroTotal: variant === 'nitro' ? 10 : 0, regularTotal: variant === 'regular' ? 10 : 0, total: variant ? 10 : 0,
  updatedAt: null,
});
async function run() {
  const api = loader({ './client': { getSupabase: () => null }, './config': { isLiveData: () => false },
    './distanceDump': { formatHands: (value) => String(value) } })('src/data/distanceBook.ts');
  const runtime = hooks(); const pending = [];
  const fakeData = { ...api, loadDistanceMonths: async () => ['2026-10-01'], loadDistanceRooms: async () => [{ slug: 'winamax', title: 'Winamax' }],
    loadDistanceBook: (monthStart, roomSlug) => new Promise((resolve) => pending.push({ monthStart, roomSlug, resolve })),
  };
  const uiMocks = { react: runtime.api, 'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-i18next': { useTranslation: () => ({ t: (key) => key, i18n: { language: 'ru' } }) },
    '../data/distanceBook': fakeData, '../data/distanceDump': {}, '../schedule/capacity': { formatLimit: String },
    './PersonAvatar': { PersonChip: 'PersonChip' }, './V2Toast': { showV2Toast() {} },
  };
  for (const [name, symbol] of [['button', 'Button'], ['dialog', 'Dialog'], ['field', 'CompactField'], ['input', 'Input'], ['native-select', 'NativeSelect']])
    uiMocks['@/components/ui/' + name] = { [symbol]: symbol };
  const Component = loader(uiMocks)('src/v2/V2DistanceBook.tsx').V2DistanceBook;
  const render = () => { runtime.reset(); const tree = Component(); runtime.flush(); return tree; };
  const rows = (tree) => find(tree, (n) => n.type?.name === 'PersonBlock');
  const book = (month, people) => ({ monthStart: month, roomSlug: 'winamax', limits: ['50'], months: [month], people, rowCount: people.length, error: null });
  render(); await tick(); render();
  pending.shift().resolve(book('2026-10-01', [person('october') ])); await tick(); render();
  runtime.state[0] = '2026-11-01';
  let tree = render();
  assert.equal(rows(tree).length, 0);
  assert.equal(find(tree, (n) => n.type?.name === 'DistanceEntryDialog').length, 0);
  check('FIXED: old book cannot be shown or edited while a new month loads', { selectedMonth: runtime.state[0], editableRows: rows(tree).length });
  runtime.state[0] = '2026-12-01'; render();
  const november = pending.shift(), december = pending.shift();
  december.resolve(book('2026-12-01', [person('december')])); await tick(); render();
  november.resolve(book('2026-11-01', [person('november')])); await tick(); tree = render();
  assert.equal(runtime.state[0], '2026-12-01'); assert.equal(rows(tree)[0].props.person.key, 'december');
  check('FIXED: late prior-month response is ignored', { selectedMonth: runtime.state[0], displayedMonth: runtime.state[3].monthStart, busy: runtime.state[4] });

  runtime.state[3] = book('2026-12-01', [person('nitro'), person('regular', 'regular'), { ...person('zero', null), playerId: '' }]);
  runtime.state[6] = false; runtime.state[7] = true; runtime.state[12] = 'with'; tree = render();
  assert.equal(rows(tree).map((n) => n.props.person.key).join(','), 'regular');
  runtime.state[12] = 'without'; tree = render();
  assert.equal(rows(tree).map((n) => n.props.person.key).sort().join(','), 'nitro,zero');
  runtime.state[12] = 'all'; runtime.state[11] = 'missing'; tree = render();
  assert.equal(rows(tree).map((n) => n.props.person.key).join(','), 'zero');
  check('Variant/presence/ID predicates on clean data', { regularWith: ['regular'], regularWithout: ['nitro', 'zero'], missingId: ['zero'], passed: true });

  const entry = { id: 'orphan-entry', member_id: null, distance_ext_id: '101', discord_id: '111111111111111111', game_nick: 'GuildPlayer', variant_id: 'nitro', part: 1,
    present: true, roles: [{ id: 'role-rp' }], has_active_profile: false,
    comment: null, source: 'historical', created_at: '2026-10-01', updated_at: '2026-10-01', values: [{ limit_id: '50', tournaments: 20 }] };
  let snapshot = { people_filters_version: 1, people: [], entries: [entry], limits: ['50'], months: [] };
  const db = { rpc: async () => ({ data: snapshot, error: null }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { required_discord_role_id: 'role-rp' } }) }) }) }) };
  const live = loader({ './client': { getSupabase: () => db }, './config': { isLiveData: () => true }, './distanceDump': { formatHands: String } })('src/data/distanceBook.ts');
  const orphan = await live.loadDistanceBook('2026-10-01');
  assert.equal(orphan.people[0].redParty, true);
  check('FIXED: current role metadata applies to historical rows too', { discordId: orphan.people[0].discordId, redParty: orphan.people[0].redParty, activeProfile: orphan.people[0].hasActiveProfile });
  snapshot = { ...snapshot, people: [{ member_id: 'person', distance_ext_id: null, discord_id: entry.discord_id, discord_nick: 'Member', present: true, roles: [{ id: 'role-rp' }] }], entries: [{ ...entry, member_id: 'person' }] };
  const missing = await live.loadDistanceBook('2026-10-01');
  assert.equal(missing.people[0].playerId, '101');
  check('Historical ID substitutes current missing profile ID', { profileId: null, filterId: missing.people[0].playerId });

  const slotCalls = [];
  const slotsDb = { rpc: async (name, args) => {
    slotCalls.push({ name, args });
    return { data: null, error: { message: 'schedule-conflict', code: '40001' } };
  } };
  const slots = loader({ './client': { getSupabase: () => slotsDb }, './kinds': { kindIdOf: async () => 'kind' }, './config': { isLiveData: () => true } })('src/data/slots.ts');
  const response = await slots.applyOwnSlots({ memberId: 'self', variant: 'nitro', limit: '50', year: 2026, monthIndex: 9, place: [{ day: 12, half: 10, level: 0 }, { day: 12, half: 11, level: 0 }], remove: [] });
  assert.equal(response.error, 'schedule-conflict');
  assert.equal(slotCalls.length, 1);
  assert.equal(slotCalls[0].name, 'apply_schedule_edit');
  assert.equal(slotCalls[0].args.p_place.length, 2);
  check('FIXED: own-slot client uses the strict transaction and reports its conflict', { requested: 2, rpc: slotCalls[0].name, error: response.error, treatedAsSuccess: false });
  console.log(JSON.stringify(result, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
