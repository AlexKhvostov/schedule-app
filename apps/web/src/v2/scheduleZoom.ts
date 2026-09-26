export const MOBILE_EDIT_PERCENT_MIN = 75;
export const MOBILE_CELL_MAX = 32;
export const MOBILE_CELL_MIN = 3;
export function clampScheduleCellWidth(value: number) {
  return Math.max(MOBILE_CELL_MIN, Math.min(MOBILE_CELL_MAX, value));
}

export function scheduleCellGap(cellWidth: number) {
  return cellWidth * 0.15;
}

export function scheduleCellStride(cellWidth: number) {
  return cellWidth + scheduleCellGap(cellWidth);
}

export function scheduleZoomScrollLeft(contentHalf: number, cellWidth: number, fixedWidth: number, focalX: number) {
  return Math.max(0, fixedWidth + contentHalf * scheduleCellStride(cellWidth) - focalX);
}

export function fitScheduleCellWidth(viewportWidth: number, fixedWidth = 70, safety = 16) {
  return clampScheduleCellWidth((viewportWidth - fixedWidth - safety) / (48 + 47 * 0.15));
}

export function scheduleZoomCanEdit(cellWidth: number) {
  return Math.round((cellWidth / 20) * 100) >= MOBILE_EDIT_PERCENT_MIN;
}

export function scheduleZoomPercent(cellWidth: number) {
  return Math.round((cellWidth / 20) * 100);
}

export function stepScheduleCellWidth(cellWidth: number, direction: -1 | 1, fitWidth?: number) {
  const percent = Math.round(((cellWidth / 20) * 100) * 1000) / 1000;
  const fitPercent = fitWidth === undefined ? undefined : (fitWidth / 20) * 100;
  const roundedPercent = direction > 0
    ? Math.floor(percent / 10) * 10 + 10
    : Math.ceil(percent / 10) * 10 - 10;
  const fitIsNext = fitPercent !== undefined && (direction > 0
    ? fitPercent > percent + 0.01 && fitPercent < roundedPercent
    : fitPercent < percent - 0.01 && fitPercent > roundedPercent);
  const nextPercent = fitIsNext ? fitPercent : roundedPercent;
  return clampScheduleCellWidth((nextPercent / 100) * 20);
}
