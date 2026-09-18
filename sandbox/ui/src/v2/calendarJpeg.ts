import { limitTone } from "../schedule/capacity";
import { R } from "./tokens";
import type { ShiftRun } from "./myShifts";

const SLOT_COUNT = 48;
const GAP_HALF = 1;
const GAP_HOUR = 3;
const GAP_TOTAL = 24 * GAP_HALF + 23 * GAP_HOUR;
const WIDTH = 1360;
const PAD = 20;
const DATE_W = 80;
const SLOT_END = 20;
const HOUR_H = 44;
const ROW_H = 22;
const CHIP_H = 16;
const TITLE_H = 70;
const DPR = 2;

type Day = { d: number; wd: string; weekend: boolean };

type Opts = {
  year: number;
  monthIndex: number;
  title: string;
  tag: string;
  days: Day[];
  runs: ShiftRun[];
  usedLimits: string[];
  today: number | null;
  mskOffset: number;
  kicker: string;
  meta: string;
  dayLabel: string;
  tzLabel: string;
};

function trackBox(trackW: number, start: number, len: number) {
  const last = start + len - 1;
  const padStart = Math.ceil(start / 2) * GAP_HALF + Math.floor(start / 2) * GAP_HOUR;
  const padBetween =
    (Math.ceil(last / 2) - Math.ceil(start / 2)) * GAP_HALF +
    (Math.floor(last / 2) - Math.floor(start / 2)) * GAP_HOUR;
  return {
    x: ((trackW - GAP_TOTAL) * start) / SLOT_COUNT + padStart,
    w: ((trackW - GAP_TOTAL) * len) / SLOT_COUNT + padBetween,
  };
}

