<template>
  <section class="page points-page">
    <div class="points-toolbar card">
      <div class="pt-brand">
        <h1>Очки за день</h1>
        <p class="pt-lead muted">
          Очки за день ES · <strong>{{ pointsDay }}</strong>
          <span class="dot">·</span>
          карта: цвет = прирост/час · в ячейке carry и (+Δ) · скорость: внутри часа
          <span class="dot">·</span>
          дата и лимит — в общем фильтре сверху
        </p>
      </div>
      <div class="pt-regs">
        <button
          type="button"
          class="ghost compact regs-open-btn"
          :disabled="sectionBusy || !sectionPlayerNames.length"
          @click="regsModalOpen = true"
        >В реги ({{ sectionPlayerNames.length }})</button>
      </div>
      <div class="pt-controls">
        <div class="pt-row">
          <span class="pt-lab">Игроков</span>
          <div class="pt-btns">
            <button
              v-for="n in sectionTopOptions"
              :key="'top'+n"
              type="button"
              class="ghost compact"
              :class="{ on: String(sectionTopN) === String(n) }"
              :disabled="sectionBusy"
              @click="setSectionTopN(n)"
            >{{ n === 'all' ? 'All' : `Top ${n}` }}</button>
          </div>
        </div>
        <div class="pt-row">
          <span class="pt-lab">Сортировка</span>
          <div class="pt-btns">
            <button
              type="button"
              class="ghost compact"
              :class="{ on: sectionSort === 'points' }"
              :disabled="sectionBusy"
              @click="setSectionSort('points')"
            >по очкам</button>
            <button
              type="button"
              class="ghost compact"
              :class="{ on: sectionSort === 'speed' }"
              :disabled="sectionBusy"
              @click="setSectionSort('speed')"
            >по скорости</button>
            <button
              type="button"
              class="ghost compact"
              :class="{ on: sectionSort === 'name' }"
              :disabled="sectionBusy"
              @click="setSectionSort('name')"
            >по нику</button>
          </div>
        </div>
      </div>
    </div>

    <LoadingBox v-if="sectionBusy" text="Грузим данные…" />

    <div v-show="!sectionBusy" class="card block-card">
      <header class="block-head">
        <div class="block-titles">
          <h3 class="block-title">Heatmap</h3>
          <p class="block-note muted">
            Игрок × час · заливка = прирост · carry ярче от очков · (+Δ) в цвет ячейки
            · колонка Σ — итог дня
            · {{ pointsDay }} · {{ hmLimit }}€
            <span class="sep">·</span>
            алая рамка — простой сервера
          </p>
        </div>
      </header>

      <p v-if="hmError" class="bad">{{ hmError }}</p>
      <p v-else-if="hmData && !hmData.players?.length" class="muted empty-msg">
        Нет строк в агрегате за {{ pointsDay }} / {{ hmLimit }}€.
      </p>

      <div v-if="hmData?.players?.length" class="phm-scroll">
        <div class="phm-grid">
          <div class="phm-corner">Игрок</div>
          <div class="phm-sum-h" title="Итог очков за день (carry max)">Σ</div>
          <div v-for="h in 24" :key="'hh'+h" class="phm-h">{{ h - 1 }}</div>

          <template v-for="p in hmData.players" :key="p.player_name">
            <div class="phm-name" :title="p.player_name">
              <RouterLink :to="`/player/${encodeURIComponent(p.player_name)}`">{{ p.player_name }}</RouterLink>
            </div>
            <div
              class="phm-sum"
              :style="daySumStyle(p.dayMax)"
              :title="`Итог дня: ${p.dayMax ?? '—'}`"
            >{{ p.dayMax != null ? p.dayMax : '—' }}</div>
            <button
              v-for="cell in p.hours"
              :key="p.player_name + '-' + cell.hour"
              type="button"
              class="phm-cell"
              :class="hmCellClass(cell)"
              :style="hmCellStyle(cell)"
              @mouseenter="hmTipShow($event, p, cell, false)"
              @mouseleave="hmTipHide()"
              @click="hmTipShow($event, p, cell, true)"
            >
              <HeatmapCellLabel
                :cell="cell"
                :bright-max="hmCarryScale"
                :delta-style="cellValStyle(cell.diff_points)"
              />
            </button>
          </template>
        </div>
      </div>

      <div class="phm-legend muted">
        <span>заливка = прирост · carry: серый→белый (свечение с 200) · (+Δ) = цвет ячейки · Σ синяя тепловая</span>
        <span class="sep">·</span>
        <i class="phm-sw" :style="hmSwatch(0)" />
        <i class="phm-sw" :style="hmSwatch(20)" />
        <i class="phm-sw" :style="hmSwatch(40)" />
        <i class="phm-sw" :style="hmSwatch(60)" />
        <i class="phm-sw" :style="hmSwatch(80)" />
        <span>80+</span>
        <span class="sep">·</span>
        <i class="phm-sw is-down-sw" />
        <span>простой</span>
        <span v-if="hmData" class="sep">·</span>
        <span v-if="hmData">{{ hmData.players.length }} / {{ hmData.totalPlayers }}</span>
      </div>

      <HeatmapFloatTip
        :tip="hmTip"
        @keep="hmTipKeep"
        @close="hmTipClose"
      >
        <template #default="{ tip }">
          <div class="tip-head">
            <div class="tip-title">{{ tip.player }}</div>
            <div
              v-if="!tip.cell.serverDown && tip.cell.max_points_carry != null"
              class="tip-hero"
            >
              <span class="tip-hero-pts">{{ tip.cell.max_points_carry }}</span>
              <span
                v-if="tip.cell.diff_points != null"
                class="tip-hero-delta"
              >{{ tip.cell.diff_points > 0 ? '+' : '' }}{{ tip.cell.diff_points }}</span>
            </div>
            <div class="tip-sub">{{ pointsDay }} · час {{ String(tip.cell.hour).padStart(2, '0') }}:00</div>
          </div>
          <p v-if="tip.cell.serverDown" class="down-banner">Сервер не собирал данные в этот час</p>
          <div
            v-else-if="tip.cell.max_points_carry == null && (tip.cell.empty || tip.cell.diff_points == null)"
            class="tip-empty"
          >
            Нет данных в агрегате
          </div>
          <div v-else class="tip-rows">
            <div class="tip-row">
              <span class="tip-label">Внутри часа</span>
              <span class="tip-value">
                {{ tip.cell.min_points_hour }} → {{ tip.cell.max_points_hour }}
                <span v-if="tip.cell.diff_within_hour != null" class="dim">
                  (+{{ tip.cell.diff_within_hour }})
                </span>
              </span>
            </div>
            <div class="tip-row">
              <span class="tip-label">Max часа</span>
              <span class="tip-value">{{ tip.cell.max_points_hour }}</span>
            </div>
            <div class="tip-row">
              <span class="tip-label">Время пика</span>
              <span class="tip-value">{{ tip.cell.max_at || '—' }}</span>
            </div>
            <div v-if="tip.cell.speed != null" class="tip-row">
              <span class="tip-label">Скорость</span>
              <span class="tip-value">{{ Math.round(tip.cell.speed * 10) / 10 }} оч/ч внутри часа</span>
            </div>
          </div>
        </template>
      </HeatmapFloatTip>
    </div>

    <div v-show="!sectionBusy" class="card block-card">
      <header class="block-head">
        <div class="block-titles">
          <h3 class="block-title">График очков</h3>
          <p class="block-note muted">
            Таймлайн совпадает с heatmap сверху · шаг ~6 мин · зум: выделение / колёсико
            · слева — ссылки на профиль · легенда внизу — вкл/выкл линий
          </p>
        </div>
      </header>

      <p v-if="error" class="bad">{{ error }}</p>
      <p v-if="!error && !series.length" class="muted empty-msg">
        Нет снимков за {{ pointsDay }} по выбранным лимитам / сегменту.
      </p>

      <div
        v-if="categories.length && series.length"
        class="chart-sync"
      >
        <aside class="chart-sync-gutter" aria-label="Профили игроков">
          <div class="chart-leg-head muted">профили</div>
          <p class="chart-leg-hint muted">клик → профиль</p>
          <ul class="chart-leg">
            <li v-for="item in chartLegend" :key="item.name" class="chart-leg-item">
              <i class="chart-leg-dot" :style="{ background: item.color }" />
              <RouterLink
                class="chart-leg-name"
                :to="`/player/${encodeURIComponent(item.name)}`"
                :title="`Профиль: ${item.name}`"
              >{{ item.name }}</RouterLink>
            </li>
          </ul>
        </aside>
        <div class="chart-sync-plot">
          <AppChart
            :key="chartKey"
            bare
            type="line"
            :height="500"
            zoomable
            :categories="categories"
            :series="series"
            :options="chartOptions"
          />
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="regsModalOpen"
        class="regs-modal-backdrop"
        role="presentation"
        @click.self="regsModalOpen = false"
      >
        <div class="regs-modal" role="dialog" aria-label="Добавить в реги">
          <header class="regs-modal-head">
            <div>
              <h3 class="block-title">Добавить в реги</h3>
              <p class="block-note muted">Ники из текущего Top. Клик — в чужие реги.</p>
            </div>
            <button type="button" class="ghost compact" @click="regsModalOpen = false">Закрыть</button>
          </header>
          <div class="regs-modal-list">
            <button
              v-for="name in sectionPlayerNames"
              :key="name"
              type="button"
              class="ghost chip-btn"
              @click="addReg(name)"
            >+ {{ name }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import AppChart from '../components/AppChart.vue';
import HeatmapCellLabel from '../components/HeatmapCellLabel.vue';
import HeatmapFloatTip from '../components/HeatmapFloatTip.vue';
import LoadingBox from '../components/LoadingBox.vue';
import { api, toQuery } from '../api';
import { useFiltersStore } from '../stores/filters';
import { useRegsStore } from '../stores/regs';
import {
  floorSpainMinute,
  spainDateOnly,
  spainDaySlots,
  spainNowSlot,
  utcToSpainMinute
} from '../utils/spainTime';
import { maxCarryScale, daySumBlueHeatStyle, deltaCellTextStyle } from '../utils/heatmapTextStyle.js';

const SLOT_MIN = 6;

const filters = useFiltersStore();
const regs = useRegsStore();
const data = ref(null);
const error = ref('');
const loading = ref(false);
const regsModalOpen = ref(false);
const palette = ['#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#fb7185', '#c084fc', '#22d3ee', '#fda4af', '#a3e635', '#f59e0b'];
const sectionTopOptions = ['10', '50', '100', 'all'];
/** Окно для «текущей скорости», минуты */
const SPEED_WINDOW_MIN = 30;

/** Фильтры раздела Points (общие для heatmap + графика) */
const sectionTopN = ref('10');
/** points | speed | name */
const sectionSort = ref('points');
const hmData = ref(null);
const hmLoading = ref(false);
const hmError = ref('');
/** @type {import('vue').Ref<null | { x: number, y: number, pinned: boolean, player: string, cell: object }>} */
const hmTip = ref(null);
let hmTipHideTimer = null;
const HM_SCALE = 80;

const pointsDay = computed(() => {
  const a = filters.active;
  return a?.dateTo || a?.dateFrom || spainDateOnly();
});
const hmLimit = computed(() => String(filters.active.limits?.[0] || '100'));
const sectionBusy = computed(() => loading.value || hmLoading.value);
const sectionPlayerNames = computed(() => {
  if (hmData.value?.players?.length) {
    return hmData.value.players.map((p) => p.player_name);
  }
  return data.value?.players || [];
});
const hmApiSort = computed(() => {
  if (sectionSort.value === 'speed') return 'speed';
  if (sectionSort.value === 'name') return 'name';
  return 'day_max';
});
/** Шкала яркости carry и столбца Σ. */
const hmCarryScale = computed(() => maxCarryScale(hmData.value?.players || []));

function daySumStyle(dayMax) {
  return daySumBlueHeatStyle(dayMax, hmCarryScale.value);
}

/** Сортировка строк во всплывашке графика — как раздел (name → по очкам) */
const tooltipSort = computed(() => (sectionSort.value === 'speed' ? 'speed' : 'points'));

function setSectionTopN(n) {
  sectionTopN.value = String(n);
  load();
}

function setSectionSort(s) {
  sectionSort.value = s;
  load();
}


function hmTipAnchor(ev) {
  const r = ev.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top, yBottom: r.bottom };
}

