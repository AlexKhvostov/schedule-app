import { defineStore } from 'pinia';

const STORAGE_KEY = 'v2.analytics.filters.period';

function todayMilan() {
    // Сутки лидерборда = испанские (Madrid ≈ Rome по смещению)
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

/** Дата Milan ± N дней (календарные). */
function addDaysMilan(isoDay, delta) {
    const [y, m, d] = String(isoDay).split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    utc.setUTCDate(utc.getUTCDate() + delta);
    const yy = utc.getUTCFullYear();
    const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(utc.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function yearWindow() {
    const to = todayMilan();
    return { dateFrom: addDaysMilan(to, -365), dateTo: to };
}

function defaultDraft() {
    const { dateFrom, dateTo } = yearWindow();
    return {
        dateFrom,
        dateTo,
        month: todayMilan().slice(0, 7),
        limits: ['50', '100', '250'], // 16-25 есть в UI, по умолчанию выкл.
        players: [],
        segment: 'all',
        topN: '10',
        topThreshold: '50'
    };
}

function readPersistedPeriod() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.dateFrom || !data?.dateTo) return null;
        return { dateFrom: data.dateFrom, dateTo: data.dateTo };
    } catch {
        return null;
    }
}

function writePersistedPeriod(dateFrom, dateTo) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ dateFrom, dateTo }));
    } catch {
        /* ignore quota */
    }
}

const SCREEN_FILTERS = {
    // Home: однодневка — смотрит «По» (dateTo)
    home: { date: true, dateMode: 'day-to', limits: true, limitsMode: 'multi', players: true, segment: true, topN: false },
    // Points: одна дата ES + один лимит; Top N / сортировка — у каждого графика локально
    points: { date: true, dateMode: 'day', limits: true, limitsMode: 'single', players: true, segment: true, topN: false },
    yearly: { date: 'locked-year', limits: true, limitsMode: 'multi', players: true, segment: true, topN: false },
    // Скорость: месяц + один лимит + аудитория; Top N — локально в разделе
    speed: {
        date: true,
        dateMode: 'month',
        limits: true,
        limitsMode: 'single',
        players: true,
        playersMode: 'multi',
        segment: true,
        topN: false
    },
    // Плотность: месяц + один лимит + аудитория / список ников (сумма прироста)
    heatmap: {
        date: true,
        dateMode: 'month',
        limits: true,
        limitsMode: 'single',
        players: true,
        playersMode: 'multi',
        segment: true,
        topN: false
    },
    players: { date: true, dateMode: 'range', limits: true, limitsMode: 'multi', players: true, segment: true, topN: false },
    // Профиль: месяц + один лимит + один игрок (без аудитории)
    profile: {
        date: true,
        dateMode: 'month',
        limits: true,
        limitsMode: 'single',
        players: true,
        playersMode: 'single',
        segment: false,
        topN: false,
        topThreshold: false
    },
    admin: { date: false, limits: false, players: false, segment: false, topN: false }
};

function initialState() {
    const draft = defaultDraft();
    const saved = readPersistedPeriod();
    if (saved) {
        draft.dateFrom = saved.dateFrom;
        draft.dateTo = saved.dateTo;
        // Месяц подтягиваем из сохранённой даты «По»
        if (saved.dateTo) {
            draft.month = String(saved.dateTo).slice(0, 7);
        }
    }
    // Стартовый экран — очки за день: дата всегда сегодня ES, не старый период из LS
    const today = todayMilan();
    draft.dateFrom = today;
    draft.dateTo = today;
    return {
        draft,
        applied: JSON.parse(JSON.stringify(draft)),
        screen: 'points',
        version: 1,
        loading: false
    };
}

function draftSnapshot(d) {
    return JSON.stringify({
        dateFrom: d?.dateFrom || '',
        dateTo: d?.dateTo || '',
        month: d?.month || '',
        limits: [...(d?.limits || [])].sort(),
        players: [...(d?.players || [])].sort(),
        segment: d?.segment || 'all',
        topN: String(d?.topN ?? ''),
        topThreshold: String(d?.topThreshold ?? '')
    });
}

