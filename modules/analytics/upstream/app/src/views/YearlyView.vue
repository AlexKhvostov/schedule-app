<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>Yearly Activity</h1>
        <p class="lead">
          Календарь за ~год: насколько «шумный» был каждый день сбора.
          Клик по дню открывает Home за эту дату.
        </p>
      </div>
    </header>

    <LoadingBox v-if="loading" text="Грузим календарь за год…" />
    <p v-if="error" class="bad">{{ error }}</p>

    <div v-if="!loading && weeks.length" class="card cal">
      <div class="cal-meta">
        <h3 class="chart-title">Активность по дням</h3>
        <p class="muted range">{{ rangeLabel || 'нет данных' }}</p>
      </div>
      <p class="chart-desc">
        Столбцы — недели (Пн→Вс сверху вниз). Сверху — месяцы.
        Яркость зелёного — объём записей. Красные — downtime из JSON.
      </p>

      <div v-if="weeks.length" class="cal-wrap">
        <div class="months" :style="{ gridTemplateColumns: `var(--wd) repeat(${weeks.length}, var(--cell))` }">
          <span class="months-spacer" />
          <span
            v-for="(m, i) in monthRow"
            :key="`m-${i}`"
            class="month"
            :style="{ gridColumn: m.span > 1 ? `span ${m.span}` : undefined }"
          >{{ m.label }}</span>
        </div>

        <div class="cal-body">
          <div class="weekdays">
            <span v-for="(wd, i) in weekdayLabels" :key="wd + i" class="wd" :class="{ dim: !wd }">{{ wd }}</span>
          </div>
          <div class="grid" :style="{ gridTemplateColumns: `repeat(${weeks.length}, var(--cell))` }">
            <template v-for="(week, wi) in weeks" :key="`w-${wi}`">
              <div
                v-for="(cell, di) in week"
                :key="cell?.day || `p-${wi}-${di}`"
                class="cell"
                :class="cell ? cell.status : 'pad'"
                :style="cell && cell.status === 'ok' ? { opacity: cell.opacity } : {}"
                :title="cell ? cellTitle(cell) : ''"
                @click="cell && goDay(cell.day)"
              />
            </template>
          </div>
        </div>
      </div>

      <div class="legend muted">
        <span><i class="swatch empty" />мало / пусто</span>
        <span><i class="swatch ok" />есть сбор</span>
        <span><i class="swatch downtime" />downtime (JSON)</span>
      </div>
      <p v-if="(data?.downtime || []).length" class="muted downtime-note">
        Интервалов простоя: {{ data.downtime.length }}
        (править файл downtime.json и обновить выкладку).
      </p>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import LoadingBox from '../components/LoadingBox.vue';
import { api, toQuery } from '../api';
import { useFiltersStore } from '../stores/filters';

const filters = useFiltersStore();
const router = useRouter();
const data = ref(null);
const error = ref('');
const loading = ref(false);

/** Подписи строк: Пн…Вс; пустые — чтобы не шуметь, как у GitHub */
const weekdayLabels = ['Пн', '', 'Ср', '', 'Пт', '', 'Вс'];
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

async function load() {
  error.value = '';
  loading.value = true;
  try {
    data.value = await api.yearly(toQuery(filters.active));
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

watch(() => filters.version, load, { immediate: true });

const maxRecords = computed(() => Math.max(1, ...(data.value?.days || []).map((d) => d.records)));

const enrichedDays = computed(() =>
  (data.value?.days || []).map((d) => ({
    ...d,
    opacity: 0.25 + (d.records / maxRecords.value) * 0.75
  }))
);

/** ISO weekday 1=Пн … 7=Вс */
function isoWeekday(isoDay) {
  const [y, m, d] = isoDay.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const wd = dt.getUTCDay(); // 0=Sun
  return wd === 0 ? 7 : wd;
}

/**
 * Недели: колонки по 7 ячеек (Пн→Вс).
 * В начале — pad, чтобы первый день встал в свою строку недели.
 */
const weeks = computed(() => {
  const days = enrichedDays.value;
  if (!days.length) return [];

  const pad = isoWeekday(days[0].day) - 1;
  const flat = [...Array(pad).fill(null), ...days];
  const out = [];
  for (let i = 0; i < flat.length; i += 7) {
    const chunk = flat.slice(i, i + 7);
    while (chunk.length < 7) chunk.push(null);
    out.push(chunk);
  }
  return out;
});

/** Месяцы над колонками: лейбл + сколько недель занимает */
const monthRow = computed(() => {
  const w = weeks.value;
  if (!w.length) return [];

  const labels = w.map((week) => {
    const hit = week.find((c) => c);
    if (!hit) return '';
    const month = Number(hit.day.slice(5, 7)) - 1;
    return MONTHS_RU[month];
  });

  const row = [];
  let i = 0;
  while (i < labels.length) {
    const label = labels[i];
    let span = 1;
    while (i + span < labels.length && labels[i + span] === label) span++;
    // Короткий хвост месяца без текста — чтобы не наезжало
    row.push({ label: span >= 2 || i === 0 ? label : '', span });
    i += span;
  }
  return row;
});

const rangeLabel = computed(() => {
  const days = data.value?.days || [];
  if (!days.length) return '';
  return `${days[0].day} → ${days[days.length - 1].day}`;
});

function goDay(day) {
  filters.draft.dateFrom = day;
  filters.draft.dateTo = day;
  filters.apply();
  router.push('/home');
}

function cellTitle(cell) {
  if (cell.status === 'downtime') return `${cell.day}: downtime (сервер не собирал)`;
  return `${cell.day}: ${cell.records} записей`;
}
</script>

<style scoped>
.cal {
  overflow: auto;
  --cell: 12px;
  --gap: 3px;
  --wd: 22px;
}
.cal-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.chart-title { margin: 0; font-size: 1rem; font-weight: 650; }
.chart-desc {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 0.84rem;
  line-height: 1.45;
  max-width: 62ch;
}
.range { font-size: 0.85rem; }

.cal-wrap { width: max-content; }

.months {
  display: grid;
  gap: var(--gap);
  margin-bottom: 4px;
  padding-left: 0;
  align-items: end;
  min-height: 16px;
}
.months-spacer { width: var(--wd); }
.month {
  font-size: 0.7rem;
  color: var(--muted);
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
}

.cal-body {
  display: grid;
  grid-template-columns: var(--wd) max-content;
  gap: var(--gap);
  align-items: start;
}
.weekdays {
  display: grid;
  grid-template-rows: repeat(7, var(--cell));
  gap: var(--gap);
  font-size: 0.65rem;
  color: var(--muted);
  line-height: var(--cell);
}
.wd.dim { visibility: hidden; }

.grid {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, var(--cell));
  gap: var(--gap);
}
.cell {
  width: var(--cell);
  height: var(--cell);
  border-radius: 2px;
  background: #1c2230;
  cursor: pointer;
}
.cell.ok { background: #2f9e6c; }
.cell.downtime { background: #e04545; opacity: 1 !important; }
.cell.empty { background: #1c2230; }
.cell.pad {
  background: transparent;
  cursor: default;
  pointer-events: none;
}

.legend {
  display: flex;
  gap: 14px;
  margin-top: 14px;
  font-size: 0.82rem;
  align-items: center;
  flex-wrap: wrap;
}
.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 4px;
}
.swatch.ok { background: #2f9e6c; }
.swatch.downtime { background: #e04545; }
.swatch.empty { background: #1c2230; }
.downtime-note { margin: 10px 0 0; font-size: 0.8rem; }
code { font-size: 0.85em; color: var(--accent); }
</style>