function hmTipShow(ev, playerRow, cell, pinned) {
  if (hmTipHideTimer) {
    clearTimeout(hmTipHideTimer);
    hmTipHideTimer = null;
  }
  const pos = hmTipAnchor(ev);
  hmTip.value = {
    ...pos,
    pinned: !!pinned,
    player: playerRow.player_name,
    cell
  };
}

function hmTipHide() {
  if (hmTip.value?.pinned) return;
  if (hmTipHideTimer) clearTimeout(hmTipHideTimer);
  hmTipHideTimer = setTimeout(() => {
    if (!hmTip.value?.pinned) hmTip.value = null;
  }, 120);
}

function hmTipKeep() {
  if (hmTipHideTimer) {
    clearTimeout(hmTipHideTimer);
    hmTipHideTimer = null;
  }
}

function hmTipClose() {
  if (hmTipHideTimer) {
    clearTimeout(hmTipHideTimer);
    hmTipHideTimer = null;
  }
  hmTip.value = null;
}

function hmCellClass(cell) {
  if (cell?.serverDown) return { 'is-down': true };
  if (!cell || cell.empty || cell.diff_points == null) return {};
  const v = Number(cell.diff_points) || 0;
  if (v <= 0) return { 'is-zero': true };
  return { 'has-val': true };
}

