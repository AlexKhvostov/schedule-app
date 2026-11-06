<template>
  <section class="page heatmap-page">
    <header class="page-head density-head">
      <div>
        <h1>Плотность</h1>
        <p class="lead">
          Сумма прироста очков за месяц · день × час · {{ monthLabel }} · {{ limit }}€
          <span class="dot">·</span>
          клик — разбор · внизу Σ по часам
        </p>
      </div>
      <div v-if="data" class="density-meta muted">
        игроков: {{ data.playerCount ?? '—' }}
        <span class="sep">·</span>
        max ячейки: {{ data.maxDiff ?? 0 }}
      </div>
    </header>

    <LoadingBox v-if="loading" text="Грузим плотность…" />
    <p v-if="error" class="bad">{{ error }}</p>

    <MonthHeatmapGrid
      v-if="!loading && data"
      :data="data"
      mode="density"
      :title="gridTitle"
      :note="gridNote"
      @cell-select="openCellModal"
    />

    <div v-if="!loading && hourBars.length" class="card dens-hour-card">
      <div class="dens-hour-head">
        <h3 class="section-title">Σ по часам</h3>
        <p class="muted section-note">
          сумма дней · клик — разбор
          <span v-if="data?.hourMaxDiff != null"> · max {{ data.hourMaxDiff }}</span>
        </p>
      </div>

      <div class="dens-hour-grid" role="img" :aria-label="'Плотность по часам за ' + monthLabel">
        <div class="dens-hour-ylab dens-hour-ylab--spacer" aria-hidden="true" />
        <div
          class="dens-hour-total"
          :title="data.byHourTotal != null ? `Сумма за месяц: ${data.byHourTotal}` : 'Сумма прироста за месяц'"
        >
          {{ data.byHourTotal != null ? data.byHourTotal : '—' }}
        </div>
        <button
          v-for="cell in hourBars"
          :key="'hb-' + cell.hour"
          type="button"
          class="dens-hour-col"
          :class="{ 'is-empty': !cell.value }"
          :title="hourBarTitle(cell)"
          @click="openHourBar(cell)"
        >
          <span v-if="cell.value" class="dens-hour-val">+{{ cell.value }}</span>
          <span
            class="dens-hour-bar"
            :style="{ height: cell.pct + '%' }"
          />
        </button>

        <div class="dens-hour-ylab dens-hour-ylab--axis" />
        <div
          class="dens-hour-total dens-hour-total--axis"
          title="Сумма прироста за день"
        >Σ</div>
        <span
          v-for="h in 24"
          :key="'hl-' + h"
          class="dens-hour-h"
        >{{ h - 1 }}</span>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="modalOpen"
        class="cell-modal-backdrop"
        role="presentation"
        @click.self="closeCellModal"
      >
        <div class="cell-modal" role="dialog" aria-label="Разбор ячейки">
          <header class="cell-modal-head">
            <div>
              <h3 class="cell-modal-title">
                {{ modalTitle }}
              </h3>
              <p class="cell-modal-sub muted">
                {{ limit }}€ · сумма
                <strong v-if="cellData">+{{ cellData.sum_diff }}</strong>
                <span v-if="cellData"> · {{ cellData.total }} игр.</span>
                <span v-if="modalSubExtra"> · {{ modalSubExtra }}</span>
              </p>
            </div>
            <button type="button" class="ghost compact" @click="closeCellModal">Закрыть</button>
          </header>

          <p v-if="cellLoading" class="muted">Грузим игроков…</p>
          <p v-if="cellError" class="bad">{{ cellError }}</p>

          <template v-if="!cellLoading && cellData">
            <ol class="cell-list">
              <li
                v-for="(p, i) in visiblePlayers"
                :key="p.player_name"
                class="cell-row"
              >
                <span class="cell-rank muted">{{ i + 1 }}</span>
                <RouterLink
                  class="cell-name"
                  :to="`/player/${encodeURIComponent(p.player_name)}`"
                >{{ p.player_name }}</RouterLink>
                <span class="cell-diff" title="Междучасовой прирост">+{{ p.diff_points }}</span>
                <span class="cell-speed muted" title="Скорость внутри часа">
                  {{ p.speed != null ? Math.round(p.speed * 10) / 10 : '—' }}
                </span>
              </li>
            </ol>

            <div v-if="hiddenCount > 0" class="cell-more">
              <button
                v-if="!expanded"
                type="button"
                class="ghost compact"
                @click="expanded = true"
              >
                ещё +{{ hiddenCount }}
              </button>
              <button
                v-else
                type="button"
                class="ghost compact"
                @click="expanded = false"
              >
                свернуть
              </button>
            </div>

            <p v-if="!cellData.players?.length" class="muted empty">В ячейке нет строк агрегата.</p>
          </template>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import LoadingBox from '../components/LoadingBox.vue';
