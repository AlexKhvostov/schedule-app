import type { PointsPlayer, HourCell } from "../contracts/points";

// Ported from MaxWin heatmapTextStyle.js and PointsView.vue; font and fill use independent scales.
const positive = (value: number | null) => Math.max(0, value ?? 0);
export function carryScale(players: PointsPlayer[]): number {
  return players.reduce((max, p) => Math.max(max, p.dayMax, ...p.hours.map(c => c.carry ?? 0)), 1);
}
export function pointFill(cell: Pick<HourCell, "empty" | "delta" | "serverDown">): string {
  if (cell.serverDown) return "rgba(176, 52, 52, 0.14)";
  const v = positive(cell.delta);
  if (cell.empty || cell.delta === null || v <= 0) return "transparent";
  if (v <= 5) return `rgba(90, 140, 120, ${(0.1 + v / 5 * 0.18).toFixed(3)})`;
  return `rgba(62, 207, 142, ${(0.18 + Math.min(1, v / 80) * 0.82).toFixed(3)})`;
}
function outline(color: string, center = false) {
  return [...(center ? [`0 0 0.6px ${color}`] : []), `0 1px 0 ${color}`, `0 -1px 0 ${color}`, `1px 0 0 ${color}`, `-1px 0 0 ${color}`];
}
function inks(ink: string, light: string, shadow: string, weight: string): Record<string, string> {
  return { "--point-ink": ink, "--point-light-ink": light, "--point-shadow": shadow, fontWeight: weight };
}
export function carryInk(points: number | null, scale: number): Record<string, string> {
  const v=positive(points), max=Math.max(1,scale), t=Math.min(1,v/max), g=Math.round(158+t*97);
  const shadows=outline(`rgba(6, 10, 16, ${(0.72+(1-t)*0.18).toFixed(3)})`,true);
  if(v>=200){const glow=Math.min(1,(v-200)/Math.max(1,max-200));shadows.push(`0 0 ${(1.2+glow*2.4).toFixed(1)}px rgba(255, 255, 255, ${(0.14+glow*0.28).toFixed(3)})`);}
  return inks(`rgba(${g}, ${g}, ${Math.min(255,g+3)}, ${(0.88+t*0.12).toFixed(3)})`, `rgb(${Math.round(70-t*54)}, ${Math.round(83-t*48)}, ${Math.round(100-t*43)})`,shadows.join(", "),t>0.6?"800":"700");
}
export function deltaInk(diff: number | null): Record<string, string> {
  const v=positive(diff),t=Math.min(1,v/80),shadow=outline("rgba(6, 10, 16, 0.78)").join(", ");
  return inks(v<=0?"rgba(148, 163, 184, 0.82)":`rgba(110, ${Math.round(200+t*39)}, 172, ${(0.88+t*0.12).toFixed(3)})`, `rgb(${Math.round(45-t*35)}, ${Math.round(77-t*17)}, ${Math.round(66-t*21)})`,shadow,v<=0?"650":"700");
}
export function totalInk(points: number | null, scale: number): Record<string, string> {
  const v=positive(points),t=Math.min(1,v/Math.max(1,scale));
  if(v<=0)return {...inks("rgba(100, 120, 150, 0.55)","rgb(68, 85, 107)","none","650"),background:"rgba(56, 100, 160, 0.08)"};
  const shadows=outline(`rgba(8, 14, 28, ${(0.55+(1-t)*0.2).toFixed(3)})`);
  if(t>0.55)shadows.push(`0 0 ${(1+t*2).toFixed(1)}px rgba(125, 211, 252, ${(0.12+t*0.22).toFixed(3)})`);
  return {...inks(`rgba(${Math.round(90+t*90)}, ${Math.round(130+t*90)}, ${Math.round(180+t*75)}, ${(0.72+t*0.28).toFixed(3)})`,`rgb(${Math.round(45-t*37)}, ${Math.round(70-t*32)}, ${Math.round(98-t*24)})`,shadows.join(", "),t>0.5?"800":"700"),background:`rgba(56, 140, 220, ${(0.1+t*0.38).toFixed(3)})`};
}
