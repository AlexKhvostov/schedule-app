<template>
  <Teleport to="body">
    <div v-if="regs.open" class="backdrop" @click="regs.togglePanel(false)" />
    <aside v-if="regs.open" class="drawer" role="dialog" aria-label="Реги">
      <header class="head">
        <div>
          <h2>Реги</h2>
          <p class="muted sub">Свои — клуб RP. Чужие — сильные регуляры. Стрелки переносят между списками.</p>
        </div>
        <button type="button" class="ghost compact" @click="regs.togglePanel(false)">Закрыть</button>
      </header>

      <form class="add" @submit.prevent="add">
        <label class="add-label" for="regs-bulk-input">Добавить ники списком</label>
        <textarea
          id="regs-bulk-input"
          v-model="name"
          class="add-list"
          rows="3"
          placeholder="Nick1,Nick2,Nick3"
          required
          maxlength="4000"
        />
        <p class="add-hint">Через запятую, без пробелов. Уже записанные ники пропускаются.</p>
        <div class="add-row">
          <select v-model="side" aria-label="Список">
            <option value="ours">В свои</option>
            <option value="theirs">В чужие</option>
          </select>
          <button type="submit" class="primary compact" :disabled="busy">
            {{ busy ? '…' : '+ добавить' }}
          </button>
        </div>
      </form>
      <p v-if="statusMsg" class="status-msg">{{ statusMsg }}</p>
      <p v-if="regs.error" class="bad">{{ regs.error }}</p>

      <div class="cols">
        <section class="col ours-col">
          <header class="col-head">
            <h3>Свои</h3>
            <span class="count">{{ ours.length }}</span>
          </header>
          <div class="col-list">
            <div v-for="reg in ours" :key="reg.id" class="item">
              <RouterLink
                class="nick"
                :to="`/player/${encodeURIComponent(reg.player_name)}`"
                @click="regs.togglePanel(false)"
              >{{ reg.player_name }}</RouterLink>
              <button type="button" class="ghost compact move" title="В чужие" @click="move(reg, 'theirs')">→</button>
              <button type="button" class="icon-btn del" title="Удалить" @click="regs.remove(reg.player_name)">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  <path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM6 9h2v9H6V9zm-1 12h14l1-11H4l1 11z"/>
                </svg>
              </button>
            </div>
            <p v-if="!ours.length" class="muted empty">пусто</p>
          </div>
        </section>

        <section class="col theirs-col">
          <header class="col-head">
            <h3>Чужие</h3>
            <span class="count">{{ theirs.length }}</span>
          </header>
          <div class="col-list">
            <div v-for="reg in theirs" :key="reg.id" class="item">
              <button type="button" class="ghost compact move" title="В свои" @click="move(reg, 'ours')">←</button>
              <RouterLink
                class="nick"
                :to="`/player/${encodeURIComponent(reg.player_name)}`"
                @click="regs.togglePanel(false)"
              >{{ reg.player_name }}</RouterLink>
              <button type="button" class="icon-btn del" title="Удалить" @click="regs.remove(reg.player_name)">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  <path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM6 9h2v9H6V9zm-1 12h14l1-11H4l1 11z"/>
                </svg>
              </button>
            </div>
            <p v-if="!theirs.length" class="muted empty">пусто</p>
          </div>
        </section>
      </div>
    </aside>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRegsStore } from '../stores/regs';

const regs = useRegsStore();
const name = ref('');
const side = ref('ours');
const busy = ref(false);
const statusMsg = ref('');

const ours = computed(() => regs.regs.filter((r) => r.side === 'ours'));
const theirs = computed(() => regs.regs.filter((r) => r.side === 'theirs'));

