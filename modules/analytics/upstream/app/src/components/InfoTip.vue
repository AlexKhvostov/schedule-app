<template>
  <span class="info-tip" :class="alignClass">
    <button type="button" class="info-btn" :aria-label="label" tabindex="0">i</button>
    <span class="info-bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  text: { type: String, required: true },
  label: { type: String, default: 'Подсказка' },
  /** start = вправо от кнопки (не уезжает под сайдбар) */
  align: { type: String, default: 'start' }
});

const alignClass = computed(() => `align-${props.align}`);
</script>

<style scoped>
.info-tip {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  z-index: 5;
}
.info-btn {
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid #3b4f7a;
  background: #152238;
  color: var(--accent);
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.info-btn:hover,
.info-btn:focus-visible {
  border-color: var(--accent);
  outline: none;
}
.info-bubble {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  z-index: 300;
  width: max-content;
  max-width: min(280px, 70vw);
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #3b4f7a;
  background: #121826;
  color: var(--text);
  font-size: 0.72rem;
  font-weight: 400;
  line-height: 1.4;
  text-transform: none;
  letter-spacing: normal;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55);
  white-space: normal;
  pointer-events: none;
}
.align-start .info-bubble {
  left: 0;
  transform: none;
}
.align-end .info-bubble {
  right: 0;
  left: auto;
  transform: none;
}
.align-center .info-bubble {
  left: 50%;
  transform: translateX(-50%);
}
.info-tip:hover,
.info-tip:focus-within {
  z-index: 320;
}
.info-tip:hover .info-bubble,
.info-tip:focus-within .info-bubble {
  display: block;
}
</style>
