<template>
  <section class="page profile-page">
    <header class="page-head profile-head">
      <div>
        <h1>Профиль игрока</h1>
        <p class="lead">Месяц · лимит · игрок → KPI, heatmap и графики за месяц.</p>
      </div>
    </header>

    <div class="profile-bar">
      <div class="who">
        <strong class="name" :class="{ muted: !player }">{{ player || 'Игрок не выбран' }}</strong>
        <span class="meta muted">{{ monthLabel }} · {{ limit ? `${limit}€` : 'лимит —' }}</span>
      </div>
      <div class="kpi-row">
        <div class="kpi">
          <span class="lab">Max очки</span>
          <strong class="val">{{ ready && !loading ? fmtInt(kpis.maxPoints) : '—' }}</strong>
        </div>
        <div class="kpi">
          <span class="lab">Max скор.</span>
          <strong class="val">{{ ready && !loading ? fmtSpeed(kpis.maxSpeed) : '—' }}</strong>
        </div>
        <div class="kpi">
          <span class="lab">Ср. скор.</span>
          <strong class="val">{{ ready && !loading ? fmtSpeed(kpis.avgSpeed) : '—' }}</strong>
        </div>
      </div>
    </div>

    <LoadingBox v-if="loading" text="Грузим…" />
    <p v-if="error" class="bad">{{ error }}</p>

    <div class="profile-stack">
      <MonthHeatmapGrid
        fluid
        :data="displayHeatmap"
        :title="heatmapTitle"
        :note="heatmapNote"
        class="profile-hm"
      />

      <div class="card profile-speed-card">
        <header class="block-head">
          <h3 class="block-title">Скорость по часам</h3>
          <p class="block-note muted">
            {{ ready ? 'Средняя скорость по часу суток · та же шкала 0–23, что у heatmap сверху' : 'Выберите игрока, лимит и месяц' }}
          </p>
        </header>
        <div class="profile-speed-sync">
          <div class="profile-speed-gutter" aria-hidden="true" />
          <div class="profile-speed-plot">
            <AppChart
              bare
              type="line"
              :height="200"
              :categories="hourCats"
              :series="speedHourSeries"
              :options="speedOpts"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="card note-card profile-note">
      <header class="block-head">
        <h3 class="block-title">Комментарий</h3>
        <p class="block-note muted">
          {{ player ? 'Заметка по игроку · общая для дашборда · не зависит от регов' : 'Выберите игрока, чтобы оставить заметку' }}
        </p>
      </header>
      <textarea
        v-model="noteDraft"
        rows="3"
        maxlength="4000"
        :disabled="!player || noteLoading"
        :placeholder="player ? 'Например: часто играет вечером, агрессивный на 100€…' : 'Сначала выберите игрока'"
      />
      <div class="note-actions">
        <button
          type="button"
          class="primary compact"
          :disabled="!player || noteSaving || noteLoading || !noteDirty"
          @click="saveNote"
        >
          {{ noteSaving ? 'Сохраняю…' : 'Сохранить' }}
        </button>
        <span v-if="noteMsg" class="muted note-msg">{{ noteMsg }}</span>
        <span v-else-if="noteUpdatedAt" class="muted note-msg">обновлён: {{ noteUpdatedAt }}</span>
        <span v-else-if="noteLoading" class="muted note-msg">загрузка…</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import AppChart from '../components/AppChart.vue';
import LoadingBox from '../components/LoadingBox.vue';
import MonthHeatmapGrid from '../components/MonthHeatmapGrid.vue';
import { api } from '../api';
import { useFiltersStore } from '../stores/filters';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const filters = useFiltersStore();
const hmData = ref(null);
const loading = ref(false);
const error = ref('');

const noteDraft = ref('');
const noteSaved = ref('');
const noteUpdatedAt = ref(null);
const noteLoading = ref(false);
const noteSaving = ref(false);
const noteMsg = ref('');

const player = computed(() => (filters.active.players || [])[0] || '');
const limit = computed(() => String(filters.active.limits?.[0] || ''));
const month = computed(() => {
  const m = filters.active.month || (filters.active.dateTo || '').slice(0, 7);
  return m || '';
});

const ready = computed(() => !!(player.value && limit.value && month.value));
const noteDirty = computed(() => (noteDraft.value || '') !== (noteSaved.value || ''));

const monthLabel = computed(() => {
  const key = month.value;
  if (!key) return 'месяц —';
  const [y, m] = String(key).split('-');
  if (!y || !m) return key;
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
});

