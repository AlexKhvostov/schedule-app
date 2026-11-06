<template>
  <Teleport to="body">
    <div
      v-if="tip"
      class="hm-float-tip"
      :class="{ pinned: tip.pinned, below: flipBelow }"
      :style="style"
      role="tooltip"
      @mouseenter="onTipEnter"
      @mouseleave="onTipLeave"
    >
      <slot :tip="tip" />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  tip: { type: Object, default: null }
});

const emit = defineEmits(['close', 'keep']);

const flipBelow = ref(false);

watch(
  () => props.tip,
  (t) => {
    flipBelow.value = !!(t && t.y < 96);
  },
  { immediate: true }
);

const style = computed(() => {
  if (!props.tip) return {};
  const pad = 8;
  const x = Math.min(window.innerWidth - 16, Math.max(16, props.tip.x));
  if (flipBelow.value) {
    const top = Math.min(window.innerHeight - pad, (props.tip.yBottom ?? props.tip.y) + 10);
    return { left: `${x}px`, top: `${top}px` };
  }
  return { left: `${x}px`, top: `${Math.max(pad, props.tip.y)}px` };
});

function onTipEnter() {
  emit('keep');
}

function onTipLeave() {
  if (!props.tip?.pinned) emit('close');
}

function onDocClick(e) {
  if (!props.tip?.pinned) return;
  const el = e.target;
  if (el?.closest?.('.hm-float-tip') || el?.closest?.('.phm-cell') || el?.closest?.('.hm-cell')) {
    return;
  }
  emit('close');
}

onMounted(() => document.addEventListener('click', onDocClick, true));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick, true));
</script>

<style>
.hm-float-tip {
  position: fixed;
  z-index: 4000;
  transform: translate(-50%, calc(-100% - 10px));
  min-width: 220px;
  max-width: min(340px, calc(100vw - 24px));
  padding: 10px 12px 11px;
  border-radius: 10px;
  border: 1px solid #3b4f7a;
  background: #121826;
  color: #e8ecf4;
  font-size: 0.8rem;
  line-height: 1.35;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55);
  pointer-events: auto;
}
.hm-float-tip.below {
  transform: translate(-50%, 0);
}
.hm-float-tip.pinned {
  border-color: #5b9fd4;
}
.hm-float-tip::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: #121826;
  border-bottom-width: 0;
}
.hm-float-tip.below::after {
  bottom: auto;
  top: -6px;
  border-top-color: transparent;
  border-top-width: 0;
  border-bottom-color: #121826;
  border-bottom-width: 6px;
}

/* Структура контента подсказки */
.hm-float-tip .tip-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid #2a364a;
}
.hm-float-tip .tip-title {
  font-weight: 700;
  font-size: 0.88rem;
  color: #f1f5f9;
  word-break: break-word;
}
.hm-float-tip .tip-hero {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.hm-float-tip .tip-hero-pts {
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.1;
  color: #f8fafc;
  letter-spacing: -0.03em;
}
.hm-float-tip .tip-hero-delta {
  font-size: 0.95rem;
  font-weight: 700;
  color: #86efac;
}
.hm-float-tip .tip-sub {
  color: #94a3b8;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}
.hm-float-tip .tip-empty {
  color: #94a3b8;
  font-size: 0.78rem;
  padding: 2px 0;
}
.hm-float-tip .tip-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hm-float-tip .tip-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
  align-items: baseline;
}
.hm-float-tip .tip-label {
  color: #7b879c;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.hm-float-tip .tip-value {
  color: #e8ecf4;
  font-variant-numeric: tabular-nums;
  word-break: break-word;
}
.hm-float-tip .tip-value strong {
  color: #86efac;
  font-weight: 700;
}
.hm-float-tip .tip-value .dim {
  color: #94a3b8;
  font-size: 0.78rem;
}
.hm-float-tip .down-banner {
  margin: 0 0 8px;
  padding: 5px 8px;
  border-radius: 6px;
  background: rgba(220, 38, 38, 0.15);
  border: 1px solid #e04545;
  color: #fca5a5;
  font-size: 0.75rem;
  line-height: 1.3;
}
</style>
