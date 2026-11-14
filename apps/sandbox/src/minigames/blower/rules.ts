// 吹叶清场的规则（纯函数，不碰 three / DOM；rules.test.ts 测）：叶子的物理（吹风锥、摩擦、墙、网）、
// 出界判定、场地干净度（格子）、最密的一团、阵风（吹回来几片、棕榈掉几片）、分数和星级线。
// 坐标同世界（米，y 朝上，北 = −z，东 = +x）。随机只走传进来的种子流。

/** 一局几秒 */
export const DURATION = 90;
/** 开局场上（双打线以内）几片 */
export const LEAVES = 56;
/** 开局已经在场边（线外）的几片：场边本来就有落叶，阵风从这里往回吹 */
export const LEAVES_GUTTER = 14;
/** 叶子最多几片（InstancedMesh 的容量） */
export const MAX_LEAVES = 360;
/** 叶子的种类：0 = 干棕榈叶（长、黄褐），1 = 枯叶（小、橙褐），2 = 青叶片（小、黄绿） */
export const KINDS = 3;

/** 阵风：每隔几秒一次，提前几秒预告 */
export const GUST_EVERY = 15;
export const GUST_WARN = 2;
/** 阵风刮多久（秒：叶子飞的那一阵、风线最密） */
export const GUST_DUR = 1.6;

/** 吹风锥：射程（米）、半角（弧度）、推力（米/秒²，锥心贴近出风口时） */
export const BLOW = { range: 5.0, half: 0.8, power: 30 } as const;

/** 分：吹出界一片 +3；吹散一堆沙 +30；结算 干净度每 1% +10；全干净 +300；提前清场剩的每秒 +10 */
export const LEAF_PTS = 3;
export const SAND_PTS = 30;
export const CLEAN_PTS = 10;
export const FULL_BONUS = 300;
export const PER_SEC = 10;
/** 星级线（bot 调的：见 README 里的说明 / 提交信息） */
export const STARS: [number, number, number] = [700, 1000, 1300];

/** 干净度的格子：双打场地切成 GX × GZ 格，一格里有叶子 / 沙 = 脏 */
export const GRID = { gx: 12, gz: 6 } as const;

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 网：一条竖线 x，从 z0 到 z1（叶子贴地吹不过去，比网高的能飞过去） */
export interface Net {
  x: number;
  z0: number;
  z1: number;
  h: number;
}

export interface Leaf {
  x: number;
  z: number;
  /** 离地高度（0 = 贴地） */
  y: number;
  vx: number;
  vz: number;
  vy: number;
  /** 朝向、转速（画面用） */
  rot: number;
  spin: number;
  kind: number;
  /** 现在算"在场上"（进了线、落了地）；出界时清掉 */
  on: boolean;
}

// ── 物理常数 ──
/** 贴地：速度按 e^(−FR·t) 衰减，再减一个常数摩擦 MU（米/秒²），慢于 STOP 就停 */
const FR = 2.4;
const MU = 0.9;
const STOP = 0.04;
/** 空中：重力（叶子飘，小）、最快下落、水平阻力 */
export const G = 3.2;
const VT = 2.2;
const AIR = 0.5;
/** 最快（米/秒） */
const VMAX = 7.5;
/** 出界要越过线多少才算（叶子画出来 0.6 米长：中心过线 0.3 = 整片都在线外） */
export const OUT_MARGIN = 0.3;
/** 落地多高以下才算"在场上"（飘着的叶子还不算） */
const LAND_Y = 0.25;

export const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

/** 吹风：出风口 (x, z)、朝向 (dx, dz)（单位向量）；power 可以按住久了加大 */
export interface Blow {
  x: number;
  z: number;
  dx: number;
  dz: number;
  range: number;
  half: number;
  power: number;
}

/** 总监走过去踢开脚边的叶子：位置、速度、半径 */
export interface Kick {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
}

export interface Env {
  court: Rect;
  /** 叶子能到的范围（看台、墙挡住） */
  box: Rect;
  net: Net | null;
  blow: Blow | null;
  kick?: Kick | null;
  rng: () => number;
}

