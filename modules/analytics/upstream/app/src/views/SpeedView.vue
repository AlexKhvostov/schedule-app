<template>
  <section class="page speed-page">
    <div class="speed-toolbar card">
      <div class="st-brand">
        <h1>Скорость</h1>
        <p class="st-lead muted">
          Оч/ч из агрегата · <strong>{{ monthLabel }}</strong> · {{ limit }}€
          <span class="dot">·</span>
          {{ audienceLabel }}
          <span class="dot">·</span>
          месяц и лимит — в общем фильтре
        </p>
      </div>
      <div class="st-controls">
        <div class="st-row">
          <span class="st-lab">Топ</span>
          <div class="st-btns">
            <button
              v-for="n in topNOptions"
              :key="'top'+n"
              type="button"
              class="ghost compact"
              :class="{ on: String(sectionTopN) === String(n) }"
              :disabled="loading"
              @click="setSectionTopN(n)"
            >{{ n === 'all' ? 'All' : `Top ${n}` }}</button>
          </div>
        </div>
      </div>
    </div>

    <LoadingBox v-if="loading" text="Грузим скорость…" />
    <p v-if="error" class="bad">{{ error }}</p>

    <template v-if="!loading && data">
      <div class="card block-card">
        <header class="block-head">
          <h3 class="block-title">Топ по скорости</h3>
          <p class="block-note muted">
            Max / avg оч/ч за месяц · под max — лучший час (+очки / мин)
            <span v-if="metaLine" class="sep">·</span>
            <span v-if="metaLine">{{ metaLine }}</span>
          </p>
        </header>

        <table class="speed-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>
                <span class="th-with-tip">
                  Max оч/ч
                  <InfoTip text="MAX(speed) за месяц. Только часы с окном >20 мин (diff_seconds > 1200). Скорость внутри часа: (max−min) / |max_at−min_at| × 3600. Час 0: max от полуночи ES." />
                </span>
              </th>
              <th>
                <span class="th-with-tip">
                  Avg оч/ч
                  <InfoTip text="AVG(speed) по часам с окном >20 мин и speed > 0 за месяц." />
                </span>
              </th>
              <th>
                <span class="th-with-tip">
                  Max points
                  <InfoTip text="Пик max_points_carry / max_points_hour за месяц." />
                </span>
              </th>
              <th>Рег</th>
              <th>В список</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data?.rows || []" :key="row.player_name">
              <td>
                <RouterLink :to="`/player/${encodeURIComponent(row.player_name)}`">{{ row.player_name }}</RouterLink>
              </td>
              <td>
                <div class="metric">
                  <span class="metric-val" :title="bestTitle(row)">{{ formatRate(row.max_speed) }}</span>
                  <span v-if="row.best_delta != null" class="metric-sub">
                    +{{ row.best_delta }} за {{ row.best_minutes }} мин
                  </span>
                  <div class="bar" title="относительно max в таблице">
                    <i class="fill max" :style="{ width: pct(row.max_speed, maxOf.maxSpeed) }" />
                  </div>
                </div>
              </td>
              <td>
                <div class="metric">
                  <span class="metric-val">{{ formatRate(row.avg_speed) }}</span>
                  <div class="bar">
                    <i class="fill avg" :style="{ width: pct(row.avg_speed, maxOf.avgSpeed) }" />
                  </div>
                </div>
              </td>
              <td>
                <div class="metric">
                  <span class="metric-val">{{ row.max_points }}</span>
                  <div class="bar">
                    <i class="fill pts" :style="{ width: pct(row.max_points, maxOf.maxPoints) }" />
                  </div>
                </div>
              </td>
              <td>
                <div class="reg-cell">
                  <template v-if="regSideOf(row.player_name)">
                    <span class="chip" :class="regSideOf(row.player_name)">
                      {{ regSideOf(row.player_name) === 'ours' ? 'свой' : 'чужой' }}
                    </span>
                    <button
                      type="button"
                      class="icon-btn del-reg"
                      :disabled="regBusy"
                      title="Убрать из списка регов"
                      @click.stop="removeReg(row.player_name)"
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                        <path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM6 9h2v9H6V9zm-1 12h14l1-11H4l1 11z"/>
                      </svg>
                    </button>
                  </template>
                  <span v-else class="muted">—</span>
                </div>
              </td>
              <td>
                <div class="acts">
                  <button
                    type="button"
                    class="ghost compact btn-theirs"
                    :class="{ dim: regSideOf(row.player_name) === 'theirs' }"
                    :disabled="regBusy || regSideOf(row.player_name) === 'theirs'"
                    @click.stop="addReg(row.player_name, 'theirs')"
                  >+чужой</button>
                  <button
                    type="button"
                    class="ghost compact btn-ours"
                    :class="{ dim: regSideOf(row.player_name) === 'ours' }"
                    :disabled="regBusy || regSideOf(row.player_name) === 'ours'"
                    @click.stop="addReg(row.player_name, 'ours')"
                  >+свой</button>
                </div>
              </td>
            </tr>
            <tr v-if="!(data?.rows || []).length">
              <td colspan="6" class="muted empty-row">Нет строк со скоростью &gt; 0 за этот месяц / лимит.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card block-card">
        <header class="block-head">
          <h3 class="block-title">Средняя скорость по часам</h3>
          <p class="block-note muted">
            Столбцы — Top · линия — все по фильтру · только окна &gt;20 мин
          </p>
        </header>
        <AppChart
          v-if="categories.length"
          bare
          type="line"
          zoomable
          :height="320"
          :categories="categories"
          :series="series"
          :options="hourOpts"
        />
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import AppChart from '../components/AppChart.vue';
import LoadingBox from '../components/LoadingBox.vue';
import InfoTip from '../components/InfoTip.vue';
import { api, toQuery } from '../api';
import { useFiltersStore } from '../stores/filters';
import { useRegsStore } from '../stores/regs';

