<template>
  <div class="loading-box" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true" />
    <p class="muted">{{ text }}</p>
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: 'Загрузка… подождите' }
});
</script>

<style scoped>
.loading-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 160px;
  padding: 28px 16px;
  margin-bottom: 14px;
  border: 1px dashed var(--line);
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel) 70%, transparent);
}
.spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid #243044;
  border-top-color: var(--accent);
  animation: spin .7s linear infinite;
}
.muted { margin: 0; font-size: 0.9rem; }
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
