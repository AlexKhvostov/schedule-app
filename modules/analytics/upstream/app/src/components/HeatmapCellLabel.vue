<template>
  <span v-if="visible" class="hm-cell-label">
    <span class="hm-cell-carry" :style="carryStyle">{{ carryText }}</span>
    <span v-if="showDelta" class="hm-cell-delta" :style="deltaStyle">{{ deltaText }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { pointsBrightnessStyle } from '../utils/heatmapTextStyle.js';

const props = defineProps({
  cell: { type: Object, default: null },
  /** Опорный max для яркости carry. */
  brightMax: { type: Number, default: 100 },
  /** Стиль (+Δ) — от цвета/силы ячейки (прирост). */
  deltaStyle: { type: Object, default: () => ({}) }
});

const carry = computed(() => {
  const c = props.cell?.max_points_carry;
  if (c == null || c === '') return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
});

const delta = computed(() => {
  const d = props.cell?.diff_points;
  if (d == null || d === '') return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
});

const visible = computed(() => {
  const cell = props.cell;
  if (!cell || cell.serverDown) return false;
  if (carry.value != null) return true;
  if (cell.empty) return false;
  return delta.value != null;
});

const carryText = computed(() => {
  if (carry.value != null) return String(carry.value);
  return delta.value != null ? String(Math.max(0, delta.value)) : '';
});

const showDelta = computed(() => delta.value != null && carry.value != null);
const deltaText = computed(() => {
  const v = delta.value;
  if (v == null) return '';
  return v > 0 ? `+${v}` : String(v);
});

/** Яркость только у carry. */
const carryStyle = computed(() => {
  const pts = carry.value != null ? carry.value : Math.max(0, delta.value || 0);
  return pointsBrightnessStyle(pts, props.brightMax);
});
</script>

<style scoped>
.hm-cell-label {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.05;
  pointer-events: none;
  max-width: 100%;
  padding: 0 1px;
  box-sizing: border-box;
}
.hm-cell-carry {
  font-size: 0.58rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  -webkit-font-smoothing: antialiased;
  max-width: 100%;
  overflow: hidden;
}
.hm-cell-delta {
  font-size: 0.48rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  margin-top: 1px;
  max-width: 100%;
  overflow: hidden;
}
</style>
