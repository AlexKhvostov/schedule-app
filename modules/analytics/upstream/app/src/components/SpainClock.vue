<template>
  <div class="spain-clock" title="Лидерборды maxwin живут по испанскому времени">
    <div class="spain-kicker">Время Испании</div>
    <div class="spain-time">{{ clock.time }}</div>
    <div class="spain-date">{{ clock.day }}</div>
    <div class="spain-hint">сутки ES · полночь = обнуление очков</div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { formatSpainClock } from '../utils/spainTime';

const clock = ref(formatSpainClock());
let timer = null;

function tick() {
  clock.value = formatSpainClock();
}

onMounted(() => {
  tick();
  timer = setInterval(tick, 1000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.spain-clock {
  margin: 8px 0 4px;
  padding: 12px 10px;
  border-radius: 14px;
  border: 1px solid #3b4f7a;
  background:
    radial-gradient(120% 120% at 10% 0%, #1e3a5f 0%, transparent 55%),
    linear-gradient(160deg, #121a2b, #0c111a);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  text-align: center;
  flex-shrink: 0;
}
.spain-kicker {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7dd3fc;
}
.spain-time {
  margin-top: 4px;
  font-size: 1.65rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: #f8fafc;
}
.spain-date {
  margin-top: 5px;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.35;
}
.spain-hint {
  margin-top: 6px;
  font-size: 0.68rem;
  color: #fbbf24;
  line-height: 1.35;
}
</style>
