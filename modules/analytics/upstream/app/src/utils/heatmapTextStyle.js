/**
 * Яркость подписи carry / Σ: мало → серый, много → белый.
 * Контраст на зелёном/чёрном — тонкая тёмная обводка.
 * Мягкое белое свечение — только после 200 очков (не размывает мелкие значения).
 *
 * @param {number|null|undefined} points
 * @param {number} scaleMax — опорный максимум (обычно max carry / dayMax на карте)
 * @returns {Record<string, string>}
 */
export function pointsBrightnessStyle(points, scaleMax = 100) {
  const v = Math.max(0, Number(points) || 0);
  const max = Math.max(1, Number(scaleMax) || 1);
  const t = v <= 0 ? 0 : Math.min(1, v / max);

  // Пол: холодный серый, но непрозрачный; потолок — резкий белый
  const g = Math.round(158 + t * 97); // ~158 → 255
  const a = 0.88 + t * 0.12;

  // Резкая 1px-обводка (не blur). На малых значениях чуть сильнее.
  const strokeA = (0.72 + (1 - t) * 0.18).toFixed(3);
  const stroke = `rgba(6, 10, 16, ${strokeA})`;
  const outline = [
    `0 0 0.6px ${stroke}`,
    `0 1px 0 ${stroke}`,
    `0 -1px 0 ${stroke}`,
    `1px 0 0 ${stroke}`,
    `-1px 0 0 ${stroke}`
  ];

  // Мягкое свечение только после 200 очков
  if (v >= 200) {
    const glowT = Math.min(1, (v - 200) / Math.max(1, max - 200));
    const blur = (1.2 + glowT * 2.4).toFixed(1);
    const glowA = (0.14 + glowT * 0.28).toFixed(3);
    outline.push(`0 0 ${blur}px rgba(255, 255, 255, ${glowA})`);
  }

  return {
    color: `rgba(${g}, ${g}, ${Math.min(255, g + 3)}, ${a.toFixed(3)})`,
    textShadow: outline.join(', '),
    fontWeight: t > 0.6 ? '800' : '700'
  };
}

/**
 * Синяя тепловая шкала для столбца Σ (итог дня).
 * Мало → приглушённый синий, много → яркий голубой/белый-синий.
 * @param {number|null|undefined} points
 * @param {number} scaleMax
 */
export function daySumBlueHeatStyle(points, scaleMax = 100) {
  const v = Math.max(0, Number(points) || 0);
  const max = Math.max(1, Number(scaleMax) || 1);
  if (v <= 0) {
    return {
      color: 'rgba(100, 120, 150, 0.55)',
      background: 'rgba(56, 100, 160, 0.08)',
      textShadow: 'none',
      fontWeight: '650'
    };
  }
  const t = Math.min(1, v / max);
  // dim slate-blue → bright sky
  const r = Math.round(90 + t * 90);   // 90 → 180
  const g = Math.round(130 + t * 90);  // 130 → 220
  const b = Math.round(180 + t * 75);  // 180 → 255
  const a = 0.72 + t * 0.28;
  const bgA = 0.1 + t * 0.38;
  const stroke = `rgba(8, 14, 28, ${(0.55 + (1 - t) * 0.2).toFixed(3)})`;
  const outline = [
    `0 1px 0 ${stroke}`,
    `0 -1px 0 ${stroke}`,
    `1px 0 0 ${stroke}`,
    `-1px 0 0 ${stroke}`
  ];
  if (t > 0.55) {
    outline.push(`0 0 ${(1 + t * 2).toFixed(1)}px rgba(125, 211, 252, ${(0.12 + t * 0.22).toFixed(3)})`);
  }
  return {
    color: `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`,
    background: `rgba(56, 140, 220, ${bgA.toFixed(3)})`,
    textShadow: outline.join(', '),
    fontWeight: t > 0.5 ? '800' : '700'
  };
}

/**
 * Макс. carry / dayMax среди строк heatmap (для шкалы яркости цифр).
 * @param {Array<{ dayMax?: number|null, hours?: Array<{ max_points_carry?: number|null }> }>} rows
 */
export function maxCarryScale(rows) {
  let m = 0;
  for (const row of rows || []) {
    const dayMax = Number(row?.dayMax);
    if (Number.isFinite(dayMax) && dayMax > m) m = dayMax;
    for (const cell of row?.hours || []) {
      const c = Number(cell?.max_points_carry);
      if (Number.isFinite(c) && c > m) m = c;
    }
  }
  return Math.max(1, m);
}

/**
 * Цвет (+Δ): от силы прироста ячейки.
 * Ярче mint + тёмная обводка, чтобы не сливаться с зелёной заливкой.
 * @param {number|null|undefined} diff
 * @param {number} scaleMax
 */
export function deltaCellTextStyle(diff, scaleMax = 80) {
  const v = Math.max(0, Number(diff) || 0);
  const max = Math.max(1, Number(scaleMax) || 80);
  const stroke = 'rgba(6, 10, 16, 0.78)';
  const outline = [
    `0 1px 0 ${stroke}`,
    `0 -1px 0 ${stroke}`,
    `1px 0 0 ${stroke}`,
    `-1px 0 0 ${stroke}`
  ].join(', ');

  if (v <= 0) {
    return {
      color: 'rgba(148, 163, 184, 0.82)',
      textShadow: outline,
      fontWeight: '650'
    };
  }
  const t = Math.min(1, v / max);
  // яркий mint; на малом приросте тоже читаемый
  const a = 0.88 + t * 0.12;
  const g = Math.round(200 + t * 39); // ~200 → 239
  return {
    color: `rgba(110, ${g}, 172, ${a.toFixed(3)})`,
    textShadow: outline,
    fontWeight: '700'
  };
}