import MonthHeatmapGrid from '../components/MonthHeatmapGrid.vue';
import { api } from '../api';
import { useFiltersStore } from '../stores/filters';

const PREVIEW = 10;

const filters = useFiltersStore();
const data = ref(null);
const loading = ref(false);
const error = ref('');

const modalOpen = ref(false);
const modalMeta = ref({ scope: 'day', day: '', month: '', hour: 0, weekdayLabel: '' });
const cellData = ref(null);
const cellLoading = ref(false);
const cellError = ref('');
const expanded = ref(false);

const limit = computed(() => String(filters.active.limits?.[0] || '100'));
const month = computed(() => {
  const m = filters.active.month || (filters.active.dateTo || '').slice(0, 7);
  return m || '';
});

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

const gridTitle = computed(() => `${monthLabel.value} · ${limit.value}€ · ${audienceLabel.value}`);
const gridNote = computed(() => {
  const max = data.value?.maxDiff ?? 0;
  return `Цвет нормирован на max ячейки (${max}). Клик по ячейке — кто сколько набрал.`;
});

const hourBars = computed(() => {
  const hours = data.value?.byHour;
  if (!Array.isArray(hours) || hours.length !== 24) return [];
  const max = Math.max(1, Number(data.value?.hourMaxDiff) || 0, ...hours.map((c) => Number(c.diff_points) || 0));
  return hours.map((c) => {
    const value = c.empty || c.diff_points == null ? 0 : Math.max(0, Number(c.diff_points) || 0);
    return {
      hour: c.hour,
      value,
      players_n: c.players_n ?? 0,
      pct: value > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0
    };
  });
});

function hourBarTitle(cell) {
  const h = String(cell.hour).padStart(2, '0');
  if (!cell.value) return `${h}:00 · нет данных`;
  const n = cell.players_n ? ` · ${cell.players_n} игр.` : '';
  return `${h}:00 · +${cell.value}${n}`;
}

function openHourBar(cell) {
  if (!cell?.value) return;
  openCellModal({
    scope: 'month',
    day: null,
    month: month.value,
    hour: cell.hour,
    weekdayLabel: 'Σ мес'
  });
}

const modalTitle = computed(() => {
  const h = String(modalMeta.value.hour).padStart(2, '0');
  if (modalMeta.value.scope === 'month') {
    return `Σ мес · ${h}:00`;
  }
  const wd = modalMeta.value.weekdayLabel ? ` · ${modalMeta.value.weekdayLabel}` : '';
  return `${modalMeta.value.day} · ${h}:00${wd}`;
});

const modalSubExtra = computed(() => {
  if (modalMeta.value.scope === 'month') {
    return 'сумма по всем дням месяца в этом часу';
  }
  return '';
});

const visiblePlayers = computed(() => {
  const list = cellData.value?.players || [];
  if (expanded.value) return list;
  return list.slice(0, PREVIEW);
});

const hiddenCount = computed(() => {
  const total = cellData.value?.total ?? (cellData.value?.players || []).length;
  return Math.max(0, total - PREVIEW);
});

async function load() {
  if (!month.value || !limit.value) {
    data.value = null;
    error.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const a = filters.active;
    const qs = new URLSearchParams({
      mode: 'density',
      limit: limit.value,
      month: month.value,
      segment: a.segment || 'all'
    });
    if (a.players?.length) qs.set('players', a.players.join(','));
    data.value = await api.heatmap(qs.toString());
  } catch (e) {
    error.value = e.message || String(e);
    data.value = null;
  } finally {
    loading.value = false;
  }
}

async function openCellModal({ day, hour, weekdayLabel, scope, month: monthFromCell }) {
  const isMonth = scope === 'month';
  modalMeta.value = {
    scope: isMonth ? 'month' : 'day',
    day: isMonth ? '' : day,
    month: isMonth ? (monthFromCell || month.value) : (day || '').slice(0, 7),
    hour,
    weekdayLabel: weekdayLabel || ''
  };
  modalOpen.value = true;
  expanded.value = false;
  cellData.value = null;
  cellError.value = '';
  cellLoading.value = true;
  try {
    const a = filters.active;
    const qs = new URLSearchParams({
      hour: String(hour),
      limit: limit.value,
      segment: a.segment || 'all'
    });
    if (isMonth) {
      qs.set('month', monthFromCell || month.value);
    } else {
      qs.set('day', day);
    }
    if (a.players?.length) qs.set('players', a.players.join(','));
    cellData.value = await api.heatmapCell(qs.toString());
  } catch (e) {
    cellError.value = e.message || String(e);
  } finally {
    cellLoading.value = false;
  }
}

