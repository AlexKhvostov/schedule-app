<template>
  <div class="muted redirect-note">Открываем профиль…</div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFiltersStore } from '../stores/filters';

const route = useRoute();
const router = useRouter();
const filters = useFiltersStore();

onMounted(() => {
  const name = decodeURIComponent(String(route.params.name || '')).trim();
  if (name) {
    filters.addPlayer(name);
    if (!filters.draft.month) {
      filters.draft.month = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 7);
    }
    if (!filters.draft.limits?.length) {
      filters.draft.limits = ['100'];
    } else if (filters.draft.limits.length > 1) {
      filters.draft.limits = [filters.draft.limits[0]];
    }
    filters.apply();
  }
  router.replace({ name: 'profile' });
});
</script>

<style scoped>
.redirect-note { padding: 24px; text-align: center; }
</style>
