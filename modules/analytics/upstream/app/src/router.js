import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './views/HomeView.vue';
import PointsView from './views/PointsView.vue';
import YearlyView from './views/YearlyView.vue';
import SpeedView from './views/SpeedView.vue';
import HeatmapView from './views/HeatmapView.vue';
import PlayersView from './views/PlayersView.vue';
import ProfileHubView from './views/ProfileHubView.vue';
import PlayerView from './views/PlayerView.vue';
import AdminView from './views/AdminView.vue';

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        { path: '/', redirect: '/points' },
        { path: '/home', name: 'home', component: HomeView, meta: { screen: 'home', title: 'Home' } },
        { path: '/points', name: 'points', component: PointsView, meta: { screen: 'points', title: 'Очки за день', wide: true } },
        { path: '/profile', name: 'profile', component: ProfileHubView, meta: { screen: 'profile', title: 'Профиль игрока' } },
        { path: '/player/:name', name: 'player', component: PlayerView, meta: { screen: 'profile', title: 'Профиль игрока' } },
        { path: '/speed', name: 'speed', component: SpeedView, meta: { screen: 'speed', title: 'Скорость' } },
        { path: '/heatmap', name: 'heatmap', component: HeatmapView, meta: { screen: 'heatmap', title: 'Плотность', wide: true } },
        { path: '/admin', name: 'admin', component: AdminView, meta: { screen: 'admin', title: 'Админка', hideFilters: true } },
        { path: '/yearly', name: 'yearly', component: YearlyView, meta: { screen: 'yearly', title: 'Yearly' } },
        { path: '/players', name: 'players', component: PlayersView, meta: { screen: 'players', title: 'Players' } }
    ]
});

export default router;
