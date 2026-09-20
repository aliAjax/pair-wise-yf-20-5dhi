/* ============================== 领域模型 ============================== */

export type SectorId = "N" | "E" | "S" | "W";

export interface FirePoint {
  id: string;
  name: string;
  /** 场地平面坐标，单位 m，场地 400m × 300m */
  x: number;
  y: number;
  sector: SectorId;
}

export interface Segment {
  id: string;
  name: string;
  start: number;
  end: number;
  color: string;
}

export interface WindProfile {
  id: string;
  name: string;
  desc: string;
  /** 风速 m/s */
  speed: number;
  /** 风吹去的方位角，正北 0°，顺时针 */
  dir: number;
}

export interface IgnitionGroup {
  id: string;
  name: string;
  model: string;
  pointId: string;
  backupPointId: string;
  /** 登记扇区 */
  sector: SectorId;
  /** 最小安全半径 m */
  radius: number;
  /** 点火时刻（音乐时间点，秒） */
  start: number;
  /** 持续时间 s */
  duration: number;
}

export type ReasonKind = "segment" | "schedule" | "backup" | "overlap";

export interface Reason {
  kind: ReasonKind;
  text: string;
}

export interface Verdict {
  approved: boolean;
  reasons: Reason[];
  drift: number;
  end: number;
  segmentId?: string;
}

/* ============================== 预置数据 ============================== */

export const SECTORS: { id: SectorId; name: string; color: string }[] = [
  { id: "N", name: "北扇区", color: "#eff6ff" },
  { id: "E", name: "东扇区", color: "#fff7ed" },
  { id: "S", name: "南扇区", color: "#f0fdf4" },
  { id: "W", name: "西扇区", color: "#fef2f2" },
];

/** 预置四点（B1 与 B4 同属东扇区，用于校验备选点规则） */
export const POINTS: FirePoint[] = [
  { id: "B1", name: "东一号台", x: 270, y: 100, sector: "E" },
  { id: "B2", name: "西二号台", x: 195, y: 230, sector: "W" },
  { id: "B3", name: "南三号台", x: 280, y: 250, sector: "S" },
  { id: "B4", name: "瞭望台", x: 340, y: 60, sector: "E" },
];

/** 预置三段节目（Chorus A 与 Finale 间留有 10s 段间空档） */
export const SEGMENTS: Segment[] = [
  { id: "S1", name: "Intro", start: 0, end: 50, color: "#1d4ed8" },
  { id: "S2", name: "Chorus A", start: 50, end: 110, color: "#f59e0b" },
  { id: "S3", name: "Finale", start: 120, end: 200, color: "#dc2626" },
];

/** 预置两种风况 */
export const WINDS: WindProfile[] = [
  { id: "W-A", name: "弱风 · 西偏南30°", desc: "3 m/s，风吹向 210°", speed: 3, dir: 210 },
  { id: "W-B", name: "强南风", desc: "9 m/s，风向 180°（正南）", speed: 9, dir: 180 },
];

export const DEFAULT_GROUPS: IgnitionGroup[] = [
  { id: "G1", name: "开场扇形架", model: "30mm扇形架", pointId: "B1", backupPointId: "B3", sector: "E", radius: 35, start: 0, duration: 40 },
  { id: "G2", name: "主礼花齐射", model: "75mm礼花弹", pointId: "B2", backupPointId: "B4", sector: "W", radius: 45, start: 5, duration: 30 },
  { id: "G3", name: "中段罗马烛光", model: "罗马烛光", pointId: "B3", backupPointId: "B1", sector: "S", radius: 30, start: 75, duration: 25 },
  { id: "G4", name: "压轴冷焰火", model: "冷焰火", pointId: "B3", backupPointId: "B2", sector: "S", radius: 40, start: 105, duration: 20 },
  { id: "G5", name: "迎宾冷焰火", model: "冷焰火", pointId: "B4", backupPointId: "B1", sector: "E", radius: 25, start: 8, duration: 10 },
];

/* ============================== 工具函数 ============================== */

export const SITE_W = 400;
export const SITE_H = 300;
export const CENTER = { x: 200, y: 150 };

export function sectorName(id: SectorId): string {
  return SECTORS.find((s) => s.id === id)?.name ?? id;
}

export function pointById(id: string): FirePoint | undefined {
  return POINTS.find((p) => p.id === id);
}

