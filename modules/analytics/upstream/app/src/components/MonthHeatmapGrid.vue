<template>
  <div class="card grid-card" :class="{ 'is-fluid': isFluid, 'is-player': !isDensity }">
    <h3 v-if="title" class="section-title">{{ title }}</h3>
    <p v-if="note" class="muted section-note">{{ note }}</p>

    <div v-if="data" class="hm-scroll">
      <!--
        Плоская CSS-grid (как Points phm-grid): день | Σ | 24 часа.
        Без обёртки .hm-cells + grid-column:span — после переноса Σ влево
        span ломал auto-placement и заполнялась только 1-я строка.
      -->
      <div class="hm" :style="{ '--cols': 24 }">
        <div class="hm-corner" />
        <div
          class="hm-sumlab"
          :title="isDensity ? 'Сумма прироста за день' : 'Итог очков за день'"
        >Σ</div>
        <span v-for="h in 24" :key="'h'+h" class="hm-h">{{ h - 1 }}</span>
        <template v-for="row in data.days" :key="row.day">
          <div class="hm-daylab">
            <span class="dom">{{ String(row.dom).padStart(2, '0') }}</span>
            <span class="wd">{{ row.weekdayLabel }}</span>
          </div>
          <div
            class="hm-daymax"
            :style="!isDensity ? daySumStyle(row.dayMax) : null"
            :title="row.dayMax != null
              ? (isDensity ? `Сумма прироста за ${row.day}` : `Итог очков за ${row.day}`)
              : 'нет данных'"
          >
            {{ row.dayMax != null ? row.dayMax : '—' }}
          </div>
          <button
            v-for="cell in row.hours"
            :key="row.day + '-' + cell.hour"
            type="button"
            class="hm-cell"
            :class="hmCellClass(cell)"
            :style="hmCellInlineStyle(cell)"
            @mouseenter="tipShow($event, row, cell, false)"
            @mouseleave="tipHide()"
            @click="onCellClick($event, row, cell)"
          >
            <HeatmapCellLabel
              v-if="!isDensity"
              :cell="cell"
              :bright-max="carryScale"
              :delta-style="cellValStyle(cell.diff_points)"
            />
            <span
              v-else-if="showCellVal(cell)"
              class="hm-val"
              :style="cellValStyle(cell.diff_points)"
            >+{{ cell.diff_points }}</span>
          </button>
        </template>
      </div>
    </div>

    <div v-if="data" class="legend muted">
      <template v-if="!isDensity">
        <span>carry: серый→белый · (+Δ) цвет ячейки · Σ синяя тепловая</span>
        <span class="sep">·</span>
      </template>
      <span>0</span>
      <i class="sw lv-0" /><i class="sw lv-1" /><i class="sw lv-2" /><i class="sw lv-3" /><i class="sw lv-4" />
      <span>max {{ scaleMax }}{{ isDensity ? ' (сумма)' : '' }}</span>
      <span class="sep">·</span>
      <i class="sw is-down-sw" />
      <span>простой</span>
      <span v-if="isDensity && data.playerCount != null" class="sep">·</span>
      <span v-if="isDensity && data.playerCount != null">{{ data.playerCount }} игр.</span>
    </div>

    <HeatmapFloatTip
      :tip="floatTip"
      @keep="tipKeep"
      @close="tipClose"
    >
      <template #default="{ tip }">
        <div class="tip-head">
          <div class="tip-title">{{ tip.row.day }}</div>
          <div
            v-if="!isDensity && !tip.cell.serverDown && tip.cell.max_points_carry != null"
            class="tip-hero"
          >
            <span class="tip-hero-pts">{{ tip.cell.max_points_carry }}</span>
            <span
              v-if="tip.cell.diff_points != null"
              class="tip-hero-delta"
            >{{ tip.cell.diff_points > 0 ? '+' : '' }}{{ tip.cell.diff_points }}</span>
          </div>
          <div
            v-else-if="isDensity && !tip.cell.serverDown && tip.cell.diff_points != null"
            class="tip-hero"
          >
            <span class="tip-hero-delta">+{{ tip.cell.diff_points }}</span>
          </div>
          <div class="tip-sub">
            час {{ String(tip.cell.hour).padStart(2, '0') }}:00 · {{ tip.row.weekdayLabel }}
          </div>
        </div>
        <p v-if="tip.cell.serverDown" class="down-banner">Сервер не собирал данные в этот час</p>
        <div
          v-else-if="!isDensity && tip.cell.max_points_carry == null && (tip.cell.empty || tip.cell.diff_points == null)"
          class="tip-empty"
        >
          Нет данных в агрегате
        </div>
        <div
          v-else-if="isDensity && (tip.cell.empty || tip.cell.diff_points == null)"
          class="tip-empty"
        >
          Нет данных в агрегате
        </div>
        <div v-else class="tip-rows">
          <template v-if="isDensity">
            <div v-if="tip.cell.players_n != null" class="tip-row">
              <span class="tip-label">Игроков</span>
              <span class="tip-value">{{ tip.cell.players_n }}</span>
            </div>
            <p class="tip-hint muted">Клик — разбор ячейки</p>
            <div v-if="tip.cell.speed != null" class="tip-row">
              <span class="tip-label">Ср. скор.</span>
              <span class="tip-value">{{ formatSpeed(tip.cell.speed) }} оч/ч внутри часа</span>
            </div>
          </template>
          <template v-else>
            <div v-if="tip.cell.speed != null" class="tip-row">
              <span class="tip-label">Скорость</span>
              <span class="tip-value">{{ formatSpeed(tip.cell.speed) }} оч/ч внутри часа</span>
            </div>
            <div class="tip-row">
              <span class="tip-label">Внутри часа</span>
              <span class="tip-value">
                {{ tip.cell.min_points_hour }} → {{ tip.cell.max_points_hour }}
                <span v-if="tip.cell.diff_within_hour != null" class="dim">
                  (+{{ tip.cell.diff_within_hour }})
                </span>
                <span v-if="tip.cell.diff_seconds != null" class="dim">
                  · {{ tip.cell.diff_seconds }} с
                </span>
              </span>
            </div>
            <div class="tip-row">
              <span class="tip-label">Min</span>
              <span class="tip-value">
                {{ tip.cell.min_points_hour }}
                <span class="dim"> @ {{ tip.cell.min_at || '—' }}</span>
              </span>
            </div>
            <div class="tip-row">
              <span class="tip-label">Max</span>
              <span class="tip-value">
                {{ tip.cell.max_points_hour }}
                <span class="dim"> @ {{ tip.cell.max_at || '—' }}</span>
              </span>
            </div>
            <div class="tip-row">
              <span class="tip-label">Snapshot</span>
              <span class="tip-value">{{ tip.cell.has_snapshot ? 'да' : 'нет' }}</span>
            </div>
          </template>
        </div>
      </template>
    </HeatmapFloatTip>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import HeatmapCellLabel from './HeatmapCellLabel.vue';
