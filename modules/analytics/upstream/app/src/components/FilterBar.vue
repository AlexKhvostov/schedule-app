<template>
  <div class="filters-sticky">
    <div class="filters card" :class="{ 'is-collapsed': collapsed }">
      <div
        class="filters-head"
        :class="{ 'filters-head--tap': collapsed }"
        @click="collapsed && onToggleClick()"
      >
        <div class="filters-title-row">
          <button
            type="button"
            class="filters-toggle"
            :aria-expanded="String(!collapsed)"
            :aria-controls="panelId"
            @click="onToggleClick"
          >
            <h2 class="filters-title">Фильтры</h2>
            <span class="filters-chevron" aria-hidden="true" />
          </button>
          <span v-if="collapsed" class="filters-summary muted">{{ activeSummary }}</span>
          <span v-else class="filters-lead muted">{{ screenLeadShort }}</span>
        </div>
      </div>

      <div v-show="!collapsed" :id="panelId" class="filters-panel">
        <div class="filter-grid">
          <section
            class="filter-block"
            :class="dateBlockClass"
          >
            <header class="block-head">
              <h3>{{ dateBlockTitle }}</h3>
              <InfoTip :text="periodInfo" />
              <span v-if="dateNeed" class="tag tag-need">нужно</span>
              <span v-else-if="dateHint" class="tag">{{ dateHint }}</span>
            </header>
            <div v-if="isMonthMode" class="block-body period period-day">
              <label>
                <span>Месяц (ES)</span>
                <input v-model="filters.draft.month" type="month" :disabled="dateInputsDisabled" />
              </label>
            </div>
            <div v-else-if="isDayMode" class="block-body period period-day">
              <label>
                <span>Дата (ES)</span>
                <input v-model="filters.draft.dateTo" type="date" :disabled="dateInputsDisabled" @change="onDayChange" />
              </label>
            </div>
            <div v-else class="block-body period">
              <label>
                <span>С</span>
                <input v-model="filters.draft.dateFrom" type="date" :disabled="dateInputsDisabled" />
              </label>
              <label>
                <span>По</span>
                <input v-model="filters.draft.dateTo" type="date" :disabled="dateInputsDisabled" />
              </label>
            </div>
          </section>

          <section class="filter-block" :class="limitsBlockClass">
            <header class="block-head">
              <h3>Лимиты</h3>
              <InfoTip :text="limitsInfo" />
              <span v-if="limitsNeed" class="tag tag-need">нужно</span>
              <span v-else-if="cfg.limitsMode === 'single'" class="tag">один</span>
            </header>
            <div class="block-body limits">
              <button
                v-for="code in allLimits"
                :key="code"
                type="button"
                class="ghost limit-btn compact"
                :class="{ on: filters.draft.limits.includes(code) }"
                :disabled="!cfg.limits"
                @click="filters.toggleLimit(code)"
              >{{ code }}€</button>
            </div>
          </section>

          <section
            v-if="showAudience"
            class="filter-block"
            :class="audienceBlockClass"
          >
            <header class="block-head">
              <h3>Аудитория</h3>
              <InfoTip text="Сегмент: все / реги / свои / чужие / не свои / не чужие / не в списке. «Не свои» = все кроме клуба. «Не чужие» = все кроме чужих регов. Меняется только после «Применить»." />
            </header>
            <div class="block-body audience">
              <label :class="{ disabled: !cfg.segment }">
                <span>Сегмент</span>
                <select
                  v-model="filters.draft.segment"
                  :disabled="!cfg.segment"
                >
                  <option value="all">Все</option>
                  <option value="regs">Реги</option>
                  <option value="ours">Свои</option>
                  <option value="theirs">Чужие</option>
                  <option value="not_ours">Не свои</option>
                  <option value="not_theirs">Не чужие</option>
                  <option value="nonregs">Не в списке</option>
                </select>
              </label>
              <div v-if="cfg.topN" class="topn-wrap">
                <span class="topn-label">Top N</span>
                <div class="topn-btns">
                  <button
                    v-for="n in topNOptions"
                    :key="n"
                    type="button"
                    class="ghost limit-btn compact"
                    :class="{ on: String(filters.draft.topN) === String(n) }"
                    @click="filters.draft.topN = String(n)"
                  >{{ n === 'all' ? 'All' : n }}</button>
                </div>
              </div>
              <label v-if="cfg.topThreshold">
                <span>Топ ≤</span>
                <select v-model="filters.draft.topThreshold">
                  <option value="10">10</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </label>
            </div>
          </section>

          <section class="filter-block players-block" :class="playersBlockClass">
            <header class="block-head">
              <h3>Игроки</h3>
              <InfoTip text="Ограничить выборку списком ников. Пусто = все. В профиле — один игрок (обязательно). На Плотности — сумма по выбранным. Меняется только после «Применить»." />
              <span v-if="playersNeed" class="tag tag-need">нужно</span>
              <span v-else-if="playersDisabled" class="tag">из URL</span>
              <span v-else-if="cfg.playersMode === 'single'" class="tag">один</span>
            </header>
            <div class="block-body players">
              <div class="search-wrap" ref="searchWrap">
                <input
                  v-model="playerQuery"
                  :disabled="playersDisabled"
                  placeholder="ник, Enter"
                  autocomplete="off"
                  @input="onSearch"
                  @keydown.enter.prevent="addFirst"
                  @keydown.escape="suggestions = []"
                  @focus="onSearch"
                />
                <div v-if="suggestions.length" class="suggest" role="listbox">
                  <button
                    v-for="name in suggestions"
                    :key="name"
                    type="button"
                    class="suggest-item"
                    role="option"
                    @mousedown.prevent="pick(name)"
                  >{{ name }}</button>
                </div>
              </div>
              <div class="chips">
                <span v-for="name in filters.draft.players" :key="name" class="chip">
                  {{ name }}
                  <button type="button" class="ghost x" @click="filters.removePlayer(name)">×</button>
                </span>
                <span v-if="!filters.draft.players.length && !playersDisabled" class="muted empty-hint">все</span>
              </div>
            </div>
          </section>
        </div>

        <div class="filters-footer">
          <button
            type="button"
            class="primary compact apply-btn"
            :class="{ 'is-dirty': filters.isDirty, 'is-idle': !filters.isDirty }"
            :disabled="!filters.isDirty"
            @click="onApply"
          >
            Применить
          </button>
          <button
            type="button"
            class="ghost compact refresh-btn"
            title="Заново загрузить данные с сервера по текущим фильтрам (авто каждые 15 мин)"
            @click="onRefresh"
          >
            Обновить результаты
          </button>
          <button type="button" class="ghost compact" :title="resetPeriodTitle" @click="filters.resetPeriod()">{{ resetPeriodLabel }}</button>
          <button type="button" class="ghost compact" @click="filters.reset()">Сбросить всё</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../api';
