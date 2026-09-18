import { limitTonePaint } from "../schedule/capacity";
import type { ShiftRun } from "./myShifts";

const SLOT_COUNT = 48;
const WIDTH = 680;
const PAD = 12;
const DATE_W = 54;
const HOUR_H = 28;
const ROW_H = 22;
const CHIP_H = 16;
const TITLE_H = 50;
const FOOT_H = 34;
const DPR = 2;

function cssVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function themePaint() {
  const light = document.documentElement.dataset.uiTheme === "light";
  const border = cssVar("--border", light ? "#d5dbe3" : "#1e2330");
  return {
    page: cssVar("--header", light ? "#ffffff" : "#111620"),
    card: cssVar("--card", light ? "#ffffff" : "#151a24"),
    hours: cssVar("--muted", light ? "#e8ecf1" : "#1e2330"),
    text: cssVar("--foreground", light ? "#111620" : "#f4f5f7"),
    muted: cssVar("--muted-foreground", light ? "#5c6570" : "#9ca3af"),
    cyan: cssVar("--ring", light ? "#0891b2" : "#22d3ee"),
    weekend: light ? "#9a5b16" : "#e4c9a4",
    line: border,
    lineStrong: border,
    now: cssVar("--now", "#e11d2e"),
  };
}

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
  dimPast: boolean;
  nowAt: number;
  kicker: string;
  meta: string;
  dayLabel: string;
};

function mineTone(limit: string) {
  if (limit === "25") return "#4ADE80";
  return limitTonePaint(limit);
}

function limitInk(limit: string) {
  return limit === "25" ? "#14532d" : "#071014";
}