function hmCellStyle(cell) {
  if (cell?.serverDown) {
    // приглушённый алый — заметен, но не ярче зелёных клеток
    return { background: 'rgba(176, 52, 52, 0.14)' };
  }
  if (!cell || cell.empty || cell.diff_points == null) {
    return { background: 'transparent' };
  }
  const v = Math.max(0, Number(cell.diff_points) || 0);
  // 0 — без заливки, контур через CSS .is-zero
  if (v <= 0) {
    return { background: 'transparent' };
  }
  const t = Math.min(1, v / HM_SCALE);
  if (v <= 5) {
    const soft = 0.1 + (v / 5) * 0.18;
    return { background: `rgba(90, 140, 120, ${soft.toFixed(3)})` };
  }
  const alpha = 0.18 + t * 0.82;
  return { background: `rgba(62, 207, 142, ${alpha.toFixed(3)})` };
}

function hmSwatch(v) {
  return hmCellStyle({ diff_points: v, empty: false });
}

/**
 * Цвет подписи (+Δ): от силы прироста ячейки (как заливка).
 */
function cellValStyle(diff) {
  return deltaCellTextStyle(diff, HM_SCALE);
}

async function loadHeatmap() {
  hmError.value = '';
  hmLoading.value = true;
  hmTip.value = null;
  try {
    const { players, segment } = filters.active;
    const qs = new URLSearchParams({
      day: pointsDay.value,
      limit: hmLimit.value,
      topN: sectionTopN.value,
      sort: hmApiSort.value
    });
    if (players?.length) qs.set('players', players.join(','));
    if (segment && segment !== 'all') qs.set('segment', segment);
    qs.set('limits', hmLimit.value);
    hmData.value = await api.pointsHeatmap(qs.toString());
  } catch (e) {
    hmError.value = e.message || String(e);
    hmData.value = null;
  } finally {
    hmLoading.value = false;
  }
}