/** Пустой каркас месяца (без выбора игрока / до загрузки). */
function emptyMonthHeatmap(ym, lim) {
  const key = ym || new Date().toISOString().slice(0, 7);
  const [y, m] = key.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = [];
  for (let dom = 1; dom <= daysInMonth; dom++) {
    const day = `${key}-${String(dom).padStart(2, '0')}`;
    const w = new Date(Date.UTC(y, m - 1, dom, 12)).getUTCDay();
    days.push({
      day,
      dom,
      weekday: w,
      weekdayLabel: WD[w],
      dayMax: null,
      hours: Array.from({ length: 24 }, (_, hour) => ({
        day,
        hour,
        diff_points: null,
        empty: true,
        serverDown: false
      }))
    });
  }
  return {
    days,
    maxDiff: 0,
    month: key,
    limit: lim || null,
    mode: 'player',
    metric: 'diff_points'
  };
}

const displayHeatmap = computed(() => {
  if (hmData.value) return hmData.value;
  return emptyMonthHeatmap(month.value, limit.value);
});

const heatmapTitle = computed(() => {
  if (!ready.value) return 'Heatmap · день × час';
  return `${monthLabel.value} · ${limit.value}€ · ${player.value}`;
});

const heatmapNote = computed(() => {
  if (!ready.value) return 'Заливка = прирост · carry серый→белый · (+Δ) цвет ячейки · Σ слева.';
  return 'Заливка = прирост за час. Carry ярче от очков; (+Δ) — цвет ячейки. Σ — итог дня.';
});