/** 锥里离出风口 d、偏角余弦 cos 的推力（米/秒²）；锥外 0 */
export function blowForce(b: Blow, x: number, z: number): { f: number; ux: number; uz: number } {
  const rx = x - b.x;
  const rz = z - b.z;
  const d = Math.hypot(rx, rz);
  if (d > b.range || d < 1e-3) return { f: 0, ux: 0, uz: 0 };
  const cos = (rx * b.dx + rz * b.dz) / d;
  const cosH = Math.cos(b.half);
  if (cos <= cosH) return { f: 0, ux: 0, uz: 0 };
  // 越近越猛、锥心比锥边猛（锥边留 35%：扫过去的时候边上的也动一点）
  const near = (1 - d / b.range) ** 0.7;
  const mid = 0.35 + 0.65 * Math.sqrt((cos - cosH) / (1 - cosH));
  // 方向：八成顺着朝向、两成从出风口往外散（锥里的叶子往前稍微扇开，不是排成一条线）
  let ux = 0.8 * b.dx + 0.2 * (rx / d);
  let uz = 0.8 * b.dz + 0.2 * (rz / d);
  const l = Math.hypot(ux, uz) || 1;
  ux /= l;
  uz /= l;
  return { f: b.power * near * mid, ux, uz };
}

export interface StepEvents {
  /** 这一步刚出界的（下标） */
  exits: number[];
  /** 这一步刚落进场里的（下标） */
  enters: number[];
}

/** 叶子走一步（原地改 leaves）。返回出界 / 进场的事件 */
export function stepLeaves(leaves: Leaf[], dt: number, env: Env): StepEvents {
  const { court, box, net, blow, kick, rng } = env;
  const exits: number[] = [];
  const enters: number[] = [];
  for (let i = 0; i < leaves.length; i++) {
    const L = leaves[i];
    const x0 = L.x;
    // ── 吹 ──
    if (blow && L.y < 1.2) {
      const { f, ux, uz } = blowForce(blow, L.x, L.z);
      if (f > 0) {
        // 一点随机：方向抖 ±0.3 弧度、大小 ±30%（叶子轻重不一、风是乱的）
        const a = (rng() - 0.5) * 0.6;
        const k = f * (0.7 + rng() * 0.6) * dt;
        const c = Math.cos(a);
        const s = Math.sin(a);
        L.vx += (ux * c - uz * s) * k;
        L.vz += (ux * s + uz * c) * k;
        // 吹起来一点（贴地的叶子跳着走）
        if (L.y < 0.05) L.vy = Math.max(L.vy, Math.min(1.4, f * 0.05) * (0.5 + rng()));
        L.spin += (rng() - 0.5) * f * dt * 6;
      }
    }
    // ── 踢 ──
    if (kick && L.y < 0.1) {
      const dx = L.x - kick.x;
      const dz = L.z - kick.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.hypot(kick.vx, kick.vz);
      if (d < kick.r && sp > 0.3) {
        const k = 1 - d / kick.r;
        L.vx += (kick.vx * 0.5 + (dx / (d || 1)) * sp * 0.5) * k * dt * 8;
        L.vz += (kick.vz * 0.5 + (dz / (d || 1)) * sp * 0.5) * k * dt * 8;
      }
    }
    // ── 空中 / 地上 ──
    if (L.y > 0 || L.vy > 0) {
      L.vy = Math.max(-VT, L.vy - G * dt);
      const k = Math.exp(-AIR * dt);
      L.vx *= k;
      L.vz *= k;
      L.y += L.vy * dt;
      if (L.y <= 0) {
        L.y = 0;
        L.vy = 0;
        // 落地一下：水平速度掉一半
        L.vx *= 0.5;
        L.vz *= 0.5;
      }
    } else {
      const k = Math.exp(-FR * dt);
      L.vx *= k;
      L.vz *= k;
      const sp = Math.hypot(L.vx, L.vz);
      if (sp < STOP) {
        L.vx = 0;
        L.vz = 0;
      } else {
        const m = Math.max(0, sp - MU * dt) / sp;
        L.vx *= m;
        L.vz *= m;
      }
    }
    const sp = Math.hypot(L.vx, L.vz);
    if (sp > VMAX) {
      L.vx *= VMAX / sp;
      L.vz *= VMAX / sp;
    }
    L.x += L.vx * dt;
    L.z += L.vz * dt;
    L.rot += L.spin * dt;
    L.spin *= Math.exp(-3 * dt);
    // ── 网：贴地（比网低）的过不去，弹回来 ──
    if (net && L.y < net.h && L.z > net.z0 && L.z < net.z1 && (x0 - net.x) * (L.x - net.x) <= 0 && x0 !== net.x) {
      const side = x0 < net.x ? -1 : 1;
      L.x = net.x + side * 0.08;
      L.vx = -L.vx * 0.25;
    }
    // ── 墙（看台、广告板）：弹一点回来 ──
    if (L.x < box.x0) {
      L.x = box.x0;
      L.vx = Math.abs(L.vx) * 0.3;
    } else if (L.x > box.x1) {
      L.x = box.x1;
      L.vx = -Math.abs(L.vx) * 0.3;
    }
    if (L.z < box.z0) {
      L.z = box.z0;
      L.vz = Math.abs(L.vz) * 0.3;
    } else if (L.z > box.z1) {
      L.z = box.z1;
      L.vz = -Math.abs(L.vz) * 0.3;
    }
    // ── 进场 / 出界（有回差：出界要过线 OUT_MARGIN，进场要落地、在线里）──
    if (L.on) {
      if (!inRect(court, L.x, L.z, OUT_MARGIN)) {
        L.on = false;
        exits.push(i);
      }
    } else if (L.y < LAND_Y && inRect(court, L.x, L.z)) {
      L.on = true;
      enters.push(i);
    }
  }
  return { exits, enters };
}

