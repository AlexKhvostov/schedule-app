import { limitTonePaint } from "../schedule/capacity";
import type { ScheduleVariant } from "../data/slots";
import type { ShiftRun } from "./myShifts";
import { visibleWorkRuns, workHalfSlots, workHourSegments, workTrackProgress } from "../schedule/workHours";

const WIDTH = 680;
const PAD = 12;
const DATE_W = 54;
const HOUR_H = 28;
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
    light,
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
  runs: CalendarShiftRun[];
  usedColumns: { label: string; limit: string; variant: ScheduleVariant }[];
  today: number | null;
  dimPast: boolean;
  nowAt: number;
  kicker: string;
  meta: string;
  dayLabel: string;
  workHours: number[];
};

export type CalendarShiftRun = ShiftRun & {
  label: string;
  rawLimit: string;
  variant: ScheduleVariant;
};

function variantFont(variant: ScheduleVariant, size: number) {
  return variant === "nitro"
    ? `800 ${size}px JetBrains Mono, IBM Plex Mono, monospace`
    : `italic 750 ${size}px IBM Plex Sans, Inter, sans-serif`;
}

function mineTone(limit: string) {
  if (limit === "25") return "#4ADE80";
  return limitTonePaint(limit);
}

function limitInk() {
  return document.documentElement.dataset.uiTheme === "light" ? "#ffffff" : "#071014";
}

function slotX(trackW: number, visibleSlot: number, slotCount: number) {
  return (trackW * visibleSlot) / slotCount;
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
  const { title, tag, days, runs, usedColumns, today, dimPast, nowAt, kicker, meta, dayLabel, workHours } = opts;
  const visibleSlotCount = workHalfSlots(workHours).length;
  const rowH = 22;
  const height = PAD + TITLE_H + HOUR_H + days.length * rowH + FOOT_H + PAD;
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
  const sheetH = HOUR_H + days.length * rowH;
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

  for (const segment of workHourSegments(workHours)) {
    const x = trackX + slotX(trackW, segment.visibleStart, visibleSlotCount);
    const w = (trackW * segment.span) / visibleSlotCount;
    ctx.strokeStyle = segment.hour === 5 || segment.hour === 11 || segment.hour === 17 ? paint.lineStrong : paint.line;
    ctx.beginPath();
    ctx.moveTo(x + w + 0.5, sheetY);
    ctx.lineTo(x + w + 0.5, sheetY + sheetH);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.font = "650 9px JetBrains Mono, IBM Plex Mono, monospace";
    ctx.fillStyle = paint.muted;
    ctx.fillText(String(segment.hour), x + w / 2, sheetY + 10);
    ctx.textAlign = "left";
  }

  const byDay = new Map<number, CalendarShiftRun[]>();
  for (const run of runs) {
    const list = byDay.get(run.day) ?? [];
    list.push(run);
    byDay.set(run.day, list);
  }

  days.forEach((day, idx) => {
    const y = sheetY + HOUR_H + idx * rowH;
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
      roundRect(ctx, sheetX + 3, y + 2, DATE_W - 7, rowH - 4, 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    for (const run of byDay.get(day.d) ?? []) {
      for (const segment of visibleWorkRuns(run.start, run.end, workHours)) {
        const len = segment.span;
        const x = trackX + slotX(trackW, segment.visibleStart, visibleSlotCount);
        const w = Math.max(2, (trackW * len) / visibleSlotCount);
        const cy = y + 3;
        const past = runPast(day.d, segment.end, today, nowAt);
        ctx.save();
        if (dimPast && past) {
          ctx.filter = "saturate(0.12) grayscale(0.62)";
          ctx.globalAlpha = 0.68;
        }
        ctx.fillStyle = mineTone(run.rawLimit);
        roundRect(ctx, x, cy, w, CHIP_H, 2);
        ctx.fill();
        if (len > 1) {
          ctx.beginPath();
          roundRect(ctx, x, cy, w, CHIP_H, 2);
          ctx.clip();
          ctx.strokeStyle = limitInk();
          ctx.lineWidth = 1;
          for (let i = 1; i < len; i += 1) {
            if ((segment.start + i) % 2 !== 0) continue;
            const tx = x + (w * i) / len;
            ctx.globalAlpha = dimPast && past ? 0.2 : 0.22;
            ctx.beginPath();
            ctx.moveTo(tx + 0.5, cy + 2);
            ctx.lineTo(tx + 0.5, cy + CHIP_H - 2);
            ctx.stroke();
          }
        }
        ctx.restore();
        ctx.save();
        ctx.fillStyle = dimPast && past ? "#ffffff" : limitInk();
        ctx.shadowColor = paint.light || (dimPast && past) ? "rgb(7 16 20 / 0.92)" : "rgb(255 255 255 / 0.55)";
        ctx.shadowBlur = 2;
        ctx.font = variantFont(run.variant, len <= 2 ? 8 : 10);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(len >= 6 ? run.label : run.label.slice(0, 1), x + w / 2, cy + CHIP_H / 2);
        ctx.restore();
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
      }
    }
  });

  const nowProgress = workTrackProgress(Math.floor(nowAt), nowAt % 1, workHours);
  if (dimPast && today != null && nowProgress != null) {
    const todayIdx = days.findIndex((day) => day.d === today);
    if (todayIdx >= 0) {
      const x = trackX + trackW * nowProgress;
      const y = sheetY + HOUR_H + todayIdx * rowH;
      ctx.fillStyle = paint.now;
      ctx.fillRect(x - 1.5, y, 3, rowH);
    }
  }

  const footY = sheetY + sheetH + 14;
  let legendX = PAD;
  for (const column of usedColumns) {
    ctx.fillStyle = mineTone(column.limit);
    ctx.beginPath();
    ctx.arc(legendX + 4, footY + 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paint.muted;
    ctx.font = variantFont(column.variant, 11);
    const label = column.label;
    ctx.fillText(label, legendX + 14, footY);
    legendX += ctx.measureText(label).width + 28;
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
