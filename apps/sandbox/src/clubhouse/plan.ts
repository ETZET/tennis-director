// clubhouse-plan：会所三层的平面图（Canvas 2D，不用 three.js）。全部从 layout.ts / slots.ts / placeholders.ts / routes.ts 现读，
// 和 3D 白模同一份数，不会走样。clubhouse-plan.html?floor=-1|1|2（不给 = 1）。
// 朝向同游戏相机：北在上（−z），东在右（+x）；40 px/米（CSS），每 2 米一条网格，上沿、左沿标世界坐标（同 layout.ts 的 ASCII 平面）。
// 画完设 window.__planReady = true（截图脚本等它）。
import {
  alongX,
  DOORS,
  FLIGHTS,
  FLOOR_NAME,
  FLOOR_Y,
  type Floor,
  type FloorKey,
  FOOT,
  GLASS_S,
  GLASS_W,
  GOODS_LIFT,
  GRATE,
  LIFT,
  levelOf,
  NEWEL,
  type Rect,
  ROOMS,
  type Room,
  SKYLIGHTS,
  SOIL,
  TERRACE,
  WALLS,
  type Wall,
  wallPieces,
} from './layout';
import { SPECS } from './placeholders';
import { SPOTS } from './routes';
import { SLOTS, type Slot } from './slots';
import type { HouseView } from './view';

declare global {
  interface Window {
    __planReady?: boolean;
  }
}

// ── 画幅 ─────────────────────────────────────────────────────────────
/** 像素 / 米（CSS） */
const S = 40;
/**
 * 画的世界范围（米）：B1 x −63.2…−40、z −42.2…−6（+ 南边到池畔的土 z −1）；一层的外门箭头（后门在 x −40，箭头和字往东伸）。
 * 一层、二层南边只到拱廊 / 露台外一点（z −8）。drawPlan 按层设
 */
const viewFor = (f: Floor) => ({ x0: -64, x1: -35.5, z0: -43, z1: f === -1 ? 0 : -8 });
let VIEW = viewFor(1);
const TITLE_H = 48;
const M = { l: 46, t: TITLE_H + 24, r: 16, b: 78 };
let CW = 0;
let CH = 0;

const sx = (x: number) => M.l + (x - VIEW.x0) * S;
const sy = (z: number) => M.t + (z - VIEW.z0) * S;

const FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Droid Sans Fallback", system-ui, sans-serif';
const INK = '#23201c';
const PAPER = '#fbf8f1';
const MINUS = '−';
const num = (v: number) => (v < 0 ? `${MINUS}${Math.abs(v)}` : `${v}`);

/** 地面材质的浅色 + 图例名（沙盒的界面字） */
const FLOOR_FILL: Record<FloorKey, [string, string]> = {
  wood: ['#f2ddb8', '木地板'],
  floorOak: ['#e8c99a', '橡木地板'],
  tile: ['#efbfa6', '陶砖'],
  floorCool: ['#cdebec', '浅色瓷砖'],
  concrete: ['#dededa', '水泥'],
  rubber: ['#b4dccf', '橡胶地垫'],
  turf: ['#c2e3a0', '人造草'],
};
const LEVEL_TITLE: Record<Floor, string> = { [-1]: '负一层', 1: '一层', 2: '二层' };
const VIEW_OF: Record<Floor, HouseView> = { [-1]: 'b1', 1: '1f', 2: '2f' };
/** 不画成家具框的：人、墙里已经画了的门窗、钟楼、电梯 / 货梯（单独画）、B1 的天光（格栅、玻璃砖：负一层画成采光的斜线） */
const SKIP_ASSETS = new Set(['player', 'coach', 'director', 'lift', 'grate-band', 'glass-block']);
/** 一层外门在平面图上的名字（layout.ts 的 DOORS 名字是旧的：厨房门现在是便利店的门，后门送货） */
const DOOR_LABEL: Partial<Record<keyof typeof DOORS, string>> = { kitchen: '便利店的门', kitchenBack: '后门（送货）' };
/** B1 的天光（地面上的格栅、玻璃砖、天窗）：名字 */
const DAYLIGHT: { r: Rect; name: string }[] = [
  { r: GRATE, name: '北巷格栅采光带' },
  { r: GLASS_W, name: '西巷玻璃砖' },
  ...SKYLIGHTS.map((r) => ({ r, name: '天窗' })),
  { r: GLASS_S, name: '玻璃砖' },
];
const SKIP_SHAPES = new Set(['person', 'doorway', 'archwin', 'tower']);

// ── 小工具 ───────────────────────────────────────────────────────────
type Box = { x0: number; y0: number; x1: number; y1: number };
const inRect = (r: Rect, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0);
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const screenBox = (r: Rect): Box => ({ x0: sx(r.x0), y0: sy(r.z0), x1: sx(r.x1), y1: sy(r.z1) });