import InfoTip from './InfoTip.vue';
import { useFiltersStore } from '../stores/filters';

const MOBILE_MQ = '(max-width: 700px)';
const panelId = 'analytics-filters-panel';

const filters = useFiltersStore();
const allLimits = ['16-25', '50', '100', '250'];
const topNOptions = ['10', '50', '100', 'all'];
const playerQuery = ref('');
const suggestions = ref([]);
const searchWrap = ref(null);
const isMobile = ref(false);
const mobileOpen = ref(false);
let searchTimer = null;
let mediaQuery = null;

const collapsed = computed(() => isMobile.value && !mobileOpen.value);

const activeSummary = computed(() => {
  const a = filters.active || {};
  const parts = [];
  if (cfg.value?.dateMode === 'month' && a.month) {
    parts.push(a.month);
  } else {
    const from = a.dateFrom || '';
    const to = a.dateTo || '';
    if (from && to) {
      parts.push(from === to ? to : `${from} → ${to}`);
    } else if (to) {
      parts.push(to);
    }
  }
  if (Array.isArray(a.limits) && a.limits.length) {
    parts.push(a.limits.map((code) => `${code}€`).join(', '));
  }
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
  if (Array.isArray(a.players) && a.players.length) {
    parts.push(a.players.length === 1 ? a.players[0] : `${a.players.length} игр.`);
  }
  return parts.join(' · ') || 'все';
});