function slotX(trackW: number, slot: number) {
  return (trackW * slot) / SLOT_COUNT;
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

function runPast(day: number, end: number, today: number | null, nowAt: number) {
  if (today == null) return false;
  if (day < today) return true;
  if (day > today) return false;
  return end <= nowAt;
}

export async function downloadCalendarJpeg(opts: Opts) {
  await document.fonts.ready;
  const { title, tag, days, runs, usedLimits, today, dimPast, nowAt, kicker, meta, dayLabel } = opts;
  const height = PAD + TITLE_H + HOUR_H + days.length * ROW_H + FOOT_H + PAD;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * DPR;
  canvas.height = height * DPR;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(DPR, DPR);
  const paint = themePaint();
  ctx.fillStyle = paint.page;
  ctx.fillRect(0, 0, WIDTH, height);

  ctx.textBaseline = "top";
  ctx.fillStyle = paint.text;
  ctx.font = "650 16px Inter, IBM Plex Sans, sans-serif";
  ctx.fillText(kicker, PAD, PAD);

  let infoX = PAD;
  ctx.fillStyle = paint.text;
  ctx.font = "600 13px Inter, IBM Plex Sans, sans-serif";
  ctx.fillText(title, infoX, PAD + 24);
  infoX += ctx.measureText(title).width + 10;
  ctx.fillStyle = paint.cyan;
  ctx.font = "650 11px JetBrains Mono, IBM Plex Mono, monospace";
  ctx.fillText(tag, infoX, PAD + 26);
  infoX += ctx.measureText(tag).width + 12;
  ctx.fillStyle = paint.muted;
  ctx.font = "12px Inter, IBM Plex Sans, sans-serif";
  ctx.fillText(meta.replace(`${tag} · `, ""), infoX, PAD + 25);

  const sheetX = PAD;
  const sheetY = PAD + TITLE_H;
  const sheetW = WIDTH - PAD * 2;
  const sheetH = HOUR_H + days.length * ROW_H;
  const trackX = sheetX + DATE_W;
  const trackW = sheetW - DATE_W;

  roundRect(ctx, sheetX, sheetY, sheetW, sheetH, 8);
  ctx.fillStyle = paint.card;
  ctx.fill();
  ctx.strokeStyle = paint.lineStrong;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = paint.hours;
  ctx.fillRect(sheetX, sheetY, sheetW, HOUR_H);
  ctx.strokeStyle = paint.lineStrong;
  ctx.beginPath();
  ctx.moveTo(sheetX, sheetY + HOUR_H + 0.5);
  ctx.lineTo(sheetX + sheetW, sheetY + HOUR_H + 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(trackX + 0.5, sheetY);
  ctx.lineTo(trackX + 0.5, sheetY + sheetH);
  ctx.stroke();

  ctx.fillStyle = paint.muted;
  ctx.font = "600 10px Inter, IBM Plex Sans, sans-serif";
  ctx.fillText(dayLabel.toUpperCase(), sheetX + 8, sheetY + 6);
  ctx.font = "600 9px JetBrains Mono, IBM Plex Mono, monospace";
  ctx.fillText("CET", sheetX + 8, sheetY + 17);

  for (let h = 0; h < 24; h += 1) {
    const x = trackX + slotX(trackW, h * 2);
    const w = slotX(trackW, 2);
    ctx.strokeStyle = h === 5 || h === 11 || h === 17 ? paint.lineStrong : paint.line;
    ctx.beginPath();
    ctx.moveTo(x + w + 0.5, sheetY);
    ctx.lineTo(x + w + 0.5, sheetY + sheetH);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.font = "650 9px JetBrains Mono, IBM Plex Mono, monospace";
    ctx.fillStyle = paint.muted;
    ctx.fillText(String(h), x + w / 2, sheetY + 10);
    ctx.textAlign = "left";
  }

  const byDay = new Map<number, ShiftRun[]>();
  for (const run of runs) {
    const list = byDay.get(run.day) ?? [];
    list.push(run);
    byDay.set(run.day, list);
  }

  days.forEach((day, idx) => {
    const y = sheetY + HOUR_H + idx * ROW_H;
    ctx.strokeStyle = paint.line;
    ctx.beginPath();
    ctx.moveTo(sheetX, y + 0.5);
    ctx.lineTo(sheetX + sheetW, y + 0.5);
    ctx.stroke();

    const isToday = today === day.d;
    ctx.font = `${isToday ? 600 : 400} 12px JetBrains Mono, IBM Plex Mono, monospace`;
    ctx.fillStyle = isToday ? paint.cyan : day.weekend ? paint.weekend : paint.text;
    ctx.fillText(`${String(day.d).padStart(2, "0")} ${day.wd}`, sheetX + 8, y + 5);
    if (isToday) {
      ctx.strokeStyle = paint.cyan;
      ctx.lineWidth = 1.5;
      roundRect(ctx, sheetX + 3, y + 2, DATE_W - 7, ROW_H - 4, 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    for (const run of byDay.get(day.d) ?? []) {
      const len = run.end - run.start;
      const x = trackX + slotX(trackW, run.start);
      const w = Math.max(2, slotX(trackW, len));
      const cy = y + (ROW_H - CHIP_H) / 2;
      const past = runPast(day.d, run.end, today, nowAt);
      ctx.save();
      if (dimPast && past) {
        ctx.filter = "saturate(0.12) grayscale(0.62)";
        ctx.globalAlpha = 0.68;
      }
      ctx.fillStyle = mineTone(run.limit);
      roundRect(ctx, x, cy, w, CHIP_H, 2);
      ctx.fill();
      if (len > 1) {
        ctx.beginPath();
        roundRect(ctx, x, cy, w, CHIP_H, 2);
        ctx.clip();
        ctx.strokeStyle = limitInk(run.limit);
        ctx.lineWidth = 1;
        for (let i = 1; i < len; i += 1) {
          const tx = x + (w * i) / len;
          ctx.globalAlpha = dimPast && past ? 0.45 : (run.start + i) % 2 === 0 ? 0.5 : 0.28;
          ctx.beginPath();
          ctx.moveTo(tx + 0.5, cy + 2);
          ctx.lineTo(tx + 0.5, cy + CHIP_H - 2);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.save();
      if (dimPast && past) {
        ctx.filter = "saturate(0.12) grayscale(0.62)";
        ctx.globalAlpha = 0.68;
      }
      ctx.fillStyle = limitInk(run.limit);
      ctx.font = len <= 2 ? "700 8px JetBrains Mono, IBM Plex Mono, monospace" : "700 10px JetBrains Mono, IBM Plex Mono, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(len >= 6 ? `NL ${run.limit}` : run.limit, x + w / 2, y + ROW_H / 2);
      ctx.restore();
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    }
  });

  if (dimPast && today != null) {
    const todayIdx = days.findIndex((day) => day.d === today);
    if (todayIdx >= 0) {
      const x = trackX + slotX(trackW, nowAt);
      const y = sheetY + HOUR_H + todayIdx * ROW_H;
      ctx.fillStyle = paint.now;
      ctx.fillRect(x - 1.5, y, 3, ROW_H);
    }
  }

  const footY = sheetY + sheetH + 14;
  ctx.font = "600 11px JetBrains Mono, IBM Plex Mono, monospace";
  let legendX = PAD;
  for (const limit of usedLimits) {
    ctx.fillStyle = mineTone(limit);
    ctx.beginPath();
    ctx.arc(legendX + 4, footY + 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paint.muted;
    ctx.fillText(`NL ${limit}`, legendX + 14, footY);
    legendX += ctx.measureText(`NL ${limit}`).width + 28;
  }

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("jpeg"));
        return;
      }
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${tag}-${opts.year}-${String(opts.monthIndex + 1).padStart(2, "0")}.jpg`;
      link.click();
      URL.revokeObjectURL(href);
      resolve();
    }, "image/jpeg", 0.93);
  });
}