/** a 减 b（最多四块） */
function subtract(a: Rect, b: Rect): Rect[] {
  if (b.x1 <= a.x0 || b.x0 >= a.x1 || b.z1 <= a.z0 || b.z0 >= a.z1) return [a];
  const out: Rect[] = [];
  if (b.z0 > a.z0) out.push({ x0: a.x0, x1: a.x1, z0: a.z0, z1: b.z0 });
  if (b.z1 < a.z1) out.push({ x0: a.x0, x1: a.x1, z0: b.z1, z1: a.z1 });
  const z0 = Math.max(a.z0, b.z0);
  const z1 = Math.min(a.z1, b.z1);
  if (b.x0 > a.x0) out.push({ x0: a.x0, x1: b.x0, z0, z1 });
  if (b.x1 < a.x1) out.push({ x0: b.x1, x1: a.x1, z0, z1 });
  return out;
}
const subtractAll = (as: Rect[], bs: Rect[]) => bs.reduce((acc, b) => acc.flatMap((a) => subtract(a, b)), as);

/** 一组矩形并集的外轮廓线段（逐段取样：外法线那边不在并集里的才算外沿） */
function outline(rects: Rect[]): [number, number, number, number][] {
  const ins = (x: number, z: number) => rects.some((r) => inRect(r, x, z));
  const segs: [number, number, number, number][] = [];
  const step = 0.05;
  const eps = 0.02;
  for (const r of rects) {
    const edges: [number, number, number, number, number, number][] = [
      [r.x0, r.z0, r.x1, r.z0, 0, -1],
      [r.x0, r.z1, r.x1, r.z1, 0, 1],
      [r.x0, r.z0, r.x0, r.z1, -1, 0],
      [r.x1, r.z0, r.x1, r.z1, 1, 0],
    ];
    for (const [ax, az, bx, bz, nx, nz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / step));
      let run: number | null = null;
      for (let i = 0; i <= n; i++) {
        const t0 = i / n;
        const tm = (i + 0.5) / n;
        const mx = ax + (bx - ax) * tm;
        const mz = az + (bz - az) * tm;
        const outer = i < n && !ins(mx + nx * eps, mz + nz * eps) && ins(mx - nx * eps, mz - nz * eps);
        if (outer && run === null) run = t0;
        if (!outer && run !== null) {
          segs.push([ax + (bx - ax) * run, az + (bz - az) * run, ax + (bx - ax) * t0, az + (bz - az) * t0]);
          run = null;
        }
      }
    }
  }
  return segs;
}

// ── 画 ───────────────────────────────────────────────────────────────
function floorParam(): Floor {
  const v = Number(new URLSearchParams(location.search).get('floor') ?? '1');
  return v === -1 || v === 2 ? v : 1;
}