function syncMobile() {
  const next = Boolean(mediaQuery?.matches);
  isMobile.value = next;
  if (!next) {
    mobileOpen.value = false;
  }
}

function onToggleClick(e) {
  if (!isMobile.value) return;
  e?.stopPropagation?.();
  mobileOpen.value = !mobileOpen.value;
}

function onApply() {
  if (!filters.isDirty) return;
  filters.apply();
  if (isMobile.value) {
    mobileOpen.value = false;
  }
}

function onRefresh() {
  filters.reload();
  if (isMobile.value) {
    mobileOpen.value = false;
  }
}

/** Авто-перезагрузка экрана (heatmap/графики), пока вкладка открыта. */
const AUTO_RELOAD_MS = 15 * 60 * 1000;
let autoReloadTimer = null;

function startAutoReload() {
  stopAutoReload();
  autoReloadTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    filters.reload();
  }, AUTO_RELOAD_MS);
}

function stopAutoReload() {
  if (autoReloadTimer) {
    clearInterval(autoReloadTimer);
    autoReloadTimer = null;
  }
}

const cfg = computed(() => filters.screenConfig);
const isDayMode = computed(() => cfg.value.dateMode === 'day');
const isMonthMode = computed(() => cfg.value.dateMode === 'month');
const showAudience = computed(
  () => !!(cfg.value.segment || cfg.value.topN || cfg.value.topThreshold)
);

const dateBlockTitle = computed(() => {
  if (isMonthMode.value) return 'Месяц';
  if (isDayMode.value) return 'Дата';
  return 'Период';
});
const resetPeriodLabel = computed(() => {
  if (isMonthMode.value) return 'Текущий месяц';
  if (isDayMode.value || cfg.value.dateMode === 'day-to') return 'Сегодня';
  return 'Период ≈ год';
});
const resetPeriodTitle = computed(() => {
  if (isMonthMode.value) return 'Месяц → текущий (Europe/Madrid)';
  if (isDayMode.value || cfg.value.dateMode === 'day-to') return 'Дата → сегодня (Europe/Madrid)';
  return 'Период → сегодня−365 … сегодня';
});

const dateInputsDisabled = computed(
  () =>
    cfg.value.date === false ||
    cfg.value.date === 'locked-today' ||
    cfg.value.date === 'locked-year'
);
const dateActive = computed(() => !dateInputsDisabled.value && cfg.value.date !== false);
const playersDisabled = computed(() => cfg.value.players === false);
const playersActive = computed(() => !playersDisabled.value);
const limitsActive = computed(() => !!cfg.value.limits);
const audienceActive = computed(
  () => !!(cfg.value.segment || cfg.value.topN || cfg.value.topThreshold)
);

/** Обязательные, но ещё не заполненные */
const dateNeed = computed(() => {
  if (!dateActive.value) return false;
  if (isMonthMode.value) return !filters.draft.month;
  if (isDayMode.value || cfg.value.dateMode === 'day-to') return !filters.draft.dateTo;
  return !filters.draft.dateFrom || !filters.draft.dateTo;
});
const limitsNeed = computed(
  () => limitsActive.value && !(filters.draft.limits && filters.draft.limits.length)
);
const playersNeed = computed(
  () =>
    playersActive.value &&
    cfg.value.playersMode === 'single' &&
    !(filters.draft.players && filters.draft.players.length)
);

function blockClass(active, need) {
  if (!active) return { 'is-off': true };
  if (need) return { 'is-need': true };
  return { 'is-ok': true };
}

const dateBlockClass = computed(() => blockClass(dateActive.value, dateNeed.value));
const limitsBlockClass = computed(() => blockClass(limitsActive.value, limitsNeed.value));
const audienceBlockClass = computed(() => blockClass(audienceActive.value, false));
const playersBlockClass = computed(() => blockClass(playersActive.value, playersNeed.value));