/** 一片新叶子（地上、不动） */
export const leafAt = (x: number, z: number, kind: number, rot: number, court: Rect): Leaf => ({
  x,
  z,
  y: 0,
  vx: 0,
  vz: 0,
  vy: 0,
  rot,
  spin: 0,
  kind,
  on: inRect(court, x, z),
});

/** 叶子的种类：干棕榈叶多、枯叶次之、青叶片少 */
export const pickKind = (r: number) => (r < 0.45 ? 0 : r < 0.8 ? 1 : 2);

/**
 * 开局的叶子：一团一团的（棕榈叶被风卷到一起：网边、底线后、发球区里），再撒些零散的；场边（线外）也有一些。
 * 北边（看台那边，棕榈在墙外）的团多一点。
 */
export function scatterLeaves(
  rng: () => number,
  court: Rect,
  box: Rect,
  n = LEAVES,
  gutter = LEAVES_GUTTER,
  opts: { clumps?: number; netX?: number } = {},
): Leaf[] {
  const out: Leaf[] = [];
  const W = court.x1 - court.x0;
  const D = court.z1 - court.z0;
  const put = (x: number, z: number) => {
    if (!inRect(court, x, z, -0.15)) return false;
    // 不压在网上
    if (opts.netX !== undefined && Math.abs(x - opts.netX) < 0.2) return false;
    out.push(leafAt(x, z, pickKind(rng()), rng() * Math.PI * 2, court));
    return true;
  };
  const clumps = opts.clumps ?? 8;
  const inClumps = Math.round(n * 0.7);
  for (let c = 0; c < clumps; c++) {
    const cx = court.x0 + 1 + rng() * (W - 2);
    // 北边多一点：z 往北偏（rng² 靠近 0 = 北沿）
    const cz = court.z0 + 0.8 + rng() ** 1.4 * (D - 1.6);
    const k = Math.round(inClumps / clumps);
    for (let t = 0, got = 0; t < k * 20 && got < k && out.length < n; t++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 1.3;
      if (put(cx + Math.cos(a) * r * 1.2, cz + Math.sin(a) * r * 0.8)) got++;
    }
  }
  for (let t = 0; t < n * 50 && out.length < n; t++) put(court.x0 + rng() * W, court.z0 + rng() * D);
  // 场边（线外 0.6 米到墙）：阵风的"存货"
  for (let t = 0, got = 0; t < gutter * 50 && got < gutter; t++) {
    const x = box.x0 + rng() * (box.x1 - box.x0);
    const z = box.z0 + rng() * (box.z1 - box.z0);
    if (inRect(court, x, z, 0.6)) continue;
    // 西头太远的不要（离场地 8 米以内）
    if (x < court.x0 - 8) continue;
    out.push(leafAt(x, z, pickKind(rng()), rng() * Math.PI * 2, court));
    got++;
  }
  return out;
}

/** 沙堆（椭圆）：中心、半轴；amount < 0.08 当吹干净了 */
export interface Blob {
  x: number;
  z: number;
  rx: number;
  rz: number;
}