/**
 * График грузим по тем же никам, что heatmap (один набор).
 * @param {string[]} [names]
 */
async function loadChart(names) {
  error.value = '';
  loading.value = true;
  try {
    const { limits, players, segment } = filters.active;
    const playerList = names?.length ? names : players;
    data.value = await api.points(
      toQuery({
        limits,
        players: playerList,
        segment: names?.length ? 'all' : segment,
        topN: names?.length ? 'all' : sectionTopN.value,
        day: pointsDay.value,
        dateFrom: pointsDay.value,
        dateTo: pointsDay.value
      })
    );
  } catch (e) {
    error.value = e.message;
    data.value = null;
  } finally {
    loading.value = false;
  }
}

async function load() {
  await loadHeatmap();
  const names = (hmData.value?.players || []).map((p) => p.player_name);
  await loadChart(names);
}

watch(() => filters.version, () => {
  regsModalOpen.value = false;
  load();
}, { immediate: true });

/** День графика = день из API или из фильтра */
const dayIso = computed(() => data.value?.day || pointsDay.value);
/** Всегда полные сутки слотов */
const timelineKeys = computed(() => spainDaySlots(dayIso.value, SLOT_MIN));

const categories = computed(() => timelineKeys.value.map((k) => k.slice(11, 16)));