const dateHint = computed(() => {
  if (cfg.value.date === 'locked-today') return 'сегодня';
  if (cfg.value.date === 'locked-year') return '~год';
  if (cfg.value.dateMode === 'month') return 'YYYY-MM';
  if (cfg.value.dateMode === 'day') return 'один день';
  if (filters.screen === 'home') return 'день = По';
  return '';
});

const periodInfo = computed(() => {
  if (cfg.value.dateMode === 'month') {
    return 'Один календарный месяц Europe/Madrid. KPI и heatmap за этот месяц. Меняется после «Применить».';
  }
  if (cfg.value.dateMode === 'day') {
    return 'Очки за день: один день Europe/Madrid. По умолчанию — сегодня. Меняется после «Применить».';
  }
  if (cfg.value.date === 'locked-year') {
    return 'Yearly всегда берёт последние ~365 дней. Период на этом экране не меняет окно.';
  }
  if (filters.screen === 'home') {
    return 'Home — однодневка: столбцы строятся по дате «По». Меняется после «Применить».';
  }
  return 'Диапазон дат Milan. Запоминается после «Применить». «Период ≈ год» → С=сегодня−365, По=сегодня.';
});

const limitsInfo = computed(() => {
  if (cfg.value.limitsMode === 'single') {
    return 'Один бай-ин. Выбор применяется только после кнопки «Применить».';
  }
  return 'Бай-ины Expresso (€). Можно выбрать несколько. Применяется после «Применить».';
});

function onDayChange() {
  if (filters.draft.dateTo) {
    filters.draft.dateFrom = filters.draft.dateTo;
  }
}

const screenLeadShort = computed(() => {
  const map = {
    home: 'плотность · объём очков',
    points: 'очки за день ES',
    yearly: 'календарь ~год',
    speed: 'скорость · месяц',
    heatmap: 'плотность · сумма за месяц',
    players: 'список игроков',
    profile: 'профиль · месяц · игрок'
  };
  return map[filters.screen] || '';
});

async function onSearch() {
  clearTimeout(searchTimer);
  const q = playerQuery.value.trim();
  if (q.length < 2) {
    suggestions.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const data = await api.search(q);
      suggestions.value = data.players || [];
    } catch {
      suggestions.value = [];
    }
  }, 250);
}

function pick(name) {
  filters.addPlayer(name);
  playerQuery.value = '';
  suggestions.value = [];
}

function addFirst() {
  if (suggestions.value[0]) pick(suggestions.value[0]);
  else if (playerQuery.value.trim()) pick(playerQuery.value.trim());
}

function onDocPointerDown(e) {
  if (!searchWrap.value) return;
  if (!searchWrap.value.contains(e.target)) {
    suggestions.value = [];
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown);
  mediaQuery = window.matchMedia(MOBILE_MQ);
  syncMobile();
  mediaQuery.addEventListener('change', syncMobile);
  startAutoReload();
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown);
  mediaQuery?.removeEventListener('change', syncMobile);
  clearTimeout(searchTimer);
  stopAutoReload();
});
</script>