/** 场地干净度：格子里没有在场上的叶子、没有沙 = 干净。返回 0..1 和脏格子数 */
export function coverage(
  leaves: readonly Leaf[],
  court: Rect,
  blobs: readonly Blob[] = [],
  grid: { gx: number; gz: number } = GRID,
): { frac: number; dirty: number; total: number } {
  const { gx, gz } = grid;
  const total = gx * gz;
  const cw = (court.x1 - court.x0) / gx;
  const cd = (court.z1 - court.z0) / gz;
  const dirty = new Uint8Array(total);
  for (const L of leaves) {
    if (!L.on) continue;
    const i = Math.min(gx - 1, Math.max(0, Math.floor((L.x - court.x0) / cw)));
    const j = Math.min(gz - 1, Math.max(0, Math.floor((L.z - court.z0) / cd)));
    dirty[j * gx + i] = 1;
  }
  for (const b of blobs)
    for (let j = 0; j < gz; j++)
      for (let i = 0; i < gx; i++) {
        // 格子里离椭圆中心最近的点在不在椭圆里（沙堆压到格子的一角也算脏）
        const nx = Math.min(Math.max(b.x, court.x0 + i * cw), court.x0 + (i + 1) * cw);
        const nz = Math.min(Math.max(b.z, court.z0 + j * cd), court.z0 + (j + 1) * cd);
        if (((nx - b.x) / b.rx) ** 2 + ((nz - b.z) / b.rz) ** 2 <= 1) dirty[j * gx + i] = 1;
      }
  let n = 0;
  for (let k = 0; k < total; k++) n += dirty[k];
  return { frac: (total - n) / total, dirty: n, total };
}

/** 场上叶子最密的一团：周围 r 米内场上叶子最多的那片叶子的位置和个数（场上没有 = null） */
export function densest(leaves: readonly Leaf[], r = 2): { x: number; z: number; n: number } | null {
  let best: { x: number; z: number; n: number } | null = null;
  const r2 = r * r;
  for (const a of leaves) {
    if (!a.on) continue;
    let n = 0;
    let sx = 0;
    let sz = 0;
    for (const b of leaves) {
      if (!b.on) continue;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      if (dx * dx + dz * dz <= r2) {
        n++;
        sx += b.x;
        sz += b.z;
      }
    }
    if (!best || n > best.n) best = { x: sx / n, z: sz / n, n };
  }
  return best;
}

/** 第 k 次阵风（1 起）：吹回来几片、棕榈掉几片新的、沙积回来多少 —— 越往后越大 */
export function gustPlan(k: number): { back: number; fresh: number; sand: number } {
  return { back: 1 + k, fresh: k + 1, sand: k >= 3 ? 0.35 : 0 };
}

/** 阵风的方向（风往哪吹，单位向量）：西头敞口灌进来的西风最多，其次北风（墙外棕榈那边） */
export function gustDir(rng: () => number): { x: number; z: number; from: string } {
  const r = rng();
  const opts: [number, number, string][] = [
    [1, 0, '西'],
    [0.7, 0.7, '西北'],
    [0, 1, '北'],
    [-0.7, 0.7, '东北'],
    [-1, 0, '东'],
  ];
  const w = [0.32, 0.22, 0.22, 0.12, 0.12];
  let acc = 0;
  for (let i = 0; i < opts.length; i++) {
    acc += w[i];
    if (r < acc || i === opts.length - 1) {
      const [x, z, from] = opts[i];
      const l = Math.hypot(x, z);
      return { x: x / l, z: z / l, from };
    }
  }
  return { x: 1, z: 0, from: '西' };
}

/** 风往 (dx, dz) 吹：屏幕上的箭头字（相机 yaw 0：+x 右、+z 下） */
export function arrowOf(dx: number, dz: number): string {
  const a = Math.atan2(dz, dx); // 0 = 右，π/2 = 下
  const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  const k = Math.round(a / (Math.PI / 4));
  return arrows[((k % 8) + 8) % 8];
}

/**
 * 阵风吹回场上的：场外（不在场上、贴地）、在上风那边的叶子，离场地近的先。不够就拿别的场外叶子凑。
 */
export function pickBack(leaves: readonly Leaf[], court: Rect, dir: { x: number; z: number }, n: number): number[] {
  const cx = (court.x0 + court.x1) / 2;
  const cz = (court.z0 + court.z1) / 2;
  const dist = (L: Leaf) => {
    const dx = Math.max(court.x0 - L.x, 0, L.x - court.x1);
    const dz = Math.max(court.z0 - L.z, 0, L.z - court.z1);
    return Math.hypot(dx, dz);
  };
  const off = leaves.map((L, i) => ({ L, i })).filter(({ L }) => !L.on && L.y < 0.05);
  const up = off.filter(({ L }) => (L.x - cx) * dir.x + (L.z - cz) * dir.z < 0).sort((a, b) => dist(a.L) - dist(b.L));
  const rest = off.filter((o) => !up.includes(o)).sort((a, b) => dist(a.L) - dist(b.L));
  return [...up, ...rest].slice(0, n).map((o) => o.i);
}

/**
 * 吹回来的叶子落在哪：顺着风从它现在的位置往场里走，过线以后再往里 1～3.5 米（上风那条线里面的一条带）。
 * 顺着风进不了场（在场地侧面）= 落在离它最近的场内点再往里一点。
 */