const nowSlot = computed(() => spainNowSlot(SLOT_MIN));

/**
 * Выравнивание на сетку суток ES + пауза:
 * — бакет в ES, floor к шагу 6 мин, max очков;
 * — до первого появления: null;
 * — после и до «сейчас»: forward-fill;
 * — будущее после now: null (ось суток всё равно полная).
 * Точки: { x: минуты от полуночи, y } — ровная ось 0…24 ч.
 */
const series = computed(() => {
  const keys = timelineKeys.value;
  if (!keys.length || !data.value?.series?.length) return [];

  const nowKey = nowSlot.value;
  const day = dayIso.value;

  return data.value.series
    .map((s) => {
      const seriesLimit = s.limit != null ? String(s.limit) : String(filters.active.limits?.[0] || '');
      const byBucket = new Map();
      for (const p of s.points || []) {
        if (seriesLimit && p.limit != null && String(p.limit) !== seriesLimit) continue;
        const spainMin = utcToSpainMinute(p.at);
        if (!spainMin.startsWith(day)) continue;
        const k = floorSpainMinute(spainMin, SLOT_MIN);
        const v = Number(p.points);
        if (!Number.isFinite(v)) continue;
        const prev = byBucket.get(k);
        byBucket.set(k, prev == null ? v : Math.max(prev, v));
      }

      let last = null;
      let started = false;
      const values = keys.map((k, idx) => {
        const x = idx * SLOT_MIN;
        if (k > nowKey) return { x, y: null };

        if (byBucket.has(k)) {
          last = byBucket.get(k);
          started = true;
          return { x, y: last };
        }
        if (started && last != null) return { x, y: last };
        return { x, y: null };
      });

      return { name: s.player_name, data: values };
    })
    .filter((s) => s.data.some((p) => p.y != null))
    .sort((a, b) => {
      const order = sectionPlayerNames.value;
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    });
});

/**
 * Скорость оч/ч в точке idx: (очки_сейчас − очки_~30мин_назад) / мин × 60.
 * Окно ищем в диапазоне 15–60 мин (шаг слота 6 мин).
 */
function speedAtIndex(values, idx) {
  const now = values[idx]?.y;
  if (now == null || !Number.isFinite(now)) return null;

  const prefer = Math.round(SPEED_WINDOW_MIN / SLOT_MIN);
  const minBack = Math.max(1, Math.round(15 / SLOT_MIN));
  const maxBack = Math.round(60 / SLOT_MIN);

  const tryDelta = (d) => {
    if (d < minBack || d > maxBack) return null;
    const j = idx - d;
    if (j < 0) return null;
    const prev = values[j]?.y;
    if (prev == null || !Number.isFinite(prev)) return null;
    const mins = d * SLOT_MIN;
    return Math.round(((now - prev) / mins) * 60 * 10) / 10;
  };

  const preferred = tryDelta(prefer);
  if (preferred != null) return preferred;

  for (let d = prefer + 1; d <= maxBack; d++) {
    const s = tryDelta(d);
    if (s != null) return s;
  }
  for (let d = prefer - 1; d >= minBack; d--) {
    const s = tryDelta(d);
    if (s != null) return s;
  }
  return null;
}