<style scoped>
.filters-sticky {
  position: sticky;
  top: 0;
  z-index: 60;
  margin: -4px -4px 12px;
  padding: 4px;
  background: linear-gradient(180deg, rgba(7, 10, 16, 0.97) 70%, rgba(7, 10, 16, 0.85));
  backdrop-filter: blur(8px);
  overflow: visible;
}
.filters {
  --ctrl-h: 30px;
  --head-h: 20px;
  --body-h: 58px;
  --need: #d42a55;
  --ok: #2f9e6b;
  --ok-bright: #3ecf8e;
  margin-bottom: 0;
  padding: 10px 12px 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  overflow: visible;
}
.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  align-items: stretch;
}
.filter-block {
  display: flex;
  flex-direction: column;
  background: #0c111a;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 10px;
  min-width: 0;
  overflow: visible;
  transition: border-color 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
}
/* Не влияет на этот экран — серый, заблокированный вид */
.filter-block.is-off {
  opacity: 0.38;
  border-color: #2e3646;
  background: #090c12;
  filter: grayscale(0.7);
  pointer-events: none;
}
/* Активен и заполнен / необязателен — зелёный */
.filter-block.is-ok {
  opacity: 1;
  border: 2px solid var(--ok);
  box-shadow: 0 0 0 1px rgba(47, 158, 107, 0.22);
}
/* Обязателен, но пуст — красный пульс */
.filter-block.is-need {
  opacity: 1;
  border: 2px solid var(--need);
  animation: need-pulse 1.2s ease-in-out infinite;
}
@keyframes need-pulse {
  0%, 100% {
    box-shadow: 0 0 0 1px rgba(212, 42, 85, 0.35), 0 0 0 0 rgba(212, 42, 85, 0);
  }
  50% {
    box-shadow: 0 0 0 2px rgba(212, 42, 85, 0.7), 0 0 12px 2px rgba(212, 42, 85, 0.35);
  }
}
.tag-need {
  color: #ffb3c5 !important;
  background: #3a1020 !important;
  border-color: var(--need) !important;
}
.filters-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  min-height: 32px;
}
.filters.is-collapsed .filters-head {
  margin-bottom: 0;
}
.filters-head--tap {
  cursor: pointer;
}
.filters-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.filters-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: default;
  flex-shrink: 0;
}
.filters-chevron {
  display: none;
  width: 0.55rem;
  height: 0.55rem;
  border-right: 2px solid var(--muted);
  border-bottom: 2px solid var(--muted);
  transform: rotate(45deg);
  transition: transform 0.15s ease;
  margin-top: -2px;
}
.filters-summary {
  font-size: 0.72rem;
  line-height: 1.25;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filters-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.filters-lead {
  font-size: 0.75rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.filters-panel {
  min-width: 0;
}
.filters-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #1e2a3d;
}
.apply-btn {
  min-width: 148px;
  min-height: calc(var(--ctrl-h) + 6px);
  padding: 0 16px;
  font-size: 0.95rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  border-radius: 10px;
}
.refresh-btn {
  font-weight: 600;
  border-color: #3a4d7a;
  color: #c5d4f0;
}
.refresh-btn:hover {
  border-color: var(--accent);
  color: #fff;
}
.apply-btn.is-idle {
  opacity: 0.45;
  border-color: #3a4458;
  background: #1a2230;
  color: #8a96ab;
  box-shadow: none;
  transform: none;
  cursor: default;
  animation: none;
}
.apply-btn.is-dirty {
  opacity: 1;
  color: #fff;
  border-color: #ff4d5c;
  background: linear-gradient(135deg, #1a6b45 0%, #22a35f 45%, #163528 100%);
  animation: apply-pulse 1.05s ease-in-out infinite;
}
@keyframes apply-pulse {
  0%, 100% {
    transform: scale(1);
    border-color: #2fd67a;
    background: linear-gradient(135deg, #1a6b45 0%, #22a35f 45%, #163528 100%);
    box-shadow:
      0 0 0 0 rgba(255, 61, 80, 0.75),
      0 0 14px 2px rgba(47, 214, 122, 0.45);
  }
  50% {
    transform: scale(1.07);
    border-color: #ff3d50;
    background: linear-gradient(135deg, #8b1a28 0%, #e23a4a 40%, #1a6b45 100%);
    box-shadow:
      0 0 0 10px rgba(255, 61, 80, 0),
      0 0 22px 4px rgba(255, 61, 80, 0.65);
  }
}
button.compact {
  height: var(--ctrl-h);
  padding: 0 10px;
  font-size: 0.82rem;
  border-radius: 8px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.block-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--head-h);
  margin-bottom: 8px;
  flex-shrink: 0;
}
.block-head h3 {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  line-height: 1;
}
.block-head .tag { margin-left: auto; }
.tag {
  font-size: 0.65rem;
  color: var(--accent);
  background: #152238;
  border: 1px solid #2a4066;
  border-radius: 999px;
  padding: 1px 6px;
  white-space: nowrap;
  line-height: 1.2;
}
.block-body {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: flex-start;
  align-content: flex-start;
  min-height: var(--body-h);
  flex: 1;
}
.period label,
.audience label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 0.7rem;
  color: var(--muted);
  flex: 1 1 0;
  min-width: 0;
  line-height: 1;
}
.period label > span,
.audience label > span,
.topn-label {
  height: 14px;
  display: flex;
  align-items: center;
  line-height: 1;
}
.period input,
.audience select,
.players input {
  width: 100%;
  height: var(--ctrl-h);
  padding: 0 8px;
  font-size: 0.88rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  border-radius: 8px;
  box-sizing: border-box;
  line-height: 1;
  color: #f4f7ff;
  background: #141c2a;
  border: 1px solid #3a4d6a;
  color-scheme: dark;
  cursor: pointer;
}
.period input:focus,
.audience select:focus,
.players input:focus {
  outline: none;
  border-color: var(--ok-bright);
  box-shadow: 0 0 0 2px rgba(62, 207, 142, 0.2);
}
.filter-block.is-ok .period input,
.filter-block.is-ok .audience select,
.filter-block.is-ok .players input {
  color: #ffffff;
  background: #172418;
  border-color: #3a8f62;
  font-weight: 700;
}
/* Нативные month/date часто рисуют значение серым — форсируем яркость */
.period input::-webkit-datetime-edit,
.period input::-webkit-datetime-edit-fields-wrapper,
.period input::-webkit-datetime-edit-text,
.period input::-webkit-datetime-edit-month-field,
.period input::-webkit-datetime-edit-day-field,
.period input::-webkit-datetime-edit-year-field {
  color: inherit;
  font-weight: inherit;
}
/* Календарик: яркий на тёмном фоне (без invert поверх color-scheme:dark) */
.period input[type="date"],
.period input[type="month"] {
  position: relative;
}
.period input::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 1;
  width: 1.15rem;
  height: 1.15rem;
  margin-left: 4px;
  padding: 3px;
  border-radius: 4px;
  background-color: #7aa2ff;
  /* белая иконка поверх синего квадрата */
  filter: brightness(0) invert(1);
}
.limits {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
  min-height: var(--ctrl-h);
  padding-top: 17px;
}
.limit-btn {
  height: var(--ctrl-h);
  min-width: 44px;
}
.limit-btn.on {
  border-color: var(--ok-bright);
  color: #fff;
  background: #1a3328;
  font-weight: 700;
}
.topn-wrap {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1 1 100%;
}
.topn-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.audience label.disabled {
  opacity: 0.45;
  pointer-events: none;
}
.players {
  flex-direction: column;
  flex-wrap: nowrap;
  gap: 6px;
}
.search-wrap {
  position: relative;
  width: 100%;
}
.suggest {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  z-index: 80;
  max-height: 180px;
  overflow: auto;
  background: #101824;
  border: 1px solid #2a4066;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
}
.suggest-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 0.8rem;
  cursor: pointer;
}
.suggest-item:hover {
  background: #152238;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  min-height: 22px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #152238;
  border: 1px solid #2a4066;
  font-size: 0.72rem;
  max-width: 100%;
}
.chip .x {
  padding: 0 2px;
  height: auto;
  min-width: 0;
  font-size: 0.85rem;
  line-height: 1;
}
.empty-hint {
  font-size: 0.72rem;
}

@media (max-width: 1100px) {
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 700px) {
  .filters-sticky {
    margin: 0 0 10px;
    padding: 0;
  }
  .filter-grid {
    grid-template-columns: 1fr;
  }
  .filters-chevron {
    display: inline-block;
  }
  .filters:not(.is-collapsed) .filters-chevron {
    transform: rotate(-135deg);
    margin-top: 2px;
  }
  .filters-toggle {
    cursor: pointer;
  }
  .filters-footer {
    position: sticky;
    bottom: 0;
    background: #0c111a;
    padding-bottom: 2px;
  }
}
</style>