function hourEdge(trackW: number, hour: number) {
  const box = trackBox(trackW, hour * 2, 2);
  return box.x + box.w + GAP_HOUR / 2;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export async function downloadCalendarJpeg(opts: Opts) {
  await document.fonts.ready;
  const { year, monthIndex, title, tag, days, runs, usedLimits, today, mskOffset, kicker, meta, dayLabel, tzLabel } = opts;
  const height = PAD + TITLE_H + HOUR_H + days.length * ROW_H + PAD;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * DPR;
  canvas.height = height * DPR;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(DPR, DPR);
  ctx.fillStyle = R.header;
  ctx.fillRect(0, 0, WIDTH, height);

  ctx.textBaseline = "top";
  ctx.fillStyle = R.faint;
  ctx.font = "600 11px Inter, IBM Plex Sans, sans-serif";
  ctx.fillText(kicker.toUpperCase(), PAD, PAD);
  ctx.fillStyle = R.text;
  ctx.font = "600 18px Inter, IBM Plex Sans, sans-serif";
  ctx.fillText(title, PAD, PAD + 18);
  ctx.fillStyle = R.muted;
  ctx.font = "12px Inter, IBM Plex Sans, sans-serif";
  ctx.fillText(meta, PAD, PAD + 42);

  let legendX = WIDTH - PAD;
  ctx.font = "600 11px JetBrains Mono, IBM Plex Mono, monospace";
  for (let i = usedLimits.length - 1; i >= 0; i -= 1) {
    const limit = usedLimits[i];
    const label = `NL ${limit}`;
    const tw = ctx.measureText(label).width;
    legendX -= tw;
    ctx.fillStyle = R.muted;
    ctx.fillText(label, legendX, PAD + 8);
    legendX -= 16;
    ctx.fillStyle = limitTone(limit);
    ctx.beginPath();
    ctx.arc(legendX + 4, PAD + 13, 4, 0, Math.PI * 2);
    ctx.fill();
    legendX -= 14;
  }

  const gridTop = PAD + TITLE_H;
  const trackX = PAD + DATE_W;
  const trackW = WIDTH - PAD - SLOT_END - trackX;

  ctx.fillStyle = R.faint;
  ctx.font = "600 10px Inter, IBM Plex Sans, sans-serif";
  ctx.fillText(dayLabel.toUpperCase(), PAD + 12, gridTop + 10);
  ctx.font = "600 9px JetBrains Mono, IBM Plex Mono, monospace";
  ctx.fillText(tzLabel, PAD + 12, gridTop + 24);

  for (let h = 0; h < 24; h += 1) {
    const box = trackBox(trackW, h * 2, 2);
    const night = h < 6 || h >= 22;
    if (night) {
      ctx.fillStyle = "rgba(245, 158, 11, 0.035)";
      ctx.fillRect(trackX + box.x, gridTop, box.w + (h < 23 ? GAP_HOUR : 0), HOUR_H + days.length * ROW_H);
    }
    ctx.textAlign = "center";
    ctx.font = "600 10px JetBrains Mono, IBM Plex Mono, monospace";
    ctx.fillStyle = night ? "#D1D5DB" : R.text;
    ctx.fillText(`${h}–${h + 1}`, trackX + box.x + box.w / 2, gridTop + 8);
    ctx.font = "500 9px JetBrains Mono, IBM Plex Mono, monospace";
    ctx.fillStyle = R.faint;
    const msk = (h + mskOffset) % 24;
    const mskNext = msk + 1 > 24 ? 24 : msk + 1;
    ctx.fillText(`${msk}–${mskNext}`, trackX + box.x + box.w / 2, gridTop + 22);
    ctx.textAlign = "left";
  }

  const byDay = new Map<number, ShiftRun[]>();
  for (const run of runs) {
    const list = byDay.get(run.day) ?? [];
    list.push(run);
    byDay.set(run.day, list);
  }

  days.forEach((day, idx) => {
    const y = gridTop + HOUR_H + idx * ROW_H;
    if (day.weekend) {
      ctx.fillStyle = R.weekend;
      ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW_H);
    }
    ctx.strokeStyle = R.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(WIDTH - PAD, y + 0.5);
    ctx.stroke();

    const isToday = today === day.d;
    ctx.font = `${isToday ? 600 : 400} 12px JetBrains Mono, IBM Plex Mono, monospace`;
    ctx.fillStyle = isToday ? R.cyan : day.weekend ? R.soft : R.text;
    ctx.fillText(`${String(day.d).padStart(2, "0")} ${day.wd}`, PAD + 12, y + 5);
    if (isToday) {
      ctx.strokeStyle = R.cyan;
      ctx.lineWidth = 1.5;
      roundRect(ctx, PAD + 4, y + 2, DATE_W - 8, ROW_H - 4, 2);
      ctx.stroke();
    }
  });

  ctx.strokeStyle = R.line2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, gridTop + HOUR_H + 0.5);
  ctx.lineTo(WIDTH - PAD, gridTop + HOUR_H + 0.5);
  ctx.stroke();

  for (let h = 0; h < 23; h += 1) {
    const x = trackX + hourEdge(trackW, h);
    ctx.beginPath();
    ctx.strokeStyle = h === 5 || h === 11 || h === 17 ? "rgba(201, 205, 212, 0.22)" : "rgba(201, 205, 212, 0.12)";
    ctx.lineWidth = 1;
    ctx.moveTo(x + 0.5, gridTop);
    ctx.lineTo(x + 0.5, gridTop + HOUR_H + days.length * ROW_H);
    ctx.stroke();
  }

  days.forEach((day, idx) => {
    const y = gridTop + HOUR_H + idx * ROW_H;
    for (const run of byDay.get(day.d) ?? []) {
      const box = trackBox(trackW, run.start, run.end - run.start);
      const len = run.end - run.start;
      ctx.fillStyle = limitTone(run.limit);
      roundRect(ctx, trackX + box.x, y + (ROW_H - CHIP_H) / 2, Math.max(2, box.w), CHIP_H, 2);
      ctx.fill();
      if (len >= 3) {
        ctx.fillStyle = run.limit === "25" ? "#111620" : "#071014";
        ctx.font = "700 10px JetBrains Mono, IBM Plex Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(len >= 6 ? `NL ${run.limit}` : run.limit, trackX + box.x + box.w / 2, y + ROW_H / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("jpeg"));
        return;
      }
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${tag}-${year}-${String(monthIndex + 1).padStart(2, "0")}.jpg`;
      link.click();
      URL.revokeObjectURL(href);
      resolve();
    }, "image/jpeg", 0.93);
  });
}