import HeatmapFloatTip from './HeatmapFloatTip.vue';
import { maxCarryScale, daySumBlueHeatStyle, deltaCellTextStyle } from '../utils/heatmapTextStyle.js';

const props = defineProps({
  data: { type: Object, default: null },
  title: { type: String, default: '' },
  note: { type: String, default: '' },
  /** player | density — влияет на подписи и tip */
  mode: { type: String, default: 'player' },
  /** Растянуть на 100% ширины контейнера (равные часовые колонки). */
  fluid: { type: Boolean, default: false }
});

const emit = defineEmits(['cellSelect']);

const floatTip = ref(null);
let tipHideTimer = null;

const isDensity = computed(
  () => props.mode === 'density' || props.data?.mode === 'density' || props.data?.metric === 'sum_diff_points'
);

const isFluid = computed(() => props.fluid || isDensity.value);

const scaleMax = computed(() => Math.max(0, Number(props.data?.maxDiff) || 0));
const carryScale = computed(() => maxCarryScale(props.data?.days || []));

function daySumStyle(dayMax) {
  return daySumBlueHeatStyle(dayMax, carryScale.value);
}

watch(
  () => props.data,
  () => {
    tipClose();
  }
);

function showCellVal(cell) {
  if (!cell || cell.serverDown) return false;
  return cell.diff_points != null && !cell.empty;
}

function hmCellClass(cell) {
  if (cell?.serverDown) return { 'is-down': true };
  if (!cell || cell.empty || cell.diff_points == null) return { 'is-empty': true };
  const v = Number(cell.diff_points) || 0;
  if (v <= 0) return { 'is-zero': true };
  return { ['lv-' + levelOf(cell)]: true, 'has-val': true };
}

function hmCellInlineStyle(cell) {
  if (cell?.serverDown) {
    return { background: 'rgba(176, 52, 52, 0.14)' };
  }
  if (!cell || cell.empty || cell.diff_points == null || Number(cell.diff_points) <= 0) {
    return { background: 'transparent' };
  }
  return {};
}

function levelOf(cell) {
  if (!cell || cell.empty || cell.diff_points == null || cell.serverDown) return 0;
  const v = Number(cell.diff_points) || 0;
  if (v <= 0) return 0;
  const max = Math.max(1, scaleMax.value || 1);
  const r = v / max;
  if (r < 0.2) return 1;
  if (r < 0.4) return 2;
  if (r < 0.7) return 3;
  return 4;
}

function tipAnchor(ev) {
  const r = ev.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top, yBottom: r.bottom };
}

function tipShow(ev, row, cell, pinned) {
  if (tipHideTimer) {
    clearTimeout(tipHideTimer);
    tipHideTimer = null;
  }
  const pos = tipAnchor(ev);
  floatTip.value = {
    ...pos,
    pinned: !!pinned,
    row,
    cell
  };
}

