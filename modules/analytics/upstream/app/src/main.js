import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { hitMetrika, initMetrika } from './utils/metrika';
import './styles.css';

initMetrika();

router.afterEach(() => {
  hitMetrika(window.location.href);
});

createApp(App).use(createPinia()).use(router).mount('#app');
