// ---------------------------------------------------------------------------
// 燃放联锁台 · 领域层
// 预置四点、三段节目、两种风况；风况变化后重算漂移并逐组联锁评估。
// ---------------------------------------------------------------------------

export interface FirePoint {
  id: string;
  name: string;
  sector: string; // 所属扇区
  x: number; // 平面图坐标（米）
  y: number;
}

export interface Segment {
  id: string;
  name: string;
  start: number; // 秒
  end: number; // 秒
}

export interface Wind {
  id: string;
  name: string;
  dirLabel: string; // 风向说明
  arrowDeg: number; // 漂移方向（平面图上箭头指向，0=正北/上，顺时针）
  speed: number; // 风速 m/s
}

export interface FireGroup {
  id: string;
  name: string;
  model: string; // 烟花型号
  mainPointId: string; // 主点
  altPointId: string; // 备选点
  minRadius: number; // 最小安全半径（米）
  start: number; // 点火时刻（秒）
  duration: number; // 持续时间（秒）
}

export interface Rejection {
  rule: string;
  detail: string;
}

export interface GroupEval {
  group: FireGroup;
  main: FirePoint;
  alt: FirePoint;
  segment: Segment | null;
  drift: number; // 当前风况下的漂移量（米）
  effectiveRadius: number; // 有效半径 = 最小安全半径 + 漂移
  end: number; // 预计结束时刻（秒）
  approved: boolean;
  rejections: Rejection[];
}

export interface OverviewRow {
  groupId: string;
  name: string;
  model: string;
  segmentName: string;
  pointName: string;
  sector: string;
  start: number;
  end: number;
  duration: number;
  minRadius: number;
  drift: number;
  effectiveRadius: number;
  altPointName: string;
}

export interface Overview {
  windId: string;
  windName: string;
  generatedAt: string; // ISO
  groupsHash: string; // 生成时的排期指纹，用于失效判断
  rows: OverviewRow[];
}

/** 落物漂移系数：漂移量 = 风速 × 系数（秒） */
export const DRIFT_COEFF = 4;

// ------------------------------------------------------------- 预置：四个点位
export const POINTS: FirePoint[] = [
  { id: "P1", name: "一号点 · 北堤", sector: "北扇区", x: 150, y: 45 },
  { id: "P2", name: "二号点 · 东台", sector: "东扇区", x: 285, y: 150 },
  { id: "P3", name: "三号点 · 南坪", sector: "南扇区", x: 150, y: 255 },
  { id: "P4", name: "四号点 · 西坡", sector: "西扇区", x: 35, y: 140 },
];

// ----------------------------------------------------------- 预置：三段节目
export const SEGMENTS: Segment[] = [
  { id: "S1", name: "序章", start: 0, end: 80 },
  { id: "S2", name: "主秀", start: 80, end: 180 },
  { id: "S3", name: "终章", start: 180, end: 270 },
];

// ----------------------------------------------------------- 预置：两种风况
export const WINDS: Wind[] = [
  { id: "W1", name: "晴夜微风", dirLabel: "东北风 · 吹向西南", arrowDeg: 225, speed: 3 },
  { id: "W2", name: "强风警报", dirLabel: "西南风 · 吹向东北", arrowDeg: 45, speed: 8 },
];

// ------------------------------------------------------- 预置：六个点火组
export const SEED_GROUPS: FireGroup[] = [
  { id: "G1", name: "开场扇形", model: "30mm扇形架", mainPointId: "P1", altPointId: "P3", minRadius: 35, start: 10, duration: 45 },
  { id: "G2", name: "序章烛光", model: "罗马烛光", mainPointId: "P2", altPointId: "P4", minRadius: 30, start: 25, duration: 50 },
  { id: "G3", name: "主秀礼花", model: "75mm礼花弹", mainPointId: "P3", altPointId: "P1", minRadius: 145, start: 100, duration: 70 },
  { id: "G4", name: "主秀扇形", model: "30mm扇形架", mainPointId: "P4", altPointId: "P2", minRadius: 40, start: 120, duration: 55 },
  { id: "G5", name: "终章齐射", model: "75mm礼花弹", mainPointId: "P1", altPointId: "P3", minRadius: 55, start: 190, duration: 60 },
  { id: "G6", name: "终章冷焰", model: "冷焰火", mainPointId: "P2", altPointId: "P4", minRadius: 25, start: 230, duration: 55 },
];

// ------------------------------------------------------------------ 工具函数
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function driftOf(wind: Wind): number {
  return Math.round(wind.speed * DRIFT_COEFF);
}

export function pointById(id: string): FirePoint {
  const p = POINTS.find((p) => p.id === id);
  if (!p) throw new Error(`未知点位 ${id}`);
  return p;
}