/** 方位角 → 屏幕单位向量（正北向上） */
export function windUnit(dir: number): { x: number; y: number } {
  const a = (dir * Math.PI) / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

export function polarPoint(cx: number, cy: number, r: number, bearing: number) {
  const a = (bearing * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** 点到线段（胶囊中轴线）的距离 */
export function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** mm:ss.cc 或 mm:ss.c → 秒 */
export function parseTime(text: string): number | null {
  const m = /^(\d+):([0-5]?\d)(?:[.,](\d{1,3}))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[3] ? Number(m[3].padEnd(3, "0")) / 1000 : 0;
  return Number(m[1]) * 60 + Number(m[2]) + frac;
}

/** 秒 → mm:ss.cc */
export function fmt(t: number): string {
  const total = Math.round(t * 1000);
  const mm = Math.floor(total / 60000);
  const ss = Math.floor((total % 60000) / 1000);
  const cc = total % 1000;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cc).padStart(3, "0")}`;
}

/* ============================== 联锁重算（纯函数，不改排期） ============================== */

export const REASON_TAG: Record<ReasonKind, string> = {
  segment: "越过节目段",
  schedule: "排期空档",
  backup: "备选点同扇区",
  overlap: "漂移交叠",
};

export function evaluate(groups: IgnitionGroup[], wind: WindProfile): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  const u = windUnit(wind.dir);

  for (const g of groups) {
    const main = pointById(g.pointId);
    const back = pointById(g.backupPointId);
    const end = g.start + g.duration;
    const seg = SEGMENTS.find((s) => g.start >= s.start && g.start < s.end);
    const reasons: Reason[] = [];
    const at = `${g.name} ${fmt(g.start)} @ ${main ? main.id + " " + main.name : "未登记点"}`;

    // 规则二：持续越过节目段（含落入段间空档）
    if (!seg) {
      const gap = SEGMENTS.some((s) => g.start >= s.end)
        ? `（处于段间空档 ${fmt(110)}–${fmt(120)} 或整场之外）`
        : "";
      reasons.push({
        kind: "schedule",
        text: `点火时刻 ${fmt(g.start)} 不落在任何节目段内${gap}，联锁无法为其绑定节目段（${at}）`,
      });
    } else if (end > seg.end + 1e-6) {
      reasons.push({
        kind: "segment",
        text: `燃放持续 ${g.duration.toFixed(1)}s、结束于 ${fmt(end)}，越过所属节目段「${seg.name}」结尾 ${fmt(seg.end)}（超出 ${(end - seg.end).toFixed(1)}s）（${at}）`,
      });
    }

    // 规则三：备选点与主点同扇区（备选点必须与登记扇区不同）
    if (back && back.sector === g.sector) {
      reasons.push({
        kind: "backup",
        text: `备选点 ${back.id} ${back.name}（${sectorName(back.sector)}）与主点同属登记扇区${sectorName(g.sector)}，备选点必须与主点异扇区（${at}）`,
      });
    }

    out[g.id] = { approved: false, reasons, drift: wind.speed * g.duration, end, segmentId: seg?.id };
  }

  // 规则一：风漂移后有效半径与邻点交叠（只检查同时燃放的组对，双向各记一条）
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const b = groups[j];
      const va = out[a.id];
      const vb = out[b.id];
      if (!(a.start < vb.end && b.start < va.end)) continue; // 燃放时段无交集
      const pa = pointById(a.pointId);
      const pb = pointById(b.pointId);
      if (!pa || !pb) continue;

      const ea = { x: pa.x + va.drift * u.x, y: pa.y + va.drift * u.y };
      const eb = { x: pb.x + vb.drift * u.x, y: pb.y + vb.drift * u.y };
      const os = Math.max(a.start, b.start);
      const oe = Math.min(va.end, vb.end);
      const windowText = `${fmt(os)}–${fmt(oe)}`;

      // 邻点 b 的主点进入 a 的下风有效危险区
      const dB = distPointToSegment(pb.x, pb.y, pa.x, pa.y, ea.x, ea.y);
      if (dB <= a.radius + 1e-6) {
        const inv = a.radius - dB;
        va.reasons.push({
          kind: "overlap",
          text: `与 ${b.name}（${pb.id} ${pb.name}，${fmt(b.start)}–${fmt(vb.end)}）在 ${windowText} 同时燃放，邻点 ${pb.id} 进入本组下风有效危险区（最小安全半径 ${a.radius}m＋${wind.name}漂移 ${va.drift.toFixed(1)}m，侵入 ${inv.toFixed(1)}m）（${a.name} ${fmt(a.start)} @ ${pa.id} ${pa.name}）`,
        });
        vb.reasons.push({
          kind: "overlap",
          text: `与 ${a.name}（${pa.id} ${pa.name}，${fmt(a.start)}–${fmt(va.end)}）在 ${windowText} 同时燃放，本组主点 ${pb.id} ${pb.name} 落入其下风有效危险区（对方漂移 ${va.drift.toFixed(1)}m、半径 ${a.radius}m，侵入 ${inv.toFixed(1)}m）（${b.name} ${fmt(b.start)} @ ${pb.id} ${pb.name}）`,
        });
      }

      // 反向：a 的主点进入 b 的下风有效危险区
      const dA = distPointToSegment(pa.x, pa.y, pb.x, pb.y, eb.x, eb.y);
      if (dA <= b.radius + 1e-6) {
        const inv = b.radius - dA;
        vb.reasons.push({
          kind: "overlap",
          text: `与 ${a.name}（${pa.id} ${pa.name}，${fmt(a.start)}–${fmt(va.end)}）在 ${windowText} 同时燃放，邻点 ${pa.id} 进入本组下风有效危险区（最小安全半径 ${b.radius}m＋${wind.name}漂移 ${vb.drift.toFixed(1)}m，侵入 ${inv.toFixed(1)}m）（${b.name} ${fmt(b.start)} @ ${pb.id} ${pb.name}）`,
        });
        va.reasons.push({
          kind: "overlap",
          text: `与 ${b.name}（${pb.id} ${pb.name}，${fmt(b.start)}–${fmt(vb.end)}）在 ${windowText} 同时燃放，本组主点 ${pa.id} ${pa.name} 落入其下风有效危险区（对方漂移 ${vb.drift.toFixed(1)}m、半径 ${b.radius}m，侵入 ${inv.toFixed(1)}m）（${a.name} ${fmt(a.start)} @ ${pa.id} ${pa.name}）`,
        });
      }
    }
  }

  for (const g of groups) out[g.id].approved = out[g.id].reasons.length === 0;
  return out;
}