function formatDayMinute(mins) {
  const m = Math.max(0, Math.min(24 * 60, Math.round(Number(mins) || 0)));
  if (m >= 24 * 60) return '24:00';
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

const chartKey = computed(
  () => `${dayIso.value}|${categories.value.length}|${series.value.map((s) => s.name).join(',')}|${nowSlot.value}|${sectionSort.value}|${sectionTopN.value}`
);

const chartLegend = computed(() =>
  series.value.map((s, i) => ({
    name: s.name,
    color: palette[i % palette.length]
  }))
);

const chartOptions = computed(() => {
  const seriesSnapshot = series.value.map((s) => ({
    name: s.name,
    data: (s.data || []).map((p) => ({ x: p.x, y: p.y }))
  }));
  const sortMode = tooltipSort.value;
  const colors = palette;

  let dataMax = 0;
  for (const s of seriesSnapshot) {
    for (const p of s.data || []) {
      const y = p?.y;
      if (y != null && Number.isFinite(y) && y > dataMax) dataMax = y;
    }
  }
  // Шкала Y: по умолчанию 0…600.
  // Если max > 500 — верх ровный (×100), с запасом >100 очков над графиком.
  // Пример: 501 → 700, 600 → 800.
  const yMax = dataMax > 500
    ? Math.max(600, Math.ceil((dataMax + 101) / 100) * 100)
    : 600;

  /** Вертикальные линии: каждый час полутона, каждые 6 ч — жирнее */
  const xHourLines = [];
  for (let h = 0; h <= 24; h++) {
    const major = h % 6 === 0;
    xHourLines.push({
      x: h * 60,
      borderColor: major ? 'rgba(186, 198, 220, 0.48)' : 'rgba(148, 163, 184, 0.20)',
      borderWidth: major ? 2 : 1,
      strokeDashArray: 0,
      opacity: 1,
      label: { show: false }
    });
  }

  return {
    colors,
    chart: { animations: { enabled: false } },
    stroke: { curve: 'straight', width: 2 },
    markers: { size: 0, hover: { size: 5 } },
    legend: {
      show: true,
      position: 'bottom',
      horizontalAlign: 'left',
      fontSize: '11px',
      fontWeight: 500,
      labels: { colors: '#c5cad3' },
      markers: { width: 8, height: 8, radius: 8 },
      itemMargin: { horizontal: 10, vertical: 4 },
      onItemClick: { toggleDataSeries: true },
      onItemHover: { highlightDataSeries: true }
    },
    grid: {
      borderColor: '#243044',
      strokeDashArray: 3,
      padding: {
        // Подписи Y рисуются слева; сам plot = зона клеток heatmap
        left: 4,
        right: 6,
        top: 8,
        bottom: 0
      },
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } }
    },
    annotations: {
      xaxis: xHourLines
    },
    tooltip: {
      shared: true,
      intersect: false,
      custom({ dataPointIndex, w }) {
        const idx = dataPointIndex;
        const xVal = w.config.series?.[0]?.data?.[idx]?.x;
        const cat = formatDayMinute(xVal != null ? xVal : idx * SLOT_MIN);
        const rows = [];
        for (let i = 0; i < seriesSnapshot.length; i++) {
          const pts = seriesSnapshot[i].data[idx]?.y;
          if (pts == null || !Number.isFinite(pts)) continue;
          const spd = speedAtIndex(seriesSnapshot[i].data, idx);
          rows.push({
            name: seriesSnapshot[i].name,
            color: w.globals.colors[i] || colors[i % colors.length],
            pts,
            spd: spd == null ? null : spd
          });
        }
        rows.sort((a, b) => {
          if (sortMode === 'speed') {
            const as = a.spd == null ? -Infinity : a.spd;
            const bs = b.spd == null ? -Infinity : b.spd;
            if (bs !== as) return bs - as;
          }
          return b.pts - a.pts;
        });

        const body = rows.map((r) => {
          const spdTxt = r.spd == null ? '—' : `${r.spd} оч/ч`;
          return `<div class="ptt-row">
            <span class="ptt-name"><i style="background:${r.color}"></i>${escapeHtml(r.name)}</span>
            <span class="ptt-pts">${r.pts}</span>
            <span class="ptt-spd">${spdTxt}</span>
          </div>`;
        }).join('');

        const sortHint = sortMode === 'speed' ? 'по скорости' : 'по очкам';
        return `<div class="ptt">
          <div class="ptt-head">${escapeHtml(String(cat))} · ${sortHint}</div>
          <div class="ptt-cols"><span></span><span>очки</span><span>скор.</span></div>
          ${body || '<div class="ptt-empty">нет данных</div>'}
        </div>`;
      }
    },
    xaxis: {
      type: 'numeric',
      min: 0,
      max: 24 * 60,
      tickAmount: 24,
      decimalsInFloat: 0,
      title: { text: undefined },
      labels: {
        rotate: 0,
        hideOverlappingLabels: true,
        style: { colors: '#8b95a8', fontSize: '10px' },
        formatter: (val) => {
          const h = Math.round(Number(val) / 60);
          if (!Number.isFinite(h) || h < 0 || h > 24) return '';
          // 24:00 — правый край суток; совпадает с правым краем клетки 23
          return String(h);
        }
      },
      tooltip: {
        enabled: false
      }
    },
    yaxis: {
      title: { text: undefined },
      labels: {
        style: { colors: '#8b95a8', fontSize: '10px' },
        // Компактные подписи — основная ширина слева уже в .chart-sync-gutter
        maxWidth: 44
      },
      min: 0,
      max: yMax,
      forceNiceScale: false,
      tickAmount: 5
    }
  };
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function addReg(name) {
  await regs.upsert(name, 'theirs');
  regs.togglePanel(true);
}
</script>

<style scoped>
.points-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px 16px;
  margin: 0 0 10px;
  padding: 10px 14px;
}
.pt-brand h1 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.pt-lead {
  margin: 2px 0 0;
  font-size: 0.78rem;
  line-height: 1.35;
}
.pt-lead .dot { opacity: 0.45; margin: 0 2px; }
.pt-lead strong { color: var(--text); font-weight: 650; }
.pt-regs {
  display: flex;
  justify-content: center;
  align-items: center;
}
.regs-open-btn {
  margin: 0;
  padding: 6px 14px;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--theirs);
  border-color: #9a3412;
  background: rgba(154, 52, 18, 0.16);
}
.regs-open-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}
.pt-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
  min-width: 0;
  justify-self: end;
}
.pt-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  justify-content: flex-end;
}
.pt-lab {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b95a8;
  margin-right: 2px;
}
.pt-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}
.pt-btns .ghost.on,
.pt-row .ghost.on {
  border-color: var(--accent);
  color: var(--text);
  background: #152238;
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
  letter-spacing: -0.01em;
}
.block-note {
  margin: 2px 0 0;
  font-size: 0.76rem;
  line-height: 1.35;
}
.block-note .sep { opacity: 0.45; margin: 0 2px; }
.empty-msg { margin: 16px 0; text-align: center; font-size: 0.85rem; }
.code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.9em;
}
.compact {
  padding: 4px 10px;
  font-size: 0.8rem;
}

