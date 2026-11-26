// clubvista 一张小图的数据形状 + 画轮廓用的小工具。坐标是这张图自己的（米）：x 0…W 朝东（画面右），z 0…D 朝南（画面下，朝镜头），
// y 朝上。四张图在世界里沿 x 排开（ox = 序号 × MAP_GAP），彼此看不见：镜头关在本图的 view 里，图和图之间靠转场（iris.ts）。
// 不用 clubsite/world.ts 的整座俱乐部坐标：这是重新设计的地图（每张一个主题、一两屏大），不是 clubwalk 的那张连着的大图。
import type { Pal } from './palette';

export type V2 = [number, number];
export type ElKey = 'floor' | 'mesa' | 'wash' | 'bluff' | 'path' | 'trail' | 'water' | 'none';

/**
 * 一块台面：轮廓内的地面在高度 h。后画的盖住先画的（groundAt 取最后一个包住这点的）。
 * - h > base：台地，朝外的崖壁从 h 下到 base（朝南的一段就是画面里的暗带）；
 * - h < base：坑（球场、泳池、干河床），朝里的壁从 base 下到 h；外面那块台面在这里挖洞。
 */
export interface Plate {
  id: string;
  pts: V2[];
  h: number;
  /** 周围的地面高度（壁的另一头），默认 0 */
  base?: number;
  top: keyof Pal;
  el?: ElKey;
  /** 壁的材质；'none' = 不画壁（同高的铺地） */
  wall?: keyof Pal | 'none';
  /** 轮廓平滑的间距（米）；0 = 保留拐角（铺地、球场） */
  smooth?: number;
  /** 能不能走（水面 false） */
  walk?: boolean;
  /** 不投影（大面都不投） */
  cast?: boolean;
  /** 坑：壁做成斜坡（每米落差往里收多少米；1 = 45°）。不给 = 竖直的壁 */
  slope?: number;
  /** 坑口外一圈压顶石的宽度（米，池沿） */
  rim?: number;
}

/** 一条带子（步道、马路）：中心线平滑后左右各 w/2，贴着地面 */
export interface Strip {
  id: string;
  pts: V2[];
  w: number;
  mat: keyof Pal;
  el?: ElKey;
  /** 主路（宽、亮）/ 支路 */
  main?: boolean;
  /** 离地高度（默认 0.012） */
  lift?: number;
  /** stones = 一块块踏脚石（支路），不是连着的带子 */
  kind?: 'band' | 'stones';
}

/** 台阶 / 坡道 / 小桥：矩形里高度从 x0（或 z0）一头的 h0 线性变到另一头的 h1 */
export interface Stair {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  axis: 'x' | 'z';
  h0: number;
  h1: number;
  /** stairs = 一级级的台阶；bridge = 平的木桥（带两侧栏杆的矮边） */
  kind: 'stairs' | 'bridge';
}

/** 一块球场（平涂：外场、内场、白线；网是摆件） */
export interface Court {
  id: string;
  /** 外场（含缓冲区）的矩形 */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  /** 长轴方向：x = 东西向（横屏里最舒展），z = 南北向（竖屏里放得下） */
  axis: 'x' | 'z';
  /** 配色：中心球场（蓝 + 蓝紫）/ 练习场（绿土） */
  look?: 'center' | 'practice';
}

/** 摆件：资产 id（复用的 / 本场景的 / 还没画的占位） */
export interface Prop {
  a: string;
  x: number;
  z: number;
  /** 朝向（弧度，0 = 朝镜头 +z） */
  r?: number;
  s?: number;
  v?: number;
  /** 不贴地时的高度 */
  y?: number;
  /** 挡路：圆半径（米）；'box' = 包围盒；不给 = 按资产默认（植物树干、家具包围盒） */
  block?: number | 'box' | false;
  /** 人：姿势 */
  pose?: string;
  /** 人：手里拿的 */
  prop?: string;
}

/** 出口：总监走进这个圆 → 圆形遮罩转场 → 到 to 图的 arrive 点 */
export interface Exit {
  to: string;
  /** 进哪个入口（to 图 entries 的 key） */
  entry: string;
  at: V2;
  r: number;
}

export interface Entry {
  at: V2;
  /** 到了以后朝哪（弧度，0 = 朝镜头） */
  yaw: number;
}

export interface MapDef {
  id: string;
  /** 地点名（转场后淡出） */
  name: string;
  W: number;
  D: number;
  plates: Plate[];
  strips: Strip[];
  stairs: Stair[];
  courts: Court[];
  props: Prop[];
  /** 不能走的地方（边上的密林、仙人掌丛、马路对面……）：和画面里的东西对齐 */
  noWalk: V2[][];
  exits: Exit[];
  entries: Record<string, Entry>;
  /** 开局（或从地图选单进来）站哪 */
  start: Entry;
  /** 手摆的云影 (x, z, rx, rz) */
  clouds: [number, number, number, number][];
  /** 镜头范围（不出图；默认 0…W × 0…D） */
  view?: { x0: number; x1: number; z0: number; z1: number };
}

// ── 画轮廓的小工具 ──

/** 矩形（顺时针 = 从西北角开始往东） */
export const rect = (x0: number, z0: number, x1: number, z1: number): V2[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

/**
 * 一条带状的轮廓（干河床、峡谷）：中心线 + 每点的宽度 → 左边一路下去、右边一路回来。
 * 中心线点少（5～8 个）就行，平滑交给 Plate.smooth。
 */
export function band(center: V2[], widths: number[]): V2[] {
  const L: V2[] = [];
  const R: V2[] = [];
  for (let i = 0; i < center.length; i++) {
    const a = center[Math.max(0, i - 1)];
    const b = center[Math.min(center.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const w = (widths[i] ?? widths[widths.length - 1]) / 2;
    L.push([center[i][0] + nx * w, center[i][1] + nz * w]);
    R.push([center[i][0] - nx * w, center[i][1] - nz * w]);
  }
  return [...L, ...R.reverse()];
}

/** 圆 / 椭圆（n 个点） */
export function blob(cx: number, cz: number, rx: number, rz: number, n = 14, wob: number[] = []): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (wob[i % Math.max(1, wob.length)] ?? 0);
    out.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]);
  }
  return out;
}

/** 一簇东西：在 (cx, cz) 附近按给的偏移摆同一种资产（大小、变体轮换）——"3～7 个一簇，簇和簇之间空着" */
export function cluster(
  a: string,
  cx: number,
  cz: number,
  offs: [number, number, number?][],
  o: { v0?: number; nv?: number; r0?: number; spin?: number; block?: Prop['block'] } = {},
): Prop[] {
  return offs.map(([dx, dz, s], i) => ({
    a,
    x: cx + dx,
    z: cz + dz,
    s: s ?? 1,
    v: ((o.v0 ?? 0) + i) % (o.nv ?? 3),
    r: (o.r0 ?? 0) + i * (o.spin ?? 1.7),
    block: o.block,
  }));
}