export function drawPlan(canvas: HTMLCanvasElement, f: Floor) {
  VIEW = viewFor(f);
  CW = M.l + (VIEW.x1 - VIEW.x0) * S + M.r;
  CH = M.t + (VIEW.z1 - VIEW.z0) * S + M.b;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(CW * dpr);
  canvas.height = Math.round(CH * dpr);
  canvas.style.width = `${CW}px`;
  canvas.style.height = `${CH}px`;
  const g0 = canvas.getContext('2d');
  if (!g0) return;
  const g: CanvasRenderingContext2D = g0;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.lineJoin = 'miter';
  g.lineCap = 'butt';

  const font = (px: number, bold = false) => `${bold ? '700 ' : ''}${px}px ${FONT}`;
  const text = (s: string, x: number, y: number, px: number, color = INK, bold = false, halo = PAPER) => {
    g.font = font(px, bold);
    if (halo) {
      g.lineWidth = 3;
      g.strokeStyle = halo;
      g.lineJoin = 'round';
      g.strokeText(s, x, y);
      g.lineJoin = 'miter';
    }
    g.fillStyle = color;
    g.fillText(s, x, y);
  };
  const rectPath = (r: Rect) => g.rect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
  /** 斜线填充（clip 到这几块矩形；angle 45 = 左下 → 右上） */
  const hatch = (rs: Rect[], color: string, gap = 7, width = 1, cross = false) => {
    if (!rs.length) return;
    g.save();
    g.beginPath();
    for (const r of rs) rectPath(r);
    g.clip();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    const b = rs.reduce(
      (a, r) => ({
        x0: Math.min(a.x0, sx(r.x0)),
        y0: Math.min(a.y0, sy(r.z0)),
        x1: Math.max(a.x1, sx(r.x1)),
        y1: Math.max(a.y1, sy(r.z1)),
      }),
      { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
    );
    const span = b.x1 - b.x0 + b.y1 - b.y0;
    for (let d = 0; d <= span; d += gap) {
      g.moveTo(b.x0 + d, b.y1);
      g.lineTo(b.x0 + d - (b.y1 - b.y0), b.y0);
      if (cross) {
        g.moveTo(b.x0 + d - (b.y1 - b.y0), b.y1);
        g.lineTo(b.x0 + d, b.y0);
      }
    }
    g.stroke();
    g.restore();
  };
  const arrow = (x0: number, y0: number, x1: number, y1: number, color: string, width: number, head: number) => {
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1 - Math.cos(a) * head * 0.8, y1 - Math.sin(a) * head * 0.8);
    g.stroke();
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x1 - Math.cos(a - 0.45) * head, y1 - Math.sin(a - 0.45) * head);
    g.lineTo(x1 - Math.cos(a + 0.45) * head, y1 - Math.sin(a + 0.45) * head);
    g.closePath();
    g.fill();
  };

  const rooms = ROOMS.filter((r) => r.level === f);
  const walls = WALLS.filter((w) => levelOf(w) === f && !w.upper);
  const flights = FLIGHTS.filter((s) => s.grids.includes(f));
  const roomAt = (x: number, z: number): Room | undefined => rooms.find((r) => !r.hole && inRect(r.r, x, z));
  /** 房间名要躲开的东西（屏幕框） */
  const obstacles: Box[] = [];

  // 纸 + 网格
  g.fillStyle = PAPER;
  g.fillRect(0, 0, CW, CH);
  g.strokeStyle = 'rgba(40, 60, 90, 0.10)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = Math.ceil(VIEW.x0 / 2) * 2; x <= VIEW.x1; x += 2) {
    g.moveTo(sx(x) + 0.5, sy(VIEW.z0));
    g.lineTo(sx(x) + 0.5, sy(VIEW.z1));
  }
  for (let z = Math.ceil(VIEW.z0 / 2) * 2; z <= VIEW.z1; z += 2) {
    g.moveTo(sx(VIEW.x0), sy(z) + 0.5);
    g.lineTo(sx(VIEW.x1), sy(z) + 0.5);
  }
  g.stroke();
  g.strokeStyle = 'rgba(40, 60, 90, 0.35)';
  g.strokeRect(sx(VIEW.x0) + 0.5, sy(VIEW.z0) + 0.5, (VIEW.x1 - VIEW.x0) * S - 1, (VIEW.z1 - VIEW.z0) * S - 1);

  g.save();
  g.beginPath();
  g.rect(sx(VIEW.x0), sy(VIEW.z0), (VIEW.x1 - VIEW.x0) * S, (VIEW.z1 - VIEW.z0) * S);
  g.clip();

  // 下面的东西：负一层 = 南边到池畔的土（SOIL）；二层 = 一层伸出去的屋顶
  const ctxLabels: { s: string; r: Rect; color: string }[] = [];
  if (f === -1) {
    g.fillStyle = '#efe3cc';
    for (const r of SOIL) g.fillRect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
    hatch(SOIL, 'rgba(150, 110, 60, 0.45)', 9);
    for (const r of SOIL) ctxLabels.push({ s: '土', r, color: '#8a6234' });
  }
  if (f === 2) {
    const roof = subtractAll(FOOT[1], FOOT[2]);
    g.fillStyle = '#ece6de';
    for (const r of roof) g.fillRect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
    hatch(roof, 'rgba(170, 80, 50, 0.22)', 6);
    g.setLineDash([3, 3]);
    g.strokeStyle = 'rgba(80, 70, 60, 0.6)';
    g.lineWidth = 1;
    g.beginPath();
    for (const [ax, az, bx, bz] of outline(FOOT[1])) {
      g.moveTo(sx(ax), sy(az));
      g.lineTo(sx(bx), sy(bz));
    }
    g.stroke();
    g.setLineDash([]);
    for (const r of roof)
      if (Math.min(r.x1 - r.x0, r.z1 - r.z0) >= 2) ctxLabels.push({ s: '一层屋顶', r, color: '#8a5a48' });
  }

  // 房间的地
  for (const r of rooms) {
    const [fill] = FLOOR_FILL[r.floor];
    g.globalAlpha = r.open ? 0.55 : 1;
    g.fillStyle = fill;
    g.fillRect(sx(r.r.x0), sy(r.r.z0), (r.r.x1 - r.r.x0) * S, (r.r.z1 - r.r.z0) * S);
    g.globalAlpha = 1;
  }
  const holes = rooms.filter((r) => r.hole).map((r) => r.r);
  if (holes.length) {
    g.fillStyle = '#f6f3ee';
    for (const r of holes) g.fillRect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
    hatch(holes, 'rgba(60, 60, 60, 0.35)', 8, 1, true);
  }
  // 敞开的（露台、拱廊）：虚线外框
  const open = rooms.filter((r) => r.open).map((r) => r.r);
  if (open.length) {
    g.setLineDash([7, 5]);
    g.strokeStyle = '#6a5a4a';
    g.lineWidth = 1.5;
    g.beginPath();
    for (const [ax, az, bx, bz] of outline(f === 2 ? TERRACE : open)) {
      g.moveTo(sx(ax), sy(az));
      g.lineTo(sx(bx), sy(bz));
    }
    g.stroke();
    g.setLineDash([]);
  }

  // 负一层：一层脚印（虚线）+ 地面上的天光（格栅、玻璃砖、天窗）= 浅黄斜线
  if (f === -1) {
    g.setLineDash([3, 3]);
    g.strokeStyle = 'rgba(80, 70, 60, 0.55)';
    g.lineWidth = 1;
    g.beginPath();
    for (const [ax, az, bx, bz] of outline(FOOT[1])) {
      g.moveTo(sx(ax), sy(az));
      g.lineTo(sx(bx), sy(bz));
    }
    g.stroke();
    g.setLineDash([]);
    for (const { r } of DAYLIGHT) {
      g.fillStyle = 'rgba(255, 238, 150, 0.75)';
      g.fillRect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
      hatch([r], 'rgba(200, 150, 20, 0.7)', 5, 1, true);
      g.strokeStyle = '#a07a10';
      g.lineWidth = 1;
      g.strokeRect(sx(r.x0) + 0.5, sy(r.z0) + 0.5, (r.x1 - r.x0) * S - 1, (r.z1 - r.z0) * S - 1);
    }
  }

  // 楼梯：踏步线 + 往上的箭头；平台写名字
  for (const s of flights) {
    const r = { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
    g.fillStyle = '#f7f2e8';
    g.fillRect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
    g.strokeStyle = '#4a443c';
    g.lineWidth = 1.2;
    g.strokeRect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
    obstacles.push(screenBox(r));
    const cx = sx((s.x0 + s.x1) / 2);
    if (s.from === s.to) {
      text(s.name, cx - (g.measureText(s.name).width || 0) / 2, sy((s.z0 + s.z1) / 2) + 4, 11, '#5a5048');
      continue;
    }
    const steps = Math.max(2, Math.round((s.z1 - s.z0) / 0.28));
    g.strokeStyle = 'rgba(60, 54, 46, 0.7)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < steps; i++) {
      const y = sy(s.z0 + ((s.z1 - s.z0) * i) / steps) + 0.5;
      g.moveTo(sx(s.x0), y);
      g.lineTo(sx(s.x1), y);
    }
    g.stroke();
    const upZ = s.to > s.from ? s.z1 : s.z0;
    const loZ = s.to > s.from ? s.z0 : s.z1;
    const dir = Math.sign(upZ - loZ);
    const y0 = sy(loZ) + dir * 6;
    const here = FLOOR_Y[f];
    // 箭头尖那头要写"↑2F / ↓B1"时让出位置
    const tagAtHead = Math.max(s.to, s.from) === here;
    const y1 = sy(upZ) - dir * (tagAtHead ? 24 : 4);
    g.fillStyle = INK;
    g.beginPath();
    g.arc(cx, y0, 3, 0, Math.PI * 2);
    g.fill();
    arrow(cx, y0, cx, y1, INK, 1.6, 9);
    // 这一层的楼梯口那头写去哪一层
    if (s.from === here || s.to === here) {
      const other = ([-1, 1, 2] as Floor[]).find((o) => {
        if (o === f) return false;
        const lo = Math.min(FLOOR_Y[o], here);
        const hi = Math.max(FLOOR_Y[o], here);
        return Math.min(s.from, s.to) >= lo && Math.max(s.from, s.to) <= hi && Math.abs(FLOOR_Y[o] - here) <= 4;
      });
      if (other !== undefined) {
        const lbl = `${FLOOR_Y[other] > here ? '↑' : '↓'}${FLOOR_NAME[other]}`;
        const endZ = s.from === here ? s.z0 : s.z1;
        g.font = font(13, true);
        const tw = g.measureText(lbl).width;
        const ty = sy(endZ) + (endZ === s.z1 ? -10 : 20);
        g.fillStyle = PAPER;
        g.fillRect(cx - tw / 2 - 3, ty - 12, tw + 6, 16);
        text(lbl, cx - tw / 2, ty, 13, '#b0306a', true, '');
      }
    }
  }
  g.fillStyle = INK;
  g.fillRect(sx(NEWEL.x0), sy(NEWEL.z0), (NEWEL.x1 - NEWEL.x0) * S, (NEWEL.z1 - NEWEL.z0) * S);

  // 电梯井（门朝东）、货梯井（门朝南）：框 + X + 门
  const drawLift = (L: Rect & { levels: Floor[] }, door: 'e' | 's', name: string) => {
    if (!L.levels.includes(f)) return;
    const b = screenBox(L);
    g.fillStyle = '#eceae6';
    g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(b.x0, b.y0);
    g.lineTo(b.x1, b.y1);
    g.moveTo(b.x1, b.y0);
    g.lineTo(b.x0, b.y1);
    g.stroke();
    g.lineWidth = 2.5;
    g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    const xm = (b.x0 + b.x1) / 2;
    const ym = (b.y0 + b.y1) / 2;
    // 门：井壁上一段缺口 + 外面一条细线
    const gap = (a0: number, b0: number, a1: number, b1: number) => {
      g.beginPath();
      g.moveTo(a0, b0);
      g.lineTo(a1, b1);
      g.stroke();
    };
    g.strokeStyle = '#eceae6';
    g.lineWidth = 3;
    if (door === 'e') gap(b.x1, ym - 16, b.x1, ym + 16);
    else gap(xm - 16, b.y1, xm + 16, b.y1);
    g.strokeStyle = INK;
    g.lineWidth = 1;
    if (door === 'e') gap(b.x1 + 3, ym - 16, b.x1 + 3, ym + 16);
    else gap(xm - 16, b.y1 + 3, xm + 16, b.y1 + 3);
    g.font = font(12, true);
    const tw = g.measureText(name).width;
    g.fillStyle = '#eceae6';
    g.fillRect(xm - tw / 2 - 2, ym - 8, tw + 4, 16);
    text(name, xm - tw / 2, ym + 5, 12, INK, true, '');
    obstacles.push({ x0: b.x0, y0: b.y0, x1: b.x1 + 4, y1: b.y1 + 4 });
  };
  drawLift(LIFT, 'e', '电梯');
  drawLift(GOODS_LIFT, 's', '货梯');

  // 家具占位：灰框（按 rotY 转），正面（本地 +z）一条深边，"#n"
  const slotOn = (s: Slot) => {
    if ((s.level ?? 1) !== f || SKIP_ASSETS.has(s.asset)) return false;
    // 只画脚印里的（墙上挂的放宽 0.3 米）；四周的植物、邻居不画
    if (!FOOT[f].some((r) => s.x > r.x0 - 0.3 && s.x < r.x1 + 0.3 && s.z > r.z0 - 0.3 && s.z < r.z1 + 0.3))
      return false;
    if (s.views) return s.views.includes(VIEW_OF[f]);
    return s.mode !== 'out';
  };
  const tags: { s: string; x: number; y: number }[] = [];
  for (const s of SLOTS.filter(slotOn)) {
    const sp = SPECS[s.asset] as (typeof SPECS)[string] | undefined;
    if (!sp || SKIP_SHAPES.has(sp.shape)) continue;
    const k = s.s ?? 1;
    const hw = (sp.w * k) / 2;
    const hd = (sp.d * k) / 2;
    const c = Math.cos(s.rotY ?? 0);
    const n = Math.sin(s.rotY ?? 0);
    const P = (lx: number, lz: number): [number, number] => [sx(s.x + lx * c + lz * n), sy(s.z - lx * n + lz * c)];
    const pts = [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)];
    g.beginPath();
    for (const [i, [x, y]] of pts.entries()) {
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = 'rgba(120, 124, 140, 0.22)';
    g.fill();
    g.strokeStyle = '#6e7080';
    g.lineWidth = 1;
    g.stroke();
    g.strokeStyle = '#3a3c48';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(...pts[2]);
    g.lineTo(...pts[3]);
    g.stroke();
    obstacles.push({
      x0: Math.min(...pts.map((p) => p[0])),
      y0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])),
      y1: Math.max(...pts.map((p) => p[1])),
    });
    if (sp.n !== undefined) tags.push({ s: `#${sp.n}`, x: sx(s.x), y: sy(s.z) });
  }

  // 墙：实心段按真实厚度；门 = 缺口 + 开门弧（宽的门洞、拱 = 两条虚线），窗 = 细双线（高窗虚线）
  for (const w of walls) drawWall(w);
  function drawWall(w: Wall) {
    const ax = alongX(w);
    const c = ax ? w.a[1] : w.a[0];
    const low = w.h <= 1.05;
    /** 沿墙坐标 a、垂直偏移 o → 屏幕 */
    const at = (a: number, o: number): [number, number] => (ax ? [sx(a), sy(c + o)] : [sx(c + o), sy(a)]);
    const ht = w.t / 2;
    g.fillStyle = low ? '#8a8378' : INK;
    for (const p of wallPieces(w, w.h)) {
      if (p.y0 !== 0 || p.y1 !== w.h) continue;
      const [x0, y0] = at(p.a0, -ht);
      const [x1, y1] = at(p.a1, ht);
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    for (const o of w.open ?? []) {
      const l = o.at - o.w / 2;
      const r = o.at + o.w / 2;
      const line = (a0: number, o0: number, a1: number, o1: number) => {
        g.beginPath();
        g.moveTo(...at(a0, o0));
        g.lineTo(...at(a1, o1));
        g.stroke();
      };
      if ((o.sill ?? 0) > 0) {
        const high = (o.sill ?? 0) >= 1.5;
        const [x0, y0] = at(l, -ht);
        const [x1, y1] = at(r, ht);
        g.fillStyle = '#ffffff';
        g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        g.strokeStyle = INK;
        g.lineWidth = 1;
        line(l, -ht, r, -ht);
        line(l, ht, r, ht);
        g.strokeStyle = '#2f6fb0';
        g.lineWidth = 1.2;
        if (high) g.setLineDash([4, 3]);
        line(l, -ht * 0.3, r, -ht * 0.3);
        line(l, ht * 0.3, r, ht * 0.3);
        g.setLineDash([]);
        continue;
      }
      if (o.w >= 1.6) {
        // 宽的门洞 / 拱：上面的门楣画成两条虚线
        g.strokeStyle = 'rgba(35, 32, 28, 0.6)';
        g.lineWidth = 1;
        g.setLineDash([4, 3]);
        line(l, -ht, r, -ht);
        line(l, ht, r, ht);
        g.setLineDash([]);
        continue;
      }
      // 门扇往哪边开：外门往里开；两边都是房间就开进小的那间（不开进走廊、拱廊）
      const probe = ht + 0.5;
      const side = (sgn: number) => (ax ? roomAt(o.at, c + sgn * probe) : roomAt(c + sgn * probe, o.at));
      const rm = side(-1);
      const rp = side(1);
      const score = (r0?: Room) => (!r0 || r0.open ? Infinity : area(r0.r));
      const sgn = score(rp) <= score(rm) ? 1 : -1;
      const leaf = o.w * 0.95;
      g.strokeStyle = INK;
      g.lineWidth = 1.4;
      line(l, sgn * ht, l, sgn * (ht + leaf));
      g.strokeStyle = 'rgba(35, 32, 28, 0.55)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= 16; i++) {
        const th = (i / 16) * (Math.PI / 2);
        const [x, y] = at(l + Math.cos(th) * leaf, sgn * (ht + Math.sin(th) * leaf));
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
  }

  // 外门（一层）：橙色箭头从外面指进门 + 名字
  if (f === 1) {
    const DIR = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] } as const;
    for (const [key, d] of Object.entries(DOORS) as [keyof typeof DOORS, (typeof DOORS)[keyof typeof DOORS]][]) {
      const [dx, dz] = DIR[d.facing];
      const name = DOOR_LABEL[key] ?? d.name;
      const x0 = sx(d.x + dx * 2.2);
      const y0 = sy(d.z + dz * 2.2);
      arrow(x0, y0, sx(d.x + dx * 0.4), sy(d.z + dz * 0.4), '#e2700e', 3.2, 12);
      g.font = font(13, true);
      const tw = g.measureText(name).width;
      const tx = dx > 0 ? x0 + 5 : dx < 0 ? x0 - tw - 5 : x0 - tw / 2;
      const ty = dz > 0 ? y0 + 16 : dz < 0 ? y0 - 6 : y0 + 5;
      text(name, tx, ty, 13, '#b4520a', true);
      obstacles.push({ x0: tx - 2, y0: ty - 14, x1: tx + tw + 2, y1: ty + 4 });
      obstacles.push({
        x0: Math.min(x0, sx(d.x)) - 6,
        y0: Math.min(y0, sy(d.z)) - 6,
        x1: Math.max(x0, sx(d.x)) + 6,
        y1: Math.max(y0, sy(d.z)) + 6,
      });
    }
  }

  // 站位（洋红点）
  const floorOfY = (y: number) =>
    ([-1, 1, 2] as Floor[]).reduce((b, o) => (Math.abs(FLOOR_Y[o] - y) < Math.abs(FLOOR_Y[b] - y) ? o : b), 1 as Floor);
  for (const sp of Object.values(SPOTS)) {
    const [x, z, y = 0] = sp.at;
    if (floorOfY(y) !== f) continue;
    g.fillStyle = '#c0188a';
    g.beginPath();
    g.arc(sx(x), sy(z), 4, 0, Math.PI * 2);
    g.fill();
    obstacles.push({ x0: sx(x) - 5, y0: sy(z) - 5, x1: sx(x) + 5, y1: sy(z) + 5 });
    if (sp.name) {
      text(sp.name, sx(x) + 6, sy(z) - 5, 10, '#a0106e');
      g.font = font(10);
      obstacles.push({ x0: sx(x) + 4, y0: sy(z) - 16, x1: sx(x) + 8 + g.measureText(sp.name).width, y1: sy(z) - 1 });
    }
  }
  g.font = font(9, true);
  for (const t of tags) {
    const tw = g.measureText(t.s).width;
    text(t.s, t.x - tw / 2, t.y + 3, 9, '#3a3c48', true);
  }

  // 房间名 + 面积（同名的几块一起算）：在房间里找一个最少压到东西的位置
  const areaOf = (r: Room) => rooms.filter((o) => o.name === r.name).reduce((a, o) => a + area(o.r), 0);
  const placed: Box[] = [];
  const placeLabel = (name: string, sub: string | null, r: Rect, color = INK) => {
    const inset = 0.3 * S;
    const bx: Box = { x0: sx(r.x0) + inset, y0: sy(r.z0) + inset, x1: sx(r.x1) - inset, y1: sy(r.z1) - inset };
    let px = 16;
    g.font = font(px, true);
    while (px > 10 && g.measureText(name).width > bx.x1 - bx.x0 - 4) {
      px -= 1;
      g.font = font(px, true);
    }
    const nw = g.measureText(name).width;
    const spx = Math.max(10, px - 4);
    g.font = font(spx);
    const sw = sub ? g.measureText(sub).width : 0;
    const lw = Math.max(nw, sw) + 6;
    const lh = px + (sub ? spx + 4 : 0) + 4;
    const cx0 = (bx.x0 + bx.x1) / 2;
    const cy0 = (bx.y0 + bx.y1) / 2;
    let best = { x: cx0, y: cy0, cost: Infinity };
    const N = 14;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = Math.max(bx.x0 + lw / 2, Math.min(bx.x1 - lw / 2, bx.x0 + ((bx.x1 - bx.x0) * i) / N));
        const y = Math.max(bx.y0 + lh / 2, Math.min(bx.y1 - lh / 2, bx.y0 + ((bx.y1 - bx.y0) * j) / N));
        const lb: Box = { x0: x - lw / 2, y0: y - lh / 2, x1: x + lw / 2, y1: y + lh / 2 };
        let hit = 0;
        for (const o of obstacles) hit += overlap(lb, o);
        for (const o of placed) hit += overlap(lb, o) * 4;
        const cost = hit * 10 + Math.hypot(x - cx0, y - cy0);
        if (cost < best.cost) best = { x, y, cost };
      }
    }
    const top = best.y - lh / 2 + 2;
    text(name, best.x - nw / 2, top + px - 2, px, color, true);
    if (sub) text(sub, best.x - sw / 2, top + px + spx + 1, spx, '#5d554b');
    placed.push({ x0: best.x - lw / 2, y0: best.y - lh / 2, x1: best.x + lw / 2, y1: best.y + lh / 2 });
  };
  for (const r of rooms) {
    if (r.noLabel) continue;
    const a = areaOf(r);
    placeLabel(r.name, `${a < 10 ? a.toFixed(1) : Math.round(a)} m²`, r.r);
  }
  for (const l of ctxLabels) placeLabel(l.s, null, l.r, l.color);
  if (f === -1) {
    // 天光的名字：格栅带写在它上沿外面（北巷），玻璃砖带竖着太窄 → 写在旁边；天窗、南边的玻璃砖写在框里 / 框下
    g.font = font(11, true);
    for (const { r, name } of DAYLIGHT) {
      const tw = g.measureText(name).width;
      const w = (r.x1 - r.x0) * S;
      if (r === GRATE) text(name, sx((r.x0 + r.x1) / 2) - tw / 2, sy(r.z0) - 3, 11, '#7a5a08', true);
      else if (r === GLASS_W) {
        g.save();
        g.translate(sx(r.x1) + 13, sy((r.z0 + r.z1) / 2) + tw / 2);
        g.rotate(-Math.PI / 2);
        text(name, 0, 0, 11, '#7a5a08', true);
        g.restore();
      } else if (w > tw + 4) text(name, sx((r.x0 + r.x1) / 2) - tw / 2, sy((r.z0 + r.z1) / 2) + 4, 11, '#7a5a08', true);
      else text(name, sx((r.x0 + r.x1) / 2) - tw / 2, sy(r.z1) + 13, 11, '#7a5a08', true);
    }
  }
  g.restore();

  // 坐标刻度（世界米）：上沿 x、左沿 z
  g.fillStyle = '#4a5468';
  g.font = font(11);
  g.textBaseline = 'alphabetic';
  for (let x = Math.ceil(VIEW.x0 / 2) * 2; x <= VIEW.x1; x += 2) {
    const s = num(x);
    const tw = g.measureText(s).width;
    g.fillText(s, sx(x) - tw / 2, M.t - 7);
  }
  for (let z = Math.ceil(VIEW.z0 / 2) * 2; z <= VIEW.z1; z += 2) {
    const s = num(z);
    const tw = g.measureText(s).width;
    g.fillText(s, M.l - tw - 6, sy(z) + 4);
  }
  g.fillStyle = '#7a8496';
  g.fillText('x', M.l - 18, M.t - 7);
  g.fillText('z', M.l - 18, M.t + 2);

  // 标题栏
  g.fillStyle = '#2b2530';
  g.fillRect(0, 0, CW, TITLE_H);
  g.fillStyle = '#fff3d6';
  g.font = font(20, true);
  g.fillText(`会所 · ${FLOOR_NAME[f]} ${LEVEL_TITLE[f]}`, 16, 31);
  g.font = font(12);
  g.fillStyle = 'rgba(255, 243, 214, 0.7)';
  g.fillText(`地面 y ${num(FLOOR_Y[f])} 米 · 网格 2 米 · 北在上`, 220, 30);

  // 底栏：比例尺 5 米、图例、指北针
  const by = CH - M.b + 30;
  const bx0 = M.l;
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : INK;
    g.fillRect(bx0 + i * S, by, S, 7);
  }
  g.strokeStyle = INK;
  g.lineWidth = 1;
  g.strokeRect(bx0 + 0.5, by + 0.5, 5 * S - 1, 6);
  g.fillStyle = INK;
  g.font = font(11);
  for (const i of [0, 1, 2, 5]) {
    const s = i === 5 ? '5 米' : `${i}`;
    g.fillText(s, bx0 + i * S - (i === 5 ? 8 : 3), by + 22);
  }
  // 图例：这一层用到的地面 + 家具 + 楼梯
  let lx = bx0 + 5 * S + 40;
  const used = [...new Set(rooms.map((r) => r.floor))];
  const legend: [string, (x: number, y: number) => void][] = used.map((k) => [
    FLOOR_FILL[k][1],
    (x, y) => {
      g.fillStyle = FLOOR_FILL[k][0];
      g.fillRect(x, y, 18, 12);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.strokeRect(x + 0.5, y + 0.5, 17, 11);
    },
  ]);
  legend.push([
    '家具占位 #编号',
    (x, y) => {
      g.fillStyle = 'rgba(120, 124, 140, 0.22)';
      g.fillRect(x, y, 18, 12);
      g.strokeStyle = '#6e7080';
      g.strokeRect(x + 0.5, y + 0.5, 17, 11);
      g.fillStyle = '#3a3c48';
      g.fillRect(x, y + 10, 18, 2);
    },
  ]);
  legend.push([
    '窗（虚线 = 高窗）',
    (x, y) => {
      g.strokeStyle = '#2f6fb0';
      g.beginPath();
      g.moveTo(x, y + 4.5);
      g.lineTo(x + 18, y + 4.5);
      g.moveTo(x, y + 7.5);
      g.lineTo(x + 18, y + 7.5);
      g.stroke();
    },
  ]);
  g.font = font(12);
  for (const [s, sw] of legend) {
    sw(lx, by - 3);
    g.fillStyle = INK;
    g.fillText(s, lx + 23, by + 8);
    lx += 23 + g.measureText(s).width + 16;
  }
  // 指北针
  const nx = CW - M.r - 26;
  const ny = by + 2;
  g.strokeStyle = INK;
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(nx, ny, 17, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(nx, ny - 14);
  g.lineTo(nx + 6, ny + 8);
  g.lineTo(nx, ny + 3);
  g.lineTo(nx - 6, ny + 8);
  g.closePath();
  g.fill();
  g.font = font(12, true);
  g.fillText('北', nx - 30 - 12, ny + 5);
}

const canvas = document.getElementById('plan') as HTMLCanvasElement | null;
if (canvas) {
  const f = floorParam();
  for (const a of document.querySelectorAll<HTMLAnchorElement>('nav a')) {
    a.setAttribute('aria-current', String(Number(a.dataset.floor) === f));
  }
  document.title = `会所平面 ${FLOOR_NAME[f]} · Tennis Director`;
  const run = () => {
    drawPlan(canvas, f);
    window.__planReady = true;
  };
  if (document.fonts?.ready) document.fonts.ready.then(run);
  else run();
}