export const useFiltersStore = defineStore('filters', {
    state: () => initialState(),
    getters: {
        active(state) {
            return state.applied || { ...state.draft };
        },
        screenConfig(state) {
            return SCREEN_FILTERS[state.screen] || SCREEN_FILTERS.home;
        },
        /** Есть несохранённые правки в draft относительно applied */
        isDirty(state) {
            return draftSnapshot(state.draft) !== draftSnapshot(state.applied);
        }
    },
    actions: {
        setScreen(screen) {
            this.screen = screen;
            const cfg = SCREEN_FILTERS[screen] || SCREEN_FILTERS.home;
            // Points — только один лимит: если было несколько, оставляем первый
            if (cfg.limitsMode === 'single' && this.draft.limits.length > 1) {
                this.draft.limits = [this.draft.limits[0]];
                if (this.applied?.limits?.length > 1) {
                    this.applied = {
                        ...this.applied,
                        limits: [this.draft.limits[0]]
                    };
                    this.version += 1;
                }
            }
            // Очки за день / Home: по умолчанию сегодня ES (не тащить старую дату из периода)
            if (cfg.dateMode === 'day' || cfg.dateMode === 'day-to') {
                const today = todayMilan();
                const changed =
                    this.draft.dateTo !== today ||
                    this.draft.dateFrom !== today ||
                    this.applied?.dateTo !== today ||
                    this.applied?.dateFrom !== today;
                this.draft.dateTo = today;
                this.draft.dateFrom = today;
                if (this.applied && changed) {
                    this.applied = {
                        ...this.applied,
                        dateFrom: today,
                        dateTo: today
                    };
                    this.version += 1;
                }
            }
            // Профиль / месяц: подтянуть month из dateTo если пусто
            if (cfg.dateMode === 'month') {
                if (!this.draft.month) {
                    this.draft.month = (this.draft.dateTo || todayMilan()).slice(0, 7);
                }
                if (this.applied && !this.applied.month) {
                    this.applied = { ...this.applied, month: this.draft.month };
                    this.version += 1;
                }
            }
        },
        beginLoading() {
            this.loading = true;
        },
        endLoading() {
            this.loading = false;
        },
        apply() {
            const cfg = SCREEN_FILTERS[this.screen] || SCREEN_FILTERS.home;
            if (cfg.limitsMode === 'single' && this.draft.limits.length > 1) {
                this.draft.limits = [this.draft.limits[0]];
            }
            // Режим одной даты: С = По
            if (cfg.dateMode === 'day' && this.draft.dateTo) {
                this.draft.dateFrom = this.draft.dateTo;
            }
            if ((cfg.dateMode === 'day' || cfg.dateMode === 'day-to') && this.draft.dateTo) {
                this.draft.dateFrom = this.draft.dateTo;
            }
            if (cfg.dateMode === 'month' && this.draft.month) {
                const m = String(this.draft.month).slice(0, 7);
                this.draft.month = m;
                this.draft.dateFrom = `${m}-01`;
                this.draft.dateTo = this.draft.dateTo?.startsWith(m)
                    ? this.draft.dateTo
                    : `${m}-28`;
            }
            if (cfg.playersMode === 'single' && this.draft.players.length > 1) {
                this.draft.players = [this.draft.players[0]];
            }
            this.applied = JSON.parse(JSON.stringify(this.draft));
            writePersistedPeriod(this.draft.dateFrom, this.draft.dateTo);
            // Спиннер только в контенте страницы — флаг loading ставят сами views
            this.version += 1;
        },
        /** Перезапросить данные с текущими applied-фильтрами (без перезагрузки страницы). */
        reload() {
            this.version += 1;
        },
        /** Сброс периода: range → ~год; day → сегодня; month → текущий месяц */
        resetPeriod() {
            const cfg = SCREEN_FILTERS[this.screen] || SCREEN_FILTERS.home;
            if (cfg.dateMode === 'month') {
                this.draft.month = todayMilan().slice(0, 7);
                this.apply();
                return;
            }
            if (cfg.dateMode === 'day' || cfg.dateMode === 'day-to') {
                const to = todayMilan();
                this.draft.dateTo = to;
                if (cfg.dateMode === 'day' || cfg.dateMode === 'day-to') {
                    this.draft.dateFrom = to;
                }
                this.apply();
                return;
            }
            const { dateFrom, dateTo } = yearWindow();
            this.draft.dateFrom = dateFrom;
            this.draft.dateTo = dateTo;
            this.apply();
        },
        reset() {
            this.draft = defaultDraft();
            const cfg = SCREEN_FILTERS[this.screen] || SCREEN_FILTERS.home;
            if (cfg.limitsMode === 'single') {
                this.draft.limits = [this.draft.limits[0] || '100'];
            }
            this.apply();
        },
        addPlayer(name) {
            const clean = String(name || '').trim();
            if (!clean) return;
            const cfg = SCREEN_FILTERS[this.screen] || SCREEN_FILTERS.home;
            if (cfg.playersMode === 'single') {
                this.draft.players = [clean];
                return;
            }
            if (!this.draft.players.includes(clean)) this.draft.players.push(clean);
        },
        removePlayer(name) {
            this.draft.players = this.draft.players.filter((p) => p !== name);
        },
        toggleLimit(code) {
            const cfg = SCREEN_FILTERS[this.screen] || SCREEN_FILTERS.home;
            if (cfg.limitsMode === 'single') {
                if (this.draft.limits.length === 1 && this.draft.limits[0] === code) return;
                this.draft.limits = [code];
                return;
            }
            if (this.draft.limits.includes(code)) {
                if (this.draft.limits.length === 1) return;
                this.draft.limits = this.draft.limits.filter((l) => l !== code);
            } else {
                this.draft.limits.push(code);
            }
        }
    }
});

export { todayMilan, yearWindow, addDaysMilan };