const hourCats = computed(() => Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')));

/** Средняя скорость по часу суток (по всем дням месяца с данными). */
const speedHourSeries = computed(() => {
  const days = hmData.value?.days || [];
  const sums = Array(24).fill(0);
  const counts = Array(24).fill(0);
  for (const row of days) {
    for (const cell of row.hours || []) {
      if (cell?.serverDown || cell?.empty || cell.speed == null) continue;
      const s = Number(cell.speed);
      if (!Number.isFinite(s)) continue;
      const h = Number(cell.hour);
      if (h < 0 || h > 23) continue;
      sums[h] += s;
      counts[h] += 1;
    }
  }
  const data = sums.map((s, i) => (counts[i] ? Math.round((s / counts[i]) * 10) / 10 : null));
  return [{ name: 'Ср. скорость', type: 'line', data }];
});

/** Опции скорости: 24 равные доли, без лишнего left padding (выравнивание gutter’ом). */
const speedOpts = {
  colors: ['#60a5fa'],
  stroke: { width: 2.5, curve: 'smooth', connectNulls: false },
  dataLabels: { enabled: false },
  markers: { size: 0 },
  legend: { show: false },
  grid: {
    padding: { left: 0, right: 4, top: 8, bottom: 0 },
    xaxis: { lines: { show: false } }
  },
  xaxis: {
    tickAmount: 24,
    labels: {
      style: { colors: '#8b95a8', fontSize: '10px' },
      rotate: 0,
      hideOverlappingLabels: false
    },
    tooltip: { enabled: false }
  },
  yaxis: {
    labels: { style: { colors: '#8b95a8', fontSize: '10px' }, maxWidth: 36 },
    forceNiceScale: true
  },
  tooltip: { shared: true, intersect: false }
};

const kpis = computed(() => {
  let maxPoints = null;
  let maxSpeed = null;
  let spdSum = 0;
  let spdN = 0;
  for (const row of hmData.value?.days || []) {
    if (row.dayMax != null && Number.isFinite(Number(row.dayMax))) {
      const v = Number(row.dayMax);
      maxPoints = maxPoints == null ? v : Math.max(maxPoints, v);
    }
    for (const cell of row.hours || []) {
      if (cell?.serverDown || cell?.empty) continue;
      const spd = cell.speed;
      if (spd == null || !Number.isFinite(Number(spd))) continue;
      const s = Number(spd);
      maxSpeed = maxSpeed == null ? s : Math.max(maxSpeed, s);
      spdSum += s;
      spdN += 1;
    }
  }
  return {
    maxPoints,
    maxSpeed,
    avgSpeed: spdN ? spdSum / spdN : null
  };
});

function fmtInt(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return String(Math.round(v));
}

function fmtSpeed(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

async function loadNote() {
  noteMsg.value = '';
  if (!player.value) {
    noteDraft.value = '';
    noteSaved.value = '';
    noteUpdatedAt.value = null;
    noteLoading.value = false;
    return;
  }
  noteLoading.value = true;
  try {
    const res = await api.getPlayerNote(player.value);
    noteDraft.value = res?.note || '';
    noteSaved.value = res?.note || '';
    noteUpdatedAt.value = res?.updated_at || null;
  } catch (e) {
    noteMsg.value = e.message || String(e);
    noteDraft.value = '';
    noteSaved.value = '';
    noteUpdatedAt.value = null;
  } finally {
    noteLoading.value = false;
  }
}

async function saveNote() {
  if (!player.value) return;
  noteSaving.value = true;
  noteMsg.value = '';
  try {
    const res = await api.playerNote(player.value, noteDraft.value);
    noteDraft.value = res?.note || '';
    noteSaved.value = res?.note || '';
    noteUpdatedAt.value = res?.updated_at || null;
    noteMsg.value = res?.note ? 'сохранено' : 'комментарий удалён';
  } catch (e) {
    noteMsg.value = e.message || String(e);
  } finally {
    noteSaving.value = false;
  }
}

async function load() {
  error.value = '';
  hmData.value = null;
  if (!ready.value) {
    return;
  }
  loading.value = true;
  try {
    const qs = new URLSearchParams({
      player: player.value,
      limit: limit.value,
      month: month.value
    });
    hmData.value = await api.heatmap(qs.toString());
  } catch (e) {
    error.value = e.message || String(e);
    hmData.value = null;
  } finally {
    loading.value = false;
  }
}

watch(
  () => player.value,
  () => loadNote(),
  { immediate: true }
);

watch(
  () => [filters.version, player.value, limit.value, month.value],
  () => load(),
  { immediate: true }
);
</script>

<style scoped>
.profile-page {
  max-width: none;
  --hm-lab: 52px;
  --hm-sum: 56px;
  --hm-gap: 2px;
  --hm-gutter: calc(var(--hm-lab) + var(--hm-gap) + var(--hm-sum));
  --hm-pad-x: 12px;
}

.profile-head {
  margin-bottom: 8px;
}
.profile-head h1 {
  font-size: 1.15rem;
}
.profile-head .lead {
  margin: 2px 0 0;
  font-size: 0.8rem;
  line-height: 1.35;
  max-width: none;
}

.profile-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 8px;
  padding: 6px 0;
}
.who {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  min-width: 0;
}
.name {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.meta {
  font-size: 0.78rem;
  text-transform: capitalize;
}

.kpi-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.kpi {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #2a364a;
  background: #121826;
  min-width: 0;
}
.lab {
  font-size: 0.68rem;
  color: #8b95a8;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.val {
  font-size: 0.98rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.profile-note {
  margin: 0 0 10px;
  padding: 10px var(--hm-pad-x, 12px) 12px;
}
.profile-note textarea {
  width: 100%;
  resize: vertical;
  min-height: 72px;
  background: #0b1018;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  color: inherit;
  font: inherit;
  line-height: 1.45;
}
.profile-note textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.profile-note textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.note-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.note-msg {
  font-size: 0.78rem;
}
.profile-note button.compact {
  padding: 5px 10px;
  font-size: 0.82rem;
  border-radius: 8px;
}

.profile-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile-hm :deep(.grid-card) {
  padding: 10px var(--hm-pad-x) 12px;
  margin-top: 0;
}
.profile-hm :deep(.hm-scroll) {
  margin-top: 0;
  overflow-x: hidden;
}

.profile-speed-card {
  padding: 10px var(--hm-pad-x) 12px;
  margin: 0;
}

.block-head {
  margin-bottom: 6px;
}
.block-title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 650;
}
.block-note {
  margin: 2px 0 0;
  font-size: 0.72rem;
  line-height: 1.3;
}

/* Gutter = колонки даты+Σ heatmap → часы 0–23 совпадают с клетками сверху */
.profile-speed-sync {
  display: grid;
  grid-template-columns: var(--hm-gutter) minmax(0, 1fr);
  column-gap: var(--hm-gap);
  align-items: stretch;
}
.profile-speed-gutter {
  min-width: 0;
}
.profile-speed-plot {
  min-width: 0;
  /* Apex Y-labels чуть лезут влево — компенсируем, как на Points */
  margin-left: -36px;
  width: calc(100% + 36px);
}

@media (max-width: 700px) {
  .profile-speed-sync {
    grid-template-columns: 1fr;
  }
  .profile-speed-gutter {
    display: none;
  }
  .profile-speed-plot {
    margin-left: 0;
    width: 100%;
  }
}
</style>