export function backTarget(L: Leaf, court: Rect, dir: { x: number; z: number }, r: number): [number, number] {
  const deep = 1 + r * 2.5;
  for (let k = 0; k < 40; k += 0.25) {
    const x = L.x + dir.x * k;
    const z = L.z + dir.z * k;
    if (inRect(court, x, z, -0.3)) return clampIn(court, x + dir.x * deep, z + dir.z * deep, 0.4);
  }
  return clampIn(court, L.x + dir.x * deep, L.z + dir.z * deep, 0.4 + deep);
}

const clampIn = (c: Rect, x: number, z: number, pad: number): [number, number] => [
  Math.min(c.x1 - pad, Math.max(c.x0 + pad, x)),
  Math.min(c.z1 - pad, Math.max(c.z0 + pad, z)),
];

/**
 * 棕榈掉下来的新叶子落在哪：一两团（一片大叶子在风里碎开），团心在上风那半场，每团半径 1.4 米。
 * 返回 n 个落点。
 */
export function freshTargets(
  rng: () => number,
  court: Rect,
  dir: { x: number; z: number },
  n: number,
  clumps = 1,
): [number, number][] {
  const cx = (court.x0 + court.x1) / 2;
  const cz = (court.z0 + court.z1) / 2;
  const hx = (court.x1 - court.x0) / 2;
  const hz = (court.z1 - court.z0) / 2;
  const centers: [number, number][] = [];
  for (let c = 0; c < clumps; c++) {
    // 上风那半：沿风往回 0.2～0.75 个半场，横着随便
    const back = 0.2 + rng() * 0.55;
    const side = (rng() * 2 - 1) * 0.8;
    const x = cx - dir.x * back * hx + -dir.z * side * hx;
    const z = cz - dir.z * back * hz + dir.x * side * hz;
    centers.push(clampIn(court, x, z, 1.4));
  }
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = centers[i % clumps];
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 1.4;
    out.push(clampIn(court, x + Math.cos(a) * r, z + Math.sin(a) * r * 0.8, 0.3));
  }
  return out;
}

/** 空中飘到落地要多久（从高度 y0、初速 vy0 起，按 stepLeaves 的空中物理） */
export function flightTime(y0: number, vy0: number, dt = 1 / 60): number {
  let y = y0;
  let vy = vy0;
  let t = 0;
  while ((y > 0 || vy > 0) && t < 20) {
    vy = Math.max(-VT, vy - G * dt);
    y += vy * dt;
    t += dt;
  }
  return t;
}

/** 把叶子扔起来，让它（大约）落在 (tx, tz)：从现在的位置、高度 y0、往上 vy0 */
export function launchTo(L: Leaf, tx: number, tz: number, y0: number, vy0: number, spin = 6): void {
  const T = flightTime(y0, vy0);
  const dx = tx - L.x;
  const dz = tz - L.z;
  // 水平按 e^(−AIR·t) 衰减：走过的距离 = v0 (1 − e^(−AIR·T)) / AIR
  const k = (1 - Math.exp(-AIR * T)) / AIR;
  L.y = y0;
  L.vy = vy0;
  L.vx = dx / k;
  L.vz = dz / k;
  L.spin = spin;
  L.on = false;
}

export interface Tally {
  /** 吹出界的片数（一局里一共） */
  cleared: number;
  /** 吹散的沙堆 */
  sand: number;
  /** 结束时的干净度 0..1 */
  clean: number;
  /** 刮了几次阵风 */
  gusts: number;
  /** 提前清场时剩的秒（时间到 = 0） */
  timeLeft: number;
}

/** 结算：明细 + 奖励（干净度分、全清奖励、剩余时间分） */
export function settle(t: Tally): {
  lines: { label: string; value: string }[];
  bonus: { label: string; value: number }[];
} {
  const pct = Math.round(t.clean * 100);
  const bonus: { label: string; value: number }[] = [
    { label: `场地干净 ${pct}% × ${CLEAN_PTS}`, value: pct * CLEAN_PTS },
  ];
  if (pct >= 100) {
    bonus.push({ label: '全场干净', value: FULL_BONUS });
    const s = Math.floor(Math.max(0, t.timeLeft));
    if (s > 0) bonus.push({ label: `提前 ${s} 秒开赛 × ${PER_SEC}`, value: s * PER_SEC });
  }
  const lines = [
    { label: '吹出界', value: `${t.cleared} 片` },
    { label: '吹散的沙', value: `${t.sand} 堆` },
    { label: '挨过的阵风', value: `${t.gusts} 次` },
  ];
  return { lines, bonus };
}