function parseNames(raw) {
  return String(raw || '')
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function add() {
  const list = parseNames(name.value);
  if (!list.length || busy.value) return;
  busy.value = true;
  statusMsg.value = '';
  regs.error = '';
  try {
    const res = await regs.bulkUpsert(list, side.value);
    const a = res?.addedCount ?? 0;
    const s = res?.skippedCount ?? 0;
    if (a === 0 && s > 0) {
      statusMsg.value = `Все ${s} уже в регах — ничего не добавлено`;
    } else if (s > 0) {
      statusMsg.value = `Добавлено: ${a} · пропущено (уже есть): ${s}`;
    } else {
      statusMsg.value = `Добавлено: ${a}`;
    }
    name.value = '';
  } catch (e) {
    regs.error = e.message || String(e);
  } finally {
    busy.value = false;
  }
}

async function move(reg, nextSide) {
  await regs.upsert(reg.player_name, nextSide);
}
</script>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 90;
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: min(560px, 100vw);
  height: 100%;
  max-height: 100dvh;
  background: #121722;
  border-left: 1px solid var(--line);
  z-index: 95;
  padding: 14px 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  overflow: hidden;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  flex-shrink: 0;
}
.head h2 {
  margin: 0;
  font-size: 1.1rem;
}
.sub {
  margin: 4px 0 0;
  font-size: 0.78rem;
  line-height: 1.35;
  max-width: 42ch;
}
.add {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  padding: 10px;
  border: 1px solid #334155;
  border-radius: 12px;
  background: #0b1220;
}
.add-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #cbd5e1;
}
.add-list {
  width: 100%;
  min-width: 0;
  resize: vertical;
  min-height: 64px;
  max-height: 140px;
  padding: 8px 10px;
  font-size: 0.88rem;
  line-height: 1.4;
  box-sizing: border-box;
  font-family: inherit;
  color: #f1f5f9;
  background: #1a2336;
  border: 1px solid #4b5d7a;
  border-radius: 10px;
  caret-color: #93c5fd;
}
.add-list::placeholder {
  color: #94a3b8;
  opacity: 1;
}
.add-list:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
}
.add-hint {
  margin: 0;
  font-size: 0.72rem;
  color: #94a3b8;
  line-height: 1.3;
}
.add-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.add-row select {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  font-size: 0.85rem;
  color: #e2e8f0;
  background: #1a2336;
  border: 1px solid #4b5d7a;
  border-radius: 10px;
}
.status-msg {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.3;
  color: #86efac;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  min-height: 0;
  flex: 1;
}
.col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #0c111a;
  overflow: hidden;
}
.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.col-head h3 {
  margin: 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.ours-col .col-head h3 { color: var(--ours); }
.theirs-col .col-head h3 { color: var(--theirs); }
.count {
  font-size: 0.75rem;
  color: var(--muted);
  background: #152238;
  border-radius: 999px;
  padding: 1px 7px;
}
.col-list {
  overflow: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  flex: 1;
}
.item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 4px;
  align-items: center;
  padding: 6px 6px;
  border-radius: 8px;
  border: 1px solid transparent;
}
.theirs-col .item {
  grid-template-columns: auto minmax(0, 1fr) auto;
}
.item:hover {
  background: #161c28;
  border-color: var(--line);
}
.nick {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
  color: var(--text);
  text-decoration: none;
}
.nick:hover { color: var(--accent); }
.move {
  padding: 2px 7px;
  font-size: 0.85rem;
  line-height: 1.2;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 6px;
  background: transparent;
  border: 1px solid #4a5568;
  color: #94a3b8;
  line-height: 0;
}
.icon-btn.del {
  border-color: #7f1d1d;
  color: #fca5a5;
}
.icon-btn.del:hover {
  border-color: #fb7185;
  color: #fecdd3;
  background: rgba(127, 29, 29, 0.25);
}
.empty {
  margin: 12px 8px;
  font-size: 0.8rem;
  text-align: center;
}
.compact {
  padding: 5px 10px;
  font-size: 0.82rem;
  border-radius: 8px;
}
@media (max-width: 560px) {
  .drawer { width: 100%; }
  .cols { grid-template-columns: 1fr; }
  .add-row { flex-direction: column; align-items: stretch; }
}
</style>
