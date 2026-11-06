/** Испанское время лидербордов maxwin (сутки обнуляются в полночь ES). */
export const SPAIN_TZ = 'Europe/Madrid';

/**
 * @param {Date} [date]
 * @returns {string} YYYY-MM-DD в Испании
 */
export function spainDateOnly(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: SPAIN_TZ });
}

/**
 * Разбор scraped_at (UTC, без зоны) → Date
 * @param {string} utcAt
 */
export function parseUtc(utcAt) {
  const raw = String(utcAt || '').trim().replace('T', ' ');
  if (!raw) return null;
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(raw) ? raw.replace(' ', 'T') : `${raw.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * UTC scraped_at → бакет минуты в Испании «YYYY-MM-DD HH:mm»
 * @param {string} utcAt
 */
export function utcToSpainMinute(utcAt) {
  const d = parseUtc(utcAt);
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SPAIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** Округлить минуту вниз к шагу slotMin (по умолчанию 6). */
export function floorSpainMinute(spainMinuteKey, slotMin = 6) {
  const m = spainMinuteKey.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return spainMinuteKey;
  const day = m[1];
  let total = Number(m[2]) * 60 + Number(m[3]);
  total = Math.floor(total / slotMin) * slotMin;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${day} ${hh}:${mm}`;
}

/**
 * Полные сутки слотов в Испании (00:00 … 23:54 при шаге 6).
 * @param {string} dayIso YYYY-MM-DD
 * @param {number} [slotMin]
 */
export function spainDaySlots(dayIso, slotMin = 6) {
  const slots = [];
  for (let t = 0; t < 24 * 60; t += slotMin) {
    const hh = String(Math.floor(t / 60)).padStart(2, '0');
    const mm = String(t % 60).padStart(2, '0');
    slots.push(`${dayIso} ${hh}:${mm}`);
  }
  return slots;
}

/** Текущий слот «YYYY-MM-DD HH:mm» в Испании (с floor). */
export function spainNowSlot(slotMin = 6) {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SPAIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return floorSpainMinute(`${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`, slotMin);
}

export function formatSpainClock(date = new Date()) {
  const time = date.toLocaleTimeString('ru-RU', {
    timeZone: SPAIN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const day = date.toLocaleDateString('ru-RU', {
    timeZone: SPAIN_TZ,
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  return { time, day, dateIso: spainDateOnly(date) };
}