const filters = useFiltersStore();
const regs = useRegsStore();
const data = ref(null);
const error = ref('');
const loading = ref(false);
const regBusy = ref(false);
const topNOptions = ['10', '50', '100', 'all'];
const sectionTopN = ref('50');

function regSideOf(name) {
  return regs.map[name]?.side || null;
}

async function addReg(name, side) {
  if (!name || regBusy.value) return;
  regBusy.value = true;
  error.value = '';
  try {
    await regs.upsert(name, side);
  } catch (e) {
    error.value = e.message || String(e);
  } finally {
    regBusy.value = false;
  }
}

async function removeReg(name) {
  if (!name || regBusy.value) return;
  regBusy.value = true;
  error.value = '';
  try {
    await regs.remove(name);
  } catch (e) {
    error.value = e.message || String(e);
  } finally {
    regBusy.value = false;
  }
}

const month = computed(() => {
  const m = filters.active.month || (filters.active.dateTo || '').slice(0, 7);
  return m || '';
});
const limit = computed(() => String(filters.active.limits?.[0] || '100'));

const monthLabel = computed(() => {
  const [y, m] = String(month.value || '').split('-');
  if (!y || !m) return month.value || '—';
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
});

const audienceLabel = computed(() => {
  const a = filters.active;
  const parts = [];
  if (a.segment && a.segment !== 'all') {
    const map = {
      ours: 'свои',
      theirs: 'чужие',
      regs: 'реги',
      nonregs: 'не в списке',
      not_ours: 'не свои',
      not_theirs: 'не чужие'
    };
    parts.push(map[a.segment] || a.segment);
  }
  if (a.players?.length) {
    parts.push(a.players.length === 1 ? a.players[0] : `${a.players.length} ников`);
  }
  return parts.length ? parts.join(' · ') : 'все';
});

function setSectionTopN(n) {
  sectionTopN.value = String(n);
  load();
}

