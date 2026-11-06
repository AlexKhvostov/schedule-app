<template>
  <div :class="bare ? 'chart-bare' : 'card chart-card'">
    <header v-if="title || description || legendNotes.length" class="chart-head">
      <div>
        <h3 v-if="title" class="chart-title">{{ title }}</h3>
        <p v-if="description" class="chart-desc">{{ description }}</p>
      </div>
      <ul v-if="legendNotes.length" class="chart-legend">
        <li v-for="(note, i) in legendNotes" :key="i">
          <i class="dot" :style="{ background: note.color || 'var(--accent)' }" />
          <span>{{ note.text }}</span>
        </li>
      </ul>
    </header>
    <div v-show="hasData" ref="host" class="chart-host" :style="{ minHeight: height + 'px' }" />
    <p v-if="!hasData" class="muted empty">Нет данных для графика</p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ApexCharts from 'apexcharts';

const props = defineProps({
  type: { type: String, default: 'line' },
  series: { type: Array, required: true },
  categories: { type: Array, default: () => [] },
  options: { type: Object, default: () => ({}) },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  legendNotes: { type: Array, default: () => [] },
  height: { type: Number, default: 360 },
  /** Зум/пан по оси X (toolbar + выделение + колёсико) */
  zoomable: { type: Boolean, default: false },
  /** Без внешней card-обёртки (когда шапка уже снаружи) */
  bare: { type: Boolean, default: false }
});

const host = ref(null);
let chart = null;

function toPlain(value) {
  if (value == null) return value;
  if (typeof value === 'function') return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => toPlain(v));
  // Снимаем Vue Proxy, сохраняя функции (formatter и т.п.)
  const out = {};
  for (const key of Object.keys(value)) {
    out[key] = toPlain(value[key]);
  }
  return out;
}

const hasData = computed(
  () => Array.isArray(props.series) && props.series.some((s) => (s.data || []).length)
);

function buildOptions() {
  const extra = toPlain(props.options) || {};
  const isDatetime = extra.xaxis?.type === 'datetime';
  const isNumericX = extra.xaxis?.type === 'numeric';
  const series = (toPlain(props.series) || []).map((s) => ({
    name: s.name,
    type: s.type,
    data: (s.data || []).map((v) => {
      if (v == null || v === '') return null;
      if (typeof v === 'object') return v; // {x,y} datetime/numeric
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    })
  }));

  const zoomDefaults = props.zoomable
    ? {
        toolbar: {
          show: true,
          offsetY: -4,
          tools: {
            download: false,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true
          }
        },
        zoom: {
          enabled: true,
          type: 'x',
          autoScaleYaxis: true,
          allowMouseWheelZoom: true
        },
        selection: {
          enabled: true,
          type: 'x'
        }
      }
    : {
        toolbar: { show: false },
        zoom: { enabled: false }
      };

  const options = {
    chart: {
      type: props.type,
      height: props.height,
      width: '100%',
      background: 'transparent',
      fontFamily: 'Segoe UI, Inter, system-ui, sans-serif',
      animations: { enabled: true, speed: 450 },
      ...zoomDefaults,
      ...(extra.chart || {})
    },
    theme: { mode: 'dark' },
    series,
    grid: {
      borderColor: '#243044',
      strokeDashArray: 3,
      ...(extra.grid || {})
    },
    dataLabels: { enabled: false, ...(extra.dataLabels || {}) },
    stroke: {
      show: true,
      curve: 'smooth',
      width: 2,
      ...(extra.stroke || {})
    },
    legend: {
      labels: { colors: '#c5cad3' },
      ...(extra.legend || {})
    },
    xaxis: {
      ...(isDatetime || isNumericX ? {} : { categories: toPlain(props.categories) || [] }),
      labels: { style: { colors: '#8b95a8' } },
      axisBorder: { color: '#243044' },
      axisTicks: { color: '#243044' },
      ...(extra.xaxis || {})
    },
    yaxis: Array.isArray(extra.yaxis)
      ? extra.yaxis
      : {
          labels: { style: { colors: '#8b95a8' } },
          ...(extra.yaxis || {})
        },
    tooltip: { theme: 'dark', ...(extra.tooltip || {}) }
  };

  if (extra.colors) options.colors = extra.colors;
  if (extra.plotOptions) options.plotOptions = extra.plotOptions;
  if (extra.markers) options.markers = extra.markers;
  if (extra.annotations) options.annotations = extra.annotations;

  return options;
}

async function renderChart() {
  await nextTick();
  if (!host.value) await nextTick();
  if (!host.value) {
    console.warn('[AppChart] no host el');
    return;
  }

  if (!hasData.value) {
    if (chart) {
      try { chart.destroy(); } catch {}
      chart = null;
    }
    host.value.innerHTML = '';
    return;
  }

  const ChartCtor = ApexCharts?.default ?? ApexCharts;
  if (typeof ChartCtor !== 'function') {
    host.value.innerHTML = `<p class="muted">ApexCharts не загрузился (${typeof ChartCtor})</p>`;
    console.error('[AppChart] bad ctor', ApexCharts);
    return;
  }

  const options = buildOptions();

  // Всегда полная пересборка — updateOptions у Apex 6 часто даёт пустой/битый canvas
  if (chart) {
    try { chart.destroy(); } catch {}
    chart = null;
  }
  host.value.innerHTML = '';

  try {
    chart = new ChartCtor(host.value, options);
    await chart.render();
  } catch (e) {
    console.error('[AppChart]', e);
    host.value.innerHTML = `<p class="muted">Ошибка графика: ${String(e.message || e)}</p>`;
    chart = null;
  }
}

watch(
  () => [props.series, props.categories, props.options, props.type, props.height, props.zoomable, hasData.value],
  () => {
    renderChart();
  },
  { deep: true }
);

onMounted(() => {
  // v-if родителя: ref готов после mount; небольшой запас для layout
  setTimeout(() => renderChart(), 0);
});

onBeforeUnmount(() => {
  if (chart) {
    try {
      chart.destroy();
    } catch {}
    chart = null;
  }
});
</script>

<style scoped>
.chart-card { min-height: 0; }
.chart-bare { min-height: 0; }
.chart-host { width: 100%; }
.chart-card :deep(.apexcharts-toolbar),
.chart-bare :deep(.apexcharts-toolbar) {
  z-index: 5;
}
.chart-card :deep(.apexcharts-zoom-icon),
.chart-card :deep(.apexcharts-zoomin-icon),
.chart-card :deep(.apexcharts-zoomout-icon),
.chart-card :deep(.apexcharts-pan-icon),
.chart-card :deep(.apexcharts-reset-icon),
.chart-card :deep(.apexcharts-selection-icon),
.chart-bare :deep(.apexcharts-zoom-icon),
.chart-bare :deep(.apexcharts-zoomin-icon),
.chart-bare :deep(.apexcharts-zoomout-icon),
.chart-bare :deep(.apexcharts-pan-icon),
.chart-bare :deep(.apexcharts-reset-icon),
.chart-bare :deep(.apexcharts-selection-icon) {
  filter: invert(0.85);
}
.chart-card.compact { padding-bottom: 10px; }
.chart-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.chart-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
}
.chart-desc {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.84rem;
  line-height: 1.45;
  max-width: 62ch;
}
.chart-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 200px;
}
.chart-legend li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-top: 4px;
  flex-shrink: 0;
}
.empty { padding: 48px 0; text-align: center; }
</style>