export function segmentAt(t: number): Segment | null {
  return SEGMENTS.find((s) => t >= s.start && t < s.end) ?? null;
}

function dist(a: FirePoint, b: FirePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// -------------------------------------------------------------- 联锁评估
// 三条拒绝规则，任一命中即整组拒绝，原排期不变：
//  1. 有效半径（最小安全半径 + 当前漂移）与邻点交叠
//  2. 持续时间越过所在节目段段末
//  3. 备选点与主点同扇区
export function evaluateGroup(g: FireGroup, wind: Wind): GroupEval {
  const main = pointById(g.mainPointId);
  const alt = pointById(g.altPointId);
  const drift = driftOf(wind);
  const effectiveRadius = g.minRadius + drift;
  const end = g.start + g.duration;
  const segment = segmentAt(g.start);
  const rejections: Rejection[] = [];

  if (!segment) {
    rejections.push({
      rule: "时刻越界",
      detail: `点火时刻 ${fmtTime(g.start)} 不在任何节目段内（全场 ${fmtTime(SEGMENTS[0].start)}–${fmtTime(SEGMENTS[SEGMENTS.length - 1].end)}）`,
    });
  }

  // 规则一：有效半径与邻点交叠
  for (const p of POINTS) {
    if (p.id === main.id) continue;
    const d = dist(main, p);
    if (effectiveRadius > d) {
      rejections.push({
        rule: "半径交叠",
        detail: `有效半径 ${effectiveRadius}m（${g.minRadius}+漂移${drift}）在「${main.name}」与邻点「${p.name}」交叠，间距仅 ${Math.round(d)}m`,
      });
    }
  }

  // 规则二：持续越过节目段
  if (segment && end > segment.end) {
    rejections.push({
      rule: "越过段末",
      detail: `「${main.name}」${fmtTime(g.start)} 点火、持续 ${g.duration}s，预计 ${fmtTime(end)} 结束，越过节目段「${segment.name}」段末 ${fmtTime(segment.end)}`,
    });
  }

  // 规则三：备选点与主点同扇区
  if (alt.sector === main.sector) {
    rejections.push({
      rule: "备选同扇区",
      detail: `备选点「${alt.name}」与主点「${main.name}」同属「${main.sector}」，风况切换后无独立备份`,
    });
  }

  return {
    group: g,
    main,
    alt,
    segment,
    drift,
    effectiveRadius,
    end,
    approved: rejections.length === 0,
    rejections,
  };
}

export function evaluateAll(groups: FireGroup[], wind: Wind): GroupEval[] {
  return groups.map((g) => evaluateGroup(g, wind));
}

// -------------------------------------------------------------- 总览生成
export function groupsHash(groups: FireGroup[]): string {
  return groups
    .map((g) => [g.id, g.mainPointId, g.altPointId, g.minRadius, g.start, g.duration].join(":"))
    .join("|");
}

export function buildOverview(evals: GroupEval[], wind: Wind): Overview {
  const rows: OverviewRow[] = evals
    .slice()
    .sort((a, b) => a.group.start - b.group.start)
    .map((e) => ({
      groupId: e.group.id,
      name: e.group.name,
      model: e.group.model,
      segmentName: e.segment?.name ?? "—",
      pointName: e.main.name,
      sector: e.main.sector,
      start: e.group.start,
      end: e.end,
      duration: e.group.duration,
      minRadius: e.group.minRadius,
      drift: e.drift,
      effectiveRadius: e.effectiveRadius,
      altPointName: e.alt.name,
    }));
  return {
    windId: wind.id,
    windName: wind.name,
    generatedAt: new Date().toISOString(),
    groupsHash: groupsHash(evals.map((e) => e.group)),
    rows,
  };
}

// ----------------------------------------------------- 浏览器本地持久化
const STORAGE_KEY = "hxyfront-62008-interlock-v1";

export interface PersistedState {
  windId: string;
  groups: FireGroup[];
  overview: Overview | null;
}

export function loadState(): PersistedState {
  const fallback: PersistedState = {
    windId: WINDS[0].id,
    groups: SEED_GROUPS.map((g) => ({ ...g })),
    overview: null,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!Array.isArray(parsed.groups) || parsed.groups.length === 0) return fallback;
    const windId = WINDS.some((w) => w.id === parsed.windId) ? (parsed.windId as string) : fallback.windId;
    return { windId, groups: parsed.groups as FireGroup[], overview: parsed.overview ?? null };
  } catch {
    return fallback;
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默降级，控制台仍可用
  }
}

export function resetState(): PersistedState {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return loadState();
}