async function load() {
  error.value = '';
  if (!month.value || !limit.value) {
    data.value = null;
    return;
  }
  loading.value = true;
  try {
    const a = filters.active;
    data.value = await api.speed(
      toQuery({
        month: month.value,
        limit: limit.value,
        limits: [limit.value],
        players: a.players,
        segment: a.segment,
        topN: sectionTopN.value,
        dateFrom: a.dateFrom,
        dateTo: a.dateTo
      })
    );
    await regs.load();
  } catch (e) {
    error.value = e.message;
    data.value = null;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [filters.version, month.value, limit.value],
  () => load(),
  { immediate: true }
);

const categories = computed(() =>
  Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
);
const series = computed(() => [
  {
    name: 'Top',
    type: 'column',
    data: (data.value?.byHour || []).map((h) => h.avg_speed)
  },
  {
    name: 'Все по фильтру',
    type: 'line',
    data: (data.value?.byHour || []).map((h) => h.avg_speed_all ?? null)
  }
]);

const hourOpts = {
  colors: ['#818cf8', '#fbbf24'],
  stroke: { width: [0, 2.5], curve: 'smooth', connectNulls: true },
  plotOptions: { bar: { borderRadius: 3, columnWidth: '55%' } },
  dataLabels: { enabled: false },
  markers: { size: 0 },
  legend: { show: true, position: 'top', fontSize: '11px' },
  grid: { padding: { left: 4, right: 6, top: 4, bottom: 0 } },
  xaxis: {
    labels: {
      rotate: 0,
      hideOverlappingLabels: true,
      style: { colors: '#8b95a8', fontSize: '10px' },
      formatter(value) {
        const h = Number.parseInt(String(value), 10);
        if (Number.isNaN(h)) return value;
        return h % 3 === 0 ? String(h).padStart(2, '0') : '';
      }
    }
  },
  yaxis: {
    labels: { style: { colors: '#8b95a8', fontSize: '10px' }, maxWidth: 40 }
  },
  tooltip: { shared: true, intersect: false }
};

const maxOf = computed(() => {
  const rows = data.value?.rows || [];
  return {
    maxSpeed: Math.max(1, ...rows.map((r) => Number(r.max_speed) || 0)),
    avgSpeed: Math.max(1, ...rows.map((r) => Number(r.avg_speed) || 0)),
    maxPoints: Math.max(1, ...rows.map((r) => Number(r.max_points) || 0))
  };
});

const metaLine = computed(() => {
  const meta = data.value?.meta;
  if (!meta) return '';
  const n = meta.withSpeed ?? (data.value?.rows || []).length;
  const samples = data.value?.samples ?? 0;
  if (meta.topN === 'all') return `${n} игроков · ${samples} час-строк`;
  return `Top ${meta.topN} · ${n} · ${samples} час-строк`;
});

function pct(value, max) {
  const n = Number(value) || 0;
  const m = Number(max) || 1;
  return `${Math.max(4, Math.round((n / m) * 100))}%`;
}

function formatRate(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n % 1 === 0 ? n : n.toFixed(1)} оч/ч`;
}

function bestTitle(row) {
  if (row.best_delta == null) return '';
  const when = [row.best_day, row.best_hour != null ? `${row.best_hour}:00 ES` : null]
    .filter(Boolean)
    .join(' · ');
  return `Лучший час: +${row.best_delta} за ${row.best_minutes} мин → ${formatRate(row.max_speed)}${when ? ` (${when})` : ''}`;
}
</script>

<style scoped>
.speed-page { max-width: none; width: 100%; }

.speed-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px 20px;
  margin: 0 0 10px;
  padding: 10px 14px;
}
.st-brand h1 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.st-lead {
  margin: 2px 0 0;
  font-size: 0.78rem;
  line-height: 1.35;
}
.st-lead .dot { opacity: 0.45; margin: 0 2px; }
.st-lead strong { color: var(--text); font-weight: 650; }
.st-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}
.st-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  justify-content: flex-end;
}
.st-lab {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b95a8;
}
.st-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.st-btns .ghost.on {
  border-color: var(--accent);
  color: var(--text);
  background: #152238;
}
.compact {
  padding: 4px 10px;
  font-size: 0.8rem;
}

.block-card {
  margin: 0 0 12px;
  padding: 12px 14px;
}
.block-head { margin-bottom: 8px; }
.block-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 650;
}
.block-note {
  margin: 2px 0 0;
  font-size: 0.76rem;
  line-height: 1.35;
}
.block-note .sep { opacity: 0.45; margin: 0 4px; }

.speed-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.speed-table th,
.speed-table td {
  text-align: left;
  padding: 6px 6px;
  border-bottom: 1px solid #1e293b;
  vertical-align: middle;
}
.speed-table th {
  color: #8b95a8;
  font-weight: 550;
  font-size: 0.75rem;
  vertical-align: bottom;
}
.empty-row { text-align: center; padding: 18px 8px !important; }
.reg-cell {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  min-height: 22px;
  min-width: 88px;
}
.reg-cell .chip {
  padding: 2px 8px;
  font-size: 0.72rem;
  line-height: 1.2;
  height: 22px;
  box-sizing: border-box;
  flex-shrink: 0;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 6px;
  background: transparent;
  border: 1px solid #4a5568;
  color: #94a3b8;
  flex-shrink: 0;
  line-height: 0;
}
.icon-btn.del-reg {
  border-color: #7f1d1d;
  color: #fca5a5;
}
.icon-btn:hover:not(:disabled) {
  border-color: #fb7185;
  color: #fecdd3;
  background: rgba(127, 29, 29, 0.25);
}
.icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.acts {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  min-height: 22px;
}
.acts .ghost.compact {
  padding: 2px 7px;
  font-size: 0.7rem;
  line-height: 1.2;
  height: 22px;
  min-width: 58px;
  box-sizing: border-box;
  flex-shrink: 0;
}
.acts .btn-theirs {
  color: #fca5a5;
  border-color: #7f1d1d;
  background: rgba(127, 29, 29, 0.18);
}
.acts .btn-ours {
  color: #6ee7b7;
  border-color: #115e59;
  background: rgba(17, 94, 89, 0.2);
}
.acts .btn-theirs:hover:not(:disabled),
.acts .btn-ours:hover:not(:disabled) {
  filter: brightness(1.12);
}
.acts .ghost.compact.dim,
.acts .ghost.compact:disabled {
  opacity: 0.38;
  cursor: default;
  filter: none;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 72px;
}
.metric-val {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.metric-sub {
  font-size: 0.7rem;
  color: var(--muted);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.bar {
  height: 5px;
  border-radius: 999px;
  background: #1a2333;
  overflow: hidden;
}
.bar .fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  min-width: 4px;
}
.bar .fill.max { background: linear-gradient(90deg, #6366f1, #a5b4fc); }
.bar .fill.avg { background: linear-gradient(90deg, #0d9488, #5eead4); }
.bar .fill.pts { background: linear-gradient(90deg, #b45309, #fbbf24); }
.th-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

@media (max-width: 820px) {
  .st-controls { align-items: flex-start; width: 100%; }
  .st-row { justify-content: flex-start; }
}
</style>
