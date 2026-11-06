import { defineStore } from 'pinia';
import { api } from '../api';

export const useRegsStore = defineStore('regs', {
    state: () => ({
        regs: [],
        open: false,
        loading: false,
        error: ''
    }),
    getters: {
        map(state) {
            return Object.fromEntries(state.regs.map((r) => [r.player_name, r]));
        },
        oursCount(state) {
            return state.regs.filter((r) => r.side === 'ours').length;
        },
        theirsCount(state) {
            return state.regs.filter((r) => r.side === 'theirs').length;
        }
    },
    actions: {
        async load() {
            this.loading = true;
            this.error = '';
            try {
                const data = await api.regs.list();
                this.regs = data.regs || [];
            } catch (error) {
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },
        async upsert(player_name, side = 'ours') {
            await api.regs.upsert({ player_name, side });
            await this.load();
        },
        /**
         * Пакетное добавление. Уже существующие ники пропускаются (side не меняется).
         * @returns {{ added: string[], skipped: string[], addedCount: number, skippedCount: number }}
         */
        async bulkUpsert(players, side = 'ours') {
            const data = await api.regs.bulk({ players, side });
            await this.load();
            return data;
        },
        async remove(player_name) {
            await api.regs.remove(player_name);
            await this.load();
        },
        togglePanel(force) {
            this.open = typeof force === 'boolean' ? force : !this.open;
        }
    }
});