function onCellClick(ev, row, cell) {
  if (isDensity.value) {
    tipClose();
    emit('cellSelect', {
      scope: 'day',
      day: row.day,
      month: props.data?.month || null,
      hour: cell.hour,
      weekdayLabel: row.weekdayLabel,
      cell
    });
    return;
  }
  tipShow(ev, row, cell, true);
}

function tipHide() {
  if (floatTip.value?.pinned) return;
  if (tipHideTimer) clearTimeout(tipHideTimer);
  tipHideTimer = setTimeout(() => {
    if (!floatTip.value?.pinned) floatTip.value = null;
  }, 120);
}

function tipKeep() {
  if (tipHideTimer) {
    clearTimeout(tipHideTimer);
    tipHideTimer = null;
  }
}

function tipClose() {
  if (tipHideTimer) {
    clearTimeout(tipHideTimer);
    tipHideTimer = null;
  }
  floatTip.value = null;
}

/** Цвет (+Δ): как на Points — ярче и с обводкой. */
function cellValStyle(diff) {
  return deltaCellTextStyle(diff, scaleMax.value || 80);
}

function formatSpeed(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  return n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
}
</script>

<style scoped>
.grid-card { padding: 10px 12px; }
.grid-card.is-fluid { padding: 8px 12px 10px; }
.section-title { margin: 0 0 2px; font-size: 0.88rem; font-weight: 650; }
.section-note { margin: 0 0 6px; font-size: 0.72rem; line-height: 1.3; }
.hm-scroll { overflow: auto; margin-top: 4px; }
.hm {
  display: grid;
  grid-template-columns: 52px 56px repeat(24, 20px);
  gap: 2px;
  width: max-content;
  align-items: center;
}
.grid-card.is-fluid .hm {
  width: 100%;
  box-sizing: border-box;
  grid-template-columns: 52px 56px repeat(24, minmax(0, 1fr));
}
.hm-corner { height: 18px; }
.hm-sumlab {
  font-size: 0.72rem;
  font-weight: 800;
  text-align: right;
  padding-right: 4px;
  line-height: 18px;
  color: #7dd3fc;
  letter-spacing: 0.03em;
}
.hm-daymax {
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  padding: 3px 5px;
  min-width: 0;
  line-height: 1.15;
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgba(56, 140, 220, 0.28);
  color: var(--text);
}
.hm-h {
  font-size: 0.62rem;
  color: var(--muted);
  text-align: left;
  padding-left: 1px;
  line-height: 18px;
}
.hm-daylab {
  display: flex;
  gap: 4px;
  align-items: baseline;
  font-size: 0.72rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.hm-daylab .dom { color: var(--text); font-weight: 600; }
.hm-cell {
  width: 20px;
  height: 20px;
  border: 0;
  padding: 0;
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  box-sizing: border-box;
}
.grid-card.is-fluid .hm-cell {
  width: 100%;
  height: 18px;
  max-height: 18px;
  aspect-ratio: auto;
}
/* Профиль / player: как Points — квадратнее, запас под carry+(+Δ) */
.grid-card.is-fluid.is-player .hm-cell {
  height: auto;
  min-height: 24px;
  max-height: 28px;
  aspect-ratio: 1 / 1;
  padding: 1px 0;
  box-sizing: border-box;
}
.grid-card.is-fluid.is-player .hm-corner,
.grid-card.is-fluid.is-player .hm-h,
.grid-card.is-fluid.is-player .hm-sumlab {
  line-height: 20px;
  min-height: 20px;
}
.hm-cell.is-empty {
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}
.hm-cell.is-zero {
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(80, 88, 102, 0.28);
}
.hm-val {
  font-size: 0.5rem;
  line-height: 1;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  letter-spacing: -0.03em;
}
.hm-cell.lv-1 { background: #1a4d36; }
.hm-cell.lv-2 { background: #217a52; }
.hm-cell.lv-3 { background: #2f9e6c; }
.hm-cell.lv-4 { background: #3ecf8e; }
.hm-cell.is-down {
  box-shadow: inset 0 0 0 1px rgba(176, 64, 64, 0.55);
  background-image: none;
  background: rgba(176, 52, 52, 0.14);
}
.hm-cell:hover, .hm-cell:focus {
  outline: 1px solid #e8ecf1;
  outline-offset: 1px;
  z-index: 2;
}
.legend {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 0.75rem;
  flex-wrap: wrap;
}
.legend .sep { opacity: 0.5; margin: 0 4px; }
.sw {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 2px;
}
.sw.lv-0 { background: #1c2230; }
.sw.lv-1 { background: #1a4d36; }
.sw.lv-2 { background: #217a52; }
.sw.lv-3 { background: #2f9e6c; }
.sw.lv-4 { background: #3ecf8e; }
.sw.is-down-sw {
  background: rgba(176, 52, 52, 0.18);
  box-shadow: inset 0 0 0 1px rgba(176, 64, 64, 0.55);
}
.tip-hint {
  margin: 8px 0 0;
  font-size: 0.72rem;
}
</style>