function closeCellModal() {
  modalOpen.value = false;
  cellData.value = null;
  cellError.value = '';
  expanded.value = false;
}

watch(
  () => [filters.version, month.value, limit.value],
  () => {
    closeCellModal();
    load();
  },
  { immediate: true }
);
</script>

<style scoped>
.heatmap-page { max-width: none; width: 100%; }
.density-head {
  margin-bottom: 6px;
  align-items: flex-end;
}
.density-head h1 {
  font-size: 1.05rem;
  margin: 0;
}
.density-head .lead {
  margin: 1px 0 0;
  font-size: 0.74rem;
  line-height: 1.3;
  max-width: none;
}
.density-head .dot { opacity: 0.45; margin: 0 2px; }
.density-meta {
  font-size: 0.78rem;
  white-space: nowrap;
}
.density-meta .sep { opacity: 0.45; margin: 0 4px; }

.dens-hour-card {
  margin-top: 8px;
  padding: 8px 12px 10px;
}
.dens-hour-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  margin-bottom: 4px;
}
.dens-hour-card .section-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 650;
}
.dens-hour-card .section-note {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.25;
}
.dens-hour-card .sep { opacity: 0.45; margin: 0 4px; }

/* Та же сетка, что у MonthHeatmapGrid.is-fluid: дата | Σ | часы 0–23 */
.dens-hour-grid {
  display: grid;
  grid-template-columns: 52px 56px repeat(24, minmax(0, 1fr));
  gap: 2px;
  width: 100%;
  align-items: end;
}
.dens-hour-ylab {
  height: 56px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  font-size: 0.68rem;
  font-weight: 650;
  color: #7dd3fc;
  padding-bottom: 1px;
}
.dens-hour-ylab--spacer {
  min-height: 56px;
}
.dens-hour-ylab--axis {
  height: auto;
  min-height: 0;
}
.dens-hour-col {
  height: 56px;
  border: 0;
  padding: 0 1px;
  margin: 0;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 1px;
  position: relative;
  border-radius: 2px;
}
.dens-hour-col:hover,
.dens-hour-col:focus {
  outline: 1px solid #e8ecf1;
  outline-offset: 0;
  background: rgba(125, 211, 252, 0.06);
  z-index: 1;
}
.dens-hour-col.is-empty {
  cursor: default;
}
.dens-hour-col.is-empty:hover,
.dens-hour-col.is-empty:focus {
  outline: none;
  background: transparent;
}
.dens-hour-bar {
  width: 65%;
  max-width: 18px;
  min-height: 0;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(180deg, #5eead4 0%, #0d9488 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.dens-hour-col.is-empty .dens-hour-bar {
  height: 0 !important;
  min-height: 0;
  background: transparent;
  box-shadow: none;
}
.dens-hour-val {
  display: none;
}
.dens-hour-total {
  height: 56px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  font-size: 0.68rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: #7dd3fc;
  padding-bottom: 1px;
  padding-right: 4px;
}
.dens-hour-total--axis {
  height: auto;
  min-height: 14px;
  align-items: flex-start;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  line-height: 14px;
  padding-bottom: 0;
}
.dens-hour-h {
  font-size: 0.58rem;
  color: var(--muted);
  text-align: left;
  padding-left: 1px;
  line-height: 14px;
}

.cell-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 220;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.cell-modal {
  width: min(480px, 100%);
  max-height: min(78vh, 640px);
  overflow: auto;
  background: #121826;
  border: 1px solid #2a364a;
  border-radius: 14px;
  padding: 14px 16px 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
}
.cell-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.cell-modal-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
}
.cell-modal-sub {
  margin: 4px 0 0;
  font-size: 0.8rem;
}
.cell-modal-sub strong { color: var(--text); }
.cell-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cell-row {
  display: grid;
  grid-template-columns: 28px 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 5px 4px;
  border-bottom: 1px solid #1e293b;
  font-size: 0.85rem;
}
.cell-rank {
  font-variant-numeric: tabular-nums;
  font-size: 0.75rem;
  text-align: right;
}
.cell-name {
  color: var(--text);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-name:hover { color: #7dd3fc; }
.cell-diff {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #86efac;
}
.cell-speed {
  font-variant-numeric: tabular-nums;
  font-size: 0.75rem;
  min-width: 3.2rem;
  text-align: right;
}
.cell-more {
  margin-top: 10px;
  display: flex;
  justify-content: center;
}
.empty { margin: 16px 0; text-align: center; }
.compact {
  padding: 4px 10px;
  font-size: 0.8rem;
}
</style>
