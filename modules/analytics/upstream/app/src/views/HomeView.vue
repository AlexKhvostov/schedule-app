<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>Home — плотность по очкам</h1>
        <p class="lead">
          Насколько плотное поле в этот день
          (<strong>{{ data?.day || filters.active.dateTo }}</strong>, сутки
          {{ data?.timezone || 'Europe/Madrid' }}).
          Четыре чарта — <strong>четыре лимита</strong> (лимиты в фильтре на Home не смешивают серии).
          Столбец часа = прирост Σ max‑очков внутри лимита; пауза не обнуляет max до конца суток ES.
        </p>
      </div>
    </header>

    <LoadingBox v-if="loading" text="Грузим плотность по очкам…" />
    <p v-if="error" class="bad">{{ error }}</p>

    <div v-if="data && !loading" class="kpi-grid">
      <div class="kpi">
        <div class="label">Σ max очков за день</div>
        <div class="value">{{ data.kpis?.dayPointsSum ?? data.kpis?.totalRecords ?? '—' }}</div>
        <div class="hint">Сумма по всем четырём лимитам к концу суток ES</div>
      </div>
      <div class="kpi">
        <div class="label">Уники за день</div>
        <div class="value">{{ data.kpis?.uniquePlayersDay ?? '—' }}</div>
        <div class="hint">Сколько разных ников встретили в сборах</div>
      </div>
      <div class="kpi">
        <div class="label">Пик объёма (час)</div>
        <div class="value">{{ data.kpis?.peakHour != null ? `${data.kpis.peakHour}:00` : '—' }}</div>
        <div class="hint">Час ES с макс. приростом среди лимитов</div>
      </div>
      <div class="kpi">
        <div class="label">Объём в пике</div>
        <div class="value">{{ data.kpis?.peakVolume ?? data.kpis?.peakRecords ?? '—' }}</div>
        <div class="hint">Макс. прирост Σ max за час в одном лимите</div>
      </div>
    </div>

    <div v-if="!loading && charts.length" class="home-charts">
      <AppChart
        v-for="chart in charts"
        :key="chart.limit"
        type="line"
        zoomable
        :title="`Лимит ${chart.limit}€ — объём по часам`"
        description="Столбец = прирост Σ max. Зелёная линия — среднее за ~60 дней. Жёлтая — тот же день недели."
        :categories="chart.categories"
        :series="chart.series"
        :options="chartOptions"
        :legend-notes="legendNotes"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import AppChart from '../components/AppChart.vue';
import LoadingBox from '../components/LoadingBox.vue';
import { api, toQuery } from '../api';
import { useFiltersStore } from '../stores/filters';

const filters = useFiltersStore();
const data = ref(null);
const error = ref('');
const loading = ref(false);

const legendNotes = [
  { color: '#3b82f6', text: 'Синие столбцы — объём очков за час (прирост Σ max)' },
  { color: '#34d399', text: 'Зелёная линия — средний объём этого часа за ~60 дней' },
  { color: '#fbbf24', text: 'Жёлтая линия — среднее в этот же день недели' }
];

async function load() {
  error.value = '';
  loading.value = true;
  data.value = null;
  try {
    const res = await api.home(toQuery(filters.active));
    if (!res || (typeof res !== 'object') || (!res.byLimit && !res.hours && !res.kpis)) {
      throw new Error('Home API вернул пустой/неожиданный ответ. Проверьте /api/home на сервере.');
    }
    data.value = res;
  } catch (e) {
    error.value = e.message;
    data.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => filters.version, load, { immediate: true });

function seriesFromHours(hours) {
  return [
    {
      name: 'Объём очков за час',
      type: 'column',
      data: hours.map((h) => h.volume ?? h.records ?? 0)
    },
    {
      name: 'Среднее все дни',
      type: 'line',
      data: hours.map((h) => h.avgVolumeAll ?? h.avgRecordsAll ?? 0)
    },
    {
      name: 'Среднее этот день недели',
      type: 'line',
      data: hours.map((h) => h.avgVolumeWeekday ?? h.avgRecordsWeekday ?? 0)
    }
  ];
}

const charts = computed(() => {
  const blocks = data.value?.byLimit;
  if (Array.isArray(blocks) && blocks.length) {
    return blocks.map((block) => {
      const hours = block.hours || [];
      return {
        limit: block.limit,
        categories: hours.map((h) => `${h.hour}:00`),
        series: seriesFromHours(hours)
      };
    });
  }
  // Старый ответ API без byLimit — один чарт
  const hours = data.value?.hours || [];
  if (!hours.length) return [];
  return [
    {
      limit: 'all',
      categories: hours.map((h) => `${h.hour}:00`),
      series: seriesFromHours(hours)
    }
  ];
});

const chartOptions = {
  colors: ['#3b82f6', '#34d399', '#fbbf24'],
  stroke: { width: [0, 3, 3] },
  plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
  yaxis: {
    title: { text: 'Очки (объём часа)', style: { color: '#8b95a8', fontSize: '11px' } }
  }
};
</script>

<style scoped>
.home-charts {
  display: grid;
  gap: 20px;
  margin-top: 8px;
}
</style>
