/**
 * Яндекс.Метрика (опционально).
 * Включается, если при сборке задан VITE_YANDEX_METRIKA_ID.
 */

const counterId = String(import.meta.env.VITE_YANDEX_METRIKA_ID || '').trim();

export function metrikaEnabled() {
  return Boolean(counterId && /^\d+$/.test(counterId));
}

export function initMetrika() {
  if (!metrikaEnabled()) return;

  const id = Number(counterId);
  /* eslint-disable no-param-reassign */
  (function (m, e, t, r, i, k, a) {
    m[i] =
      m[i] ||
      function (...args) {
        (m[i].a = m[i].a || []).push(args);
      };
    m[i].l = 1 * new Date();
    for (let j = 0; j < e.scripts.length; j++) {
      if (e.scripts[j].src === r) return;
    }
    k = e.createElement(t);
    a = e.getElementsByTagName(t)[0];
    k.async = 1;
    k.src = r;
    a.parentNode.insertBefore(k, a);
  })(window, document, 'script', `https://mc.yandex.ru/metrika/tag.js?id=${id}`, 'ym');
  /* eslint-enable no-param-reassign */

  window.ym(id, 'init', {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: 'dataLayer',
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true
  });

  if (!document.getElementById('ym-noscript')) {
    const ns = document.createElement('noscript');
    ns.id = 'ym-noscript';
    ns.innerHTML = `<div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt="" /></div>`;
    document.body.appendChild(ns);
  }
}

/** Хит при смене SPA-маршрута */
export function hitMetrika(url = window.location.href) {
  if (!metrikaEnabled() || typeof window.ym !== 'function') return;
  window.ym(Number(counterId), 'hit', url);
}
