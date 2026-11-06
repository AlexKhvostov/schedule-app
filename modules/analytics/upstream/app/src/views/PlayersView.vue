<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>Игроки 50 / 100 / 250</h1>
        <p class="lead">
          Кто попадался в снимках за выбранный период: лимиты, max очки, активность.
          Отсюда удобно заводить в свои / чужие реги.
        </p>
      </div>
    </header>

    <LoadingBox v-if="loading" text="Грузим список игроков…" />
    <p v-if="error" class="bad">{{ error }}</p>

    <div v-if="!loading && data" class="card table-wrap">
      <h3 class="section-title">Список</h3>
      <p class="muted section-note">
        Max очки — пик стека за период. Дней — активные дни Milan. Последний раз — последний снимок.
        Сортировка по max очкам. Клик по нику — профиль. Либо откройте «Профиль» в меню и найдите ника.
      </p>

      <div class="table-tools">
        <input
          v-model="nameQuery"
          type="search"
          class="table-search"
          placeholder="Фильтр по нику…"
          autocomplete="off"
        />
        <div class="top-btns">
          <button
            v-for="opt in topOptions"
            :key="String(opt.value)"
            type="button"
            class="ghost compact"
            :class="{ on: topLimit === opt.value }"
            @click="topLimit = opt.value"
          >{{ opt.label }}</button>
        </div>
        <span class="muted shown-count">показано {{ rows.length }} / {{ filteredAll.length }}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>
              <span class="th-with-tip"># <InfoTip text="Место в текущем списке после фильтра по нику и Top N (сортировка по max очкам)." /></span>
            </th>
            <th>
              <span class="th-with-tip">Ник <InfoTip text="Имя игрока на maxwin. Клик открывает профиль." /></span>
            </th>
            <th>
              <span class="th-with-tip">Лимиты <InfoTip text="На каких бай-инах (€) игрок встречался в снимках за выбранный период и фильтр лимитов." /></span>
            </th>
            <th>
              <span class="th-with-tip">Max очки <InfoTip text="Максимум points у игрока за период (по выбранным лимитам). Список отсортирован по этому столбцу." /></span>
            </th>
            <th>
              <span class="th-with-tip">Дней <InfoTip text="Сколько дней Milan с хотя бы одним снимком этого игрока за период." /></span>
            </th>
            <th>
              <span class="th-with-tip">Последний раз <InfoTip text="Дата/время последнего снимка игрока в выбранном периоде." /></span>
            </th>
            <th>
              <span class="th-with-tip">Рег <InfoTip text="Помечен ли в списке регов: свой / чужой." align="end" /></span>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, idx) in rows" :key="p.player_name">
            <td class="muted">{{ idx + 1 }}</td>
            <td><RouterLink :to="`/player/${encodeURIComponent(p.player_name)}`">{{ p.player_name }}</RouterLink></td>
            <td>{{ p.limits.join(', ') }}</td>
            <td>{{ p.max_points }}</td>
            <td>{{ p.active_days }}</td>
            <td>{{ p.last_seen }}</td>
            <td>
              <span v-if="p.reg_side" class="chip" :class="p.reg_side">{{ p.reg_side === 'ours' ? 'свой' : 'чужой' }}</span>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <button type="button" class="ghost" @click="regs.upsert(p.player_name, 'ours')">свой</button>
              <button type="button" class="ghost" @click="regs.upsert(p.player_name, 'theirs')">чужой</button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="8" class="muted empty-row">Никого не найдено</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
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
const nameQuery = ref('');
const topLimit = ref(50);

const topOptions = [
  { value: 10, label: 'Топ 10' },
  { value: 50, label: 'Топ 50' },
  { value: 100, label: 'Топ 100' },
  { value: 'all', label: 'Все' }
];

const filteredAll = computed(() => {
  const q = nameQuery.value.trim().toLowerCase();
  const list = data.value?.players || [];
  if (!q) return list;
  return list.filter((p) => String(p.player_name || '').toLowerCase().includes(q));
});

const rows = computed(() => {
  const list = filteredAll.value;
  if (topLimit.value === 'all') return list;
  return list.slice(0, Number(topLimit.value));
});

async function load() {
  error.value = '';
  loading.value = true;
  try {
    data.value = await api.players(toQuery(filters.active));
    await regs.load();
  } catch (e) {
    error.value = e.message;
    data.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => filters.version, load, { immediate: true });
</script>

<style scoped>
.section-title { margin: 0 0 4px; font-size: 0.95rem; }
.section-note { margin: 0 0 12px; font-size: 0.82rem; }
.table-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.table-search {
  min-width: 180px;
  flex: 1;
  max-width: 280px;
  padding: 6px 10px;
  font-size: 0.85rem;
}
.top-btns {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.top-btns .ghost.compact {
  padding: 4px 9px;
  font-size: 0.78rem;
}
.top-btns .on {
  border-color: var(--accent);
  color: var(--text);
  background: #152238;
}
.shown-count { font-size: 0.78rem; margin-left: auto; }
.empty-row { text-align: center; padding: 18px 8px !important; }
.th-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
</style>