.regs-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.regs-modal {
  width: min(560px, 100%);
  max-height: min(70vh, 560px);
  overflow: auto;
  background: #121826;
  border: 1px solid #2a364a;
  border-radius: 14px;
  padding: 14px 16px 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
}
.regs-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.regs-modal-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip-btn {
  padding: 4px 9px;
  font-size: 0.8rem;
  border-radius: 8px;
}

.phm-scroll {
  overflow: auto;
  max-height: min(70vh, 640px);
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #0c111a;
}
/* Общая сетка времени с графиком: колонка ников + 24 равные клетки на всю ширину */
.points-page {
  --phm-name-w: 128px;
  --phm-sum-w: 52px;
  --phm-pad: 8px;
  --phm-gap: 2px;
  max-width: none;
}
.phm-grid {
  display: grid;
  grid-template-columns: var(--phm-name-w) var(--phm-sum-w) repeat(24, minmax(0, 1fr));
  gap: var(--phm-gap);
  width: 100%;
  box-sizing: border-box;
  padding: var(--phm-pad);
  align-items: center;
}
.phm-corner {
  font-size: 0.7rem;
  color: var(--muted);
  position: sticky;
  left: 0;
  background: #0c111a;
  z-index: 2;
  padding: 2px 4px;
}
.phm-sum-h {
  font-size: 0.72rem;
  font-weight: 800;
  color: #7dd3fc;
  text-align: right;
  padding-right: 4px;
  position: sticky;
  left: var(--phm-name-w);
  background: #0c111a;
  z-index: 2;
  letter-spacing: 0.03em;
}
.phm-h {
  font-size: 0.62rem;
  color: var(--muted);
  text-align: left;
  padding-left: 1px;
  line-height: 1;
}
.phm-name {
  display: flex;
  align-items: center;
  font-size: 0.72rem;
  padding: 2px 4px;
  position: sticky;
  left: 0;
  background: #0c111a;
  z-index: 1;
  max-width: var(--phm-name-w);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.phm-name a {
  color: var(--text);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
}
.phm-name a:hover { color: #7dd3fc; }
.phm-sum {
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  padding: 3px 5px;
  position: sticky;
  left: var(--phm-name-w);
  background: #0c111a;
  z-index: 1;
  line-height: 1.1;
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgba(56, 140, 220, 0.28);
  min-width: 0;
}
.phm-cell {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: 28px;
  border: 0;
  padding: 0;
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

/* График: левый gutter = колонка ников heatmap (ссылки на профиль),
   plot по ширине = зона клеток; легенда Apex — внизу графика (toggle серий) */
.chart-sync {
  display: grid;
  grid-template-columns: calc(var(--phm-name-w) + var(--phm-sum-w) + var(--phm-pad)) minmax(0, 1fr);
  column-gap: var(--phm-gap);
  padding-right: var(--phm-pad);
  align-items: stretch;
}
.chart-sync-gutter {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-height: 500px;
  padding: 4px 4px 8px 0;
  overflow: hidden;
}
.chart-leg-head {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 4px 2px;
  flex-shrink: 0;
}
.chart-leg-hint {
  font-size: 0.62rem;
  padding: 0 4px 6px;
  flex-shrink: 0;
  line-height: 1.2;
}
.chart-leg {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
}
.chart-leg-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 1px 2px;
}
.chart-leg-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.chart-leg-name {
  font-size: 0.7rem;
  color: var(--text);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.chart-leg-name:hover { color: #7dd3fc; }
.chart-sync-plot {
  min-width: 0;
  /* Подписи оси Y заезжают в gutter; plot совпадает с клетками heatmap */
  margin-left: -42px;
  width: calc(100% + 42px);
}
.phm-cell.is-zero {
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(80, 88, 102, 0.28);
}
.phm-cell.is-down {
  box-shadow: inset 0 0 0 1px rgba(176, 64, 64, 0.55);
}
.phm-cell:hover, .phm-cell:focus {
  outline: 1px solid #e8ecf1;
  outline-offset: 0;
  z-index: 2;
}
.phm-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 0.75rem;
  flex-wrap: wrap;
}
.phm-legend .sep { opacity: 0.5; }
.phm-sw {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.phm-sw.is-down-sw {
  background: rgba(176, 52, 52, 0.18);
  box-shadow: inset 0 0 0 1px rgba(176, 64, 64, 0.55);
}
.down-banner {
  margin: 6px 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(220, 38, 38, 0.15);
  border: 1px solid #e04545;
  color: #fca5a5;
  font-size: 0.82rem;
}

@media (max-width: 820px) {
  .points-toolbar {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .pt-regs { justify-content: flex-start; }
  .pt-controls { align-items: flex-start; width: 100%; justify-self: stretch; }
  .pt-row { justify-content: flex-start; }
}
</style>

<!-- Стили кастомного tooltip Apex (вне scoped host) -->
<style>
.ptt {
  min-width: 220px;
  max-width: 320px;
  max-height: 360px;
  overflow: auto;
  padding: 8px 10px;
  background: #121826;
  border: 1px solid #3b4f7a;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
  font-size: 12px;
  color: #e8ecf4;
}
.ptt-head {
  font-weight: 650;
  margin-bottom: 6px;
  color: #a8b3c7;
}
.ptt-cols,
.ptt-row {
  display: grid;
  grid-template-columns: 1fr 44px 64px;
  gap: 8px;
  align-items: center;
}
.ptt-cols {
  font-size: 10px;
  color: #8b95a8;
  margin-bottom: 4px;
  text-align: right;
}
.ptt-cols span:first-child { text-align: left; }
.ptt-row { padding: 2px 0; }
.ptt-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ptt-name i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ptt-pts,
.ptt-spd {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ptt-spd { color: #fbbf24; font-size: 11px; }
.ptt-empty { color: #8b95a8; }
</style>
