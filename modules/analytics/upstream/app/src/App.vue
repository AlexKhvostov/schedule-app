<template>
  <div class="layout">
    <aside class="side">
      <div class="brand">
        <div class="brand-name">maxwin</div>
        <div class="brand-sub muted">v2 · локально</div>
      </div>
      <SpainClock />
      <button class="regs-btn" type="button" @click="regs.togglePanel()" :title="regsTitle">
        Реги
        <span class="regs-counts">
          (<span class="regs-ours">{{ regs.oursCount }}</span>/<span class="regs-theirs">{{ regs.theirsCount }}</span>)
        </span>
      </button>
      <nav class="nav-main">
        <RouterLink to="/points">Очки за день</RouterLink>
        <RouterLink to="/profile">Профиль игрока</RouterLink>
        <RouterLink to="/speed">Скорость</RouterLink>
        <RouterLink to="/heatmap">Плотность</RouterLink>
        <RouterLink to="/admin">Админка</RouterLink>
      </nav>
      <div class="nav-secondary">
        <div class="nav-secondary-lab muted">В разработке</div>
        <nav>
          <RouterLink to="/home">Home</RouterLink>
          <RouterLink to="/players">Players</RouterLink>
          <RouterLink to="/yearly">Yearly</RouterLink>
        </nav>
      </div>
      <p class="side-note muted">лидерборды · сутки ES</p>
    </aside>
    <main class="main" :class="{ 'main--wide': !!route.meta.wide }">
      <FilterBar v-if="!route.meta.hideFilters" />
      <RouterView />
    </main>
    <RegsDrawer />
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import FilterBar from './components/FilterBar.vue';
import RegsDrawer from './components/RegsDrawer.vue';
import SpainClock from './components/SpainClock.vue';
import { useFiltersStore } from './stores/filters';
import { useRegsStore } from './stores/regs';

const route = useRoute();
const filters = useFiltersStore();
const regs = useRegsStore();

const regsTitle = computed(
  () => `Свои: ${regs.oursCount} · Чужие: ${regs.theirsCount} · всего ${regs.regs.length}`
);

watch(
  () => route.meta.screen,
  (screen) => {
    if (screen) filters.setScreen(screen);
  },
  { immediate: true }
);

onMounted(() => {
  regs.load();
});

if (!filters.applied) filters.apply();
</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  height: 100vh;
  overflow: hidden;
}
.side {
  background: #10141c;
  border-right: 1px solid var(--line);
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: sticky;
  top: 0;
  height: 100vh;
  z-index: 10;
  overflow: auto;
}
.brand { margin-bottom: 4px; }
.brand-name { font-weight: 700; font-size: 1.05rem; }
.brand-sub { font-size: 0.75rem; margin-top: 2px; }
nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-main { margin-top: 6px; }
nav a {
  color: var(--muted);
  padding: 9px 10px;
  border-radius: 8px;
  text-decoration: none;
}
nav a:hover {
  color: var(--text);
  background: #161c28;
  text-decoration: none;
}
nav a.router-link-active {
  background: #1c2740;
  color: var(--text);
}
.nav-secondary {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #2a364a;
}
.nav-secondary-lab {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0 10px 6px;
}
.nav-secondary nav a {
  padding: 6px 10px;
  font-size: 0.82rem;
  opacity: 0.72;
}
.nav-secondary nav a:hover,
.nav-secondary nav a.router-link-active {
  opacity: 1;
}
.regs-btn { margin-top: 4px; width: 100%; }
.regs-counts {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}
.regs-ours { color: var(--ours); }
.regs-theirs { color: var(--theirs); }
.side-note { margin-top: auto; font-size: .78rem; line-height: 1.4; }
.main {
  padding: 16px 20px 28px;
  overflow: auto;
  max-height: 100vh;
  max-width: 1300px;
  width: 100%;
  box-sizing: border-box;
}
.main--wide {
  max-width: 1300px;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }
  .side {
    position: static;
    height: auto;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    z-index: 10;
  }
  .main {
    max-height: none;
    overflow: visible;
  }
  nav { flex-direction: row; flex-wrap: wrap; margin-top: 0; }
  .nav-secondary {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .nav-secondary-lab { padding: 0 4px; }
  .side-note { display: none; }
  .regs-btn { margin-top: 0; width: auto; }
}
</style>
