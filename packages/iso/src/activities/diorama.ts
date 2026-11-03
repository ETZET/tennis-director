import { clamp, mulberry32, pick, type Rand, range } from '@td/shared';
import { Custom, type DrawContext, Group, type Node } from '../core/graph';
import { Particles } from '../fx/particles';
import { labelPlane } from '../fx/sprites';
import { CourtFrame } from '../world/frame';
import { VENUE_STYLE } from './looks';
import { AUTUMN, bareTree, jit, mixHex, PropBatch, tree } from './props';
import type { ActivityMeta, Conditions, StartOptions, Weather } from './types';

/**
 * 动画库的小岛（只给 sandbox 用）：一块按活动原生大小切出来的浮空小方台，
 * 按场地风格铺地面贴图（球场线、红土、草地、跑道、广场）、拉网、围网、角落装饰，下雨时画雨丝。
 * 活动本身（人物、道具）由 startActivity 加在 `scene` 上；游戏里用的是真实场景，不需要这个。
 *
 * 像素版：地面（旧版的 flat 批次）画进 IsoWorld 的地面贴图，实体（旧版的 solid 批次）是 statics 下的 Box 节点，
 * 半透明的围网和球网换成 Custom 画的网格线。灯光由 IsoWorld 的天色管，这里只给天空色。
 */

/** buildDiorama 需要的 IsoWorld 子集（结构类型，方便测试时替身）。 */
export interface DioramaWorld {
  /** 动态根节点：活动、人物、粒子、雨挂这里 */
  readonly scene: Node;
  /** 静态根节点：小岛的实体挂这里 */
  readonly statics: Node;
  /** 地面贴图：fn 返回打包的像素色（ABGR，和 ImageData 一样），0 = 不改 */
  readonly ground: {
    paintRect(x0: number, x1: number, z0: number, z1: number, fn: (x: number, z: number, cur: number) => number): void;
  };
  readonly view?: { invalidate(): void };
}

const WX: Record<Weather, { sky: string }> = {
  sun: { sky: '#a9d0e3' },
  cloud: { sky: '#a1aab0' },
  rain: { sky: '#6f7c86' },
  wind: { sky: '#b9cbd3' },
  heat: { sky: '#efcd94' },
};

export interface Diorama {
  /** 活动挂的根节点（world.scene） */
  readonly scene: Node;
  /** 小岛的静态节点（在 world.statics 下） */
  readonly root: Node;
  /** 天空色（'#rrggbb'） */
  readonly sky: string;
  /** 活动的场地坐标系（球网或区域中心） */
  readonly area: CourtFrame;
  /** startActivity 的 bounds 和 extras.perches */
  readonly bounds: NonNullable<StartOptions['bounds']>;
  readonly perches: { x: number; y: number; z: number }[];
  /** 小岛的宽和深（相机取景用） */
  readonly W: number;
  readonly D: number;
  groundY(x: number, z: number): number;
  /** 雨丝、溅水 */
  update(dt: number): void;
  /** 摘掉小岛的节点（地面贴图不还原：换小岛时由宿主重画或重建 IsoWorld） */
  dispose(): void;
}

/** 小岛上活动的场地坐标系和范围（不建场景，方便测试） */
export function dioramaArea(meta: ActivityMeta): { area: CourtFrame; bounds: NonNullable<StartOptions['bounds']> } {
  const { W, D } = meta.size;
  const nx = meta.netX ?? 0;
  return {
    area: new CourtFrame(nx, -0.07, 0, 0, W / 2, D / 2),
    bounds: { x0: -W / 2 - nx + 0.15, x1: W / 2 - nx - 0.15, z0: -D / 2 + 0.15, z1: D / 2 - 0.15 },
  };
}

/** '#rrggbb' → ABGR 打包色（不透明） */
function pack(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16) || 0;
  return ((0xff << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

/** 地面贴图的最小线宽（贴图约 0.2 米一格，太细的线会落在格子中心之间） */
const MIN_W = 0.21;

export function buildDiorama(world: DioramaWorld, meta: ActivityMeta, C: Conditions, seed = 7): Diorama {
  const rand: Rand = mulberry32(seed);
  const rr = (a: number, b: number) => range(rand, a, b);
  const chance = (p: number) => rand() < p;
  const S = VENUE_STYLE[C.venue];
  const { W, D } = meta.size;
  const nx = meta.netX ?? 0;
  const hot = C.weather === 'heat';
  const sky = S.sky ? mixHex(WX[C.weather].sky, S.sky[0], S.sky[1]) : WX[C.weather].sky;

  const root = new Group();
  root.name = 'diorama';
  const solid = new PropBatch();
  const own: Node[] = [];
  const add = <T extends Node>(o: T): T => {
    root.add(o);
    own.push(o);
    return o;
  };

  /* ---- 地面贴图（旧版的 flat 批次） ---- */
  const inIsland = (x: number, z: number) => Math.abs(x) <= W / 2 && Math.abs(z) <= D / 2;
  /** 轴对齐的一块（中心、宽、深） */
  const paint = (x: number, z: number, w: number, d: number, hex: string) => {
    const c = pack(hex);
    const hw = Math.max(w, MIN_W) / 2;
    const hd = Math.max(d, MIN_W) / 2;
    world.ground.paintRect(x - hw, x + hw, z - hd, z + hd, (px, pz) => (inIsland(px, pz) ? c : 0));
  };
  /** 绕 y 转了 ry 的一块（落叶、裂缝、纸屑） */
  const paintRot = (x: number, z: number, w: number, d: number, ry: number, hex: string) => {
    const c = pack(hex);
    const cs = Math.cos(ry);
    const sn = Math.sin(ry);
    const hw = Math.max(w, MIN_W) / 2;
    const hd = Math.max(d, MIN_W) / 2;
    const r = Math.hypot(hw, hd);
    world.ground.paintRect(x - r, x + r, z - r, z + r, (px, pz) => {
      const dx = px - x;
      const dz = pz - z;
      // three 的绕 y 旋转：局部 u 轴 = (cos, -sin)
      const u = dx * cs - dz * sn;
      const v = dx * sn + dz * cs;
      return Math.abs(u) <= hw && Math.abs(v) <= hd && inIsland(px, pz) ? c : 0;
    });
  };
  const tile = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    cols: readonly string[],
    _yTop = 0,
    size = 1,
    worn = false,
  ) => {
    for (let x = x0; x < x1 - 1e-3; x += size)
      for (let z = z0; z < z1 - 1e-3; z += size) {
        const tw = Math.min(size, x1 - x);
        const td = Math.min(size, z1 - z);
        const c = worn && S.worn && chance(0.14) ? jit(rand, S.worn, 0.03) : jit(rand, pick(cols, rand), 0.03);
        const cc = pack(c);
        world.ground.paintRect(x, x + tw, z, z + td, () => cc);
      }
  };
  /** 地面上的线（Hollow Creek 断断续续），随机数的用法和 props.line 一样 */
  const gline = (x0: number, z0: number, x1: number, z1: number, col: string, gap = 0, w = 0.08) => {
    const along = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (!gap) {
      paint((x0 + x1) / 2, (z0 + z1) / 2, along ? len + w : w, along ? w : len + w, col);
      return;
    }
    const n = Math.max(1, Math.round(len));
    for (let i = 0; i < n; i++) {
      if (rand() < gap) continue;
      const t = (i + 0.5) / n;
      const sl = len / n;
      paint(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, along ? sl : w, along ? w : sl, jit(rand, col, 0.05));
    }
  };
  const L = (x0: number, z0: number, x1: number, z1: number, col = S.line, w2 = 0.08) =>
    gline(Math.max(-W / 2, x0), z0, Math.min(W / 2, x1), z1, col, S.gap, w2);

  /* ---- 岛体 ---- */
  solid.box(0, -2.0, 0, W - 0.2, 1.94, D - 0.2, '#4e4034');
  for (const [y1, y0, col] of [
    [-0.06, -0.55, '#7b5a3c'],
    [-0.55, -1.3, '#665040'],
    [-1.3, -2.0, '#544438'],
  ] as const) {
    const h = y1 - y0;
    for (let x = -W / 2; x < W / 2 - 1e-3; x += 1) {
      solid.box(x + 0.5, y0, D / 2 - 0.05, 1, h, 0.12, jit(rand, col, 0.05));
      solid.box(x + 0.5, y0, -D / 2 + 0.05, 1, h, 0.12, jit(rand, col, 0.05));
    }
    for (let z = -D / 2; z < D / 2 - 1e-3; z += 1) {
      solid.box(W / 2 - 0.05, y0, z + 0.5, 0.12, h, 1, jit(rand, col, 0.05));
      solid.box(-W / 2 + 0.05, y0, z + 0.5, 0.12, h, 1, jit(rand, col, 0.05));
    }
  }
  tile(-W / 2, W / 2, -D / 2, D / 2, hot ? ['#8c9150', '#959856', '#868c4c'] : S.grass, 0, 1);

  /* ---- 地面 ---- */
  const g = meta.ground;
  if (g === 'court') {
    // 一块标准网球场，球网在 x=nx，裁到小岛范围里
    const bx0 = nx - 11.885;
    const bx1 = nx + 11.885;
    tile(-W / 2, W / 2, -D / 2 + 0.5, D / 2 - 0.5, S.out, 0.012, 2, true);
    tile(Math.max(-W / 2, bx0), Math.min(W / 2, bx1), -5.485, 5.485, S.inn, 0.018, 2, true);
    for (const x of [bx0, bx1]) if (x >= -W / 2 && x <= W / 2) L(x, -5.485, x, 5.485);
    for (const z of [-5.485, 5.485, -4.115, 4.115]) L(bx0, z, bx1, z);
    for (const s of [-1, 1]) {
      const x = nx + s * 6.4;
      if (x >= -W / 2 && x <= W / 2) L(x, -4.115, x, 4.115);
    }
    L(nx - 6.4, 0, nx + 6.4, 0);
    netAt(nx, 6.2);
  } else if (g === 'minicourt') {
    tile(-W / 2, W / 2, -D / 2 + 0.5, D / 2 - 0.5, S.out, 0.012, 2, true);
    tile(-6, 6, -5, 4.2, S.inn, 0.018, 2, true);
  } else if (g === 'pickle') {
    tile(-W / 2, W / 2, -D / 2 + 0.3, D / 2 - 0.3, S.out, 0.012, 2, true);
    tile(-6.705, 6.705, -3.05, 3.05, S.inn, 0.018, 1, true);
    const yel = '#f2d23a';
    for (const x of [-6.705, 6.705, -2.13, 2.13]) L(x, -3.05, x, 3.05, yel);
    for (const z of [-3.05, 3.05]) L(-6.705, z, 6.705, z, yel);
    L(-6.705, 0, -2.13, 0, yel);
    L(2.13, 0, 6.705, 0, yel);
    netAt(0, 3.4, 0.86);
  } else if (g === 'clay') {
    const clay =
      C.venue === 'hollow' ? ['#a86a48', '#9a6244', '#8f6a50', '#7d7a48'] : ['#c46a42', '#c87048', '#bd6440'];
    tile(-W / 2, W / 2, -D / 2 + 0.5, D / 2 - 0.5, clay, 0.012, 1);
    for (const x of [-10.5, 10.5]) L(x, -5.485, x, 5.485, '#efe6d6');
    for (const z of [-5.485, 5.485]) L(-10.5, z, 10.5, z, '#efe6d6');
  } else if (g === 'track') {
    if (C.venue === 'maple') tile(-W / 2, W / 2, -5.4, 5.4, ['#a8503c', '#ad5540', '#a24b38'], 0.012, 1);
    else if (C.venue === 'hollow') {
      tile(-W / 2, W / 2, -D / 2, D / 2, ['#5a5b57', '#55564f', '#60615b', '#4f504c'], 0.012, 1);
      for (let x = -8; x < 10; x += 3) gline(x, 4.6, x, 6.3, '#c9a83a', 0, 0.1);
    } else
      for (let x = -W / 2; x < W / 2; x += 2)
        tile(
          x,
          x + 2,
          -D / 2,
          D / 2,
          Math.round((x + W / 2) / 2) % 2 ? ['#5d9a4e', '#609d51'] : ['#53904a', '#56934b'],
          0.012,
          1,
        );
  } else if (g === 'plaza') {
    tile(
      -W / 2,
      W / 2,
      -D / 2,
      D / 2,
      C.venue === 'maple'
        ? ['#a8604a', '#b06850', '#9c5844', '#a45c48']
        : C.venue === 'hollow'
          ? ['#9a9890', '#a3a199', '#8f8d85', '#8a8780']
          : ['#bdb5a3', '#c4bcab', '#b4ad9b', '#c9c1af'],
      0.014,
      1,
    );
  }

  /* ---- 场地风格 ---- */
  const puddles: { x: number; z: number; w: number; d: number }[] = [];
  if (C.venue === 'maple') {
    for (let i = 0; i < Math.round((W * D) / 5); i++) {
      const x = rr(-W / 2 + 0.2, W / 2 - 0.2);
      const z = rr(-D / 2 + 0.2, D / 2 - 0.2);
      const col = jit(rand, pick(AUTUMN, rand), 0.05);
      paintRot(x, z, 0.22, 0.22, rr(0, 3), col);
    }
  } else if (C.venue === 'hollow') {
    for (let k = 0; k < Math.round((W * D) / 20); k++) {
      let x = rr(-W / 2 + 0.5, W / 2 - 0.5);
      let z = rr(-D / 2 + 0.5, D / 2 - 0.5);
      let ang = rr(0, 6.28);
      const n = Math.floor(rr(5, 12));
      for (let i = 0; i < n; i++) {
        // 裂缝
        paintRot(x, z, 0.44, 0.06, ang, '#363a35');
        if (chance(0.25))
          for (let j = 0; j < 3; j++)
            solid.box(
              x + rr(-0.1, 0.1),
              0.03,
              z + rr(-0.1, 0.1),
              0.07,
              rr(0.1, 0.3),
              0.07,
              jit(rand, pick(['#5e7a2e', '#6d7f34', '#4f6a2a'], rand), 0.05),
              rr(0, 3),
              rr(-0.3, 0.3),
              rr(-0.3, 0.3),
            );
        x += Math.cos(ang) * 0.42;
        z -= Math.sin(ang) * 0.42;
        ang += rr(-0.6, 0.6);
      }
    }
    for (let k = 0; k < Math.round((W * D) / 30); k++) {
      const x = rr(-W / 2 + 0.3, W / 2 - 0.3);
      const z = rr(-D / 2 + 0.3, D / 2 - 0.3);
      if (chance(0.5))
        // 倒在地上的易拉罐
        solid.box(x, 0.03, z, 0.07, 0.12, 0.07, pick(['#b23a2c', '#c9c9c2', '#3b6ea8'], rand), 0, Math.PI / 2, 0);
      else {
        const w2 = rr(0.15, 0.3);
        const d2 = rr(0.1, 0.25);
        const col = jit(rand, '#e2ddcf', 0.06);
        paintRot(x, z, w2, d2, rr(0, 3), col);
      }
    }
    for (let k = 0; k < Math.max(2, Math.round((W * D) / 70)); k++) puddles.push(puddle());
  }
  if (C.weather === 'rain') for (let k = 0; k < Math.round((W * D) / 45); k++) puddles.push(puddle());
  function puddle() {
    const x = rr(-W / 2 + 1.5, W / 2 - 1.5);
    const z = rr(-D / 2 + 1.5, D / 2 - 1.5);
    const w2 = rr(0.9, 2.2);
    const d2 = rr(0.6, 1.5);
    paint(x, z, w2, d2, '#5d7480');
    paint(x - w2 * 0.15, z - d2 * 0.1, w2 * 0.35, d2 * 0.3, '#93acb8');
    return { x, z, w: w2, d: d2 };
  }

  // 后围网（球场；Hollow Creek 的空地也围着）
  const perches: { x: number; y: number; z: number }[] = [];
  const fenced =
    g === 'court' || g === 'minicourt' || g === 'pickle' || g === 'clay' || (C.venue === 'hollow' && g !== 'plaza');
  if (fenced) {
    const z = -D / 2 + 0.15;
    const H = 2.6;
    const n = Math.round(W / 3);
    const bw = (W - 0.3) / n;
    const x0 = -W / 2 + 0.15;
    const hol = C.venue === 'hollow';
    const meshCol = hol ? '#3a3935' : '#25332d';
    const posts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + bw * i;
      const lean = hol && chance(0.3);
      solid.box(
        x,
        0,
        z,
        0.1,
        H,
        0.1,
        hol ? jit(rand, pick(['#5a5148', '#4a4c49'], rand), 0.05) : '#2e3b33',
        0,
        lean ? rr(-0.12, 0.12) : 0,
        lean ? rr(-0.1, 0.1) : 0,
      );
      posts.push(x);
    }
    for (let i = 0; i < n; i++) {
      const cx = x0 + bw * (i + 0.5);
      if (!(hol && chance(0.18))) add(mesh(cx, z, bw, H, meshCol, 0.35));
      for (const [y, miss] of [
        [H, 0.15],
        [0.1, 0.1],
      ] as const) {
        if (hol && chance(miss)) continue;
        solid.box(cx, y - 0.05, z, bw, 0.06, 0.06, hol ? jit(rand, '#55504a', 0.04) : '#2e3b33');
      }
      if (C.venue === 'maple') solid.box(cx, 0.05, z - 0.05, bw, 1.4, 0.05, '#22402e');
      else if (chance(0.5))
        solid.box(cx, 0.05, z - 0.05, bw * rr(0.4, 0.95), rr(0.6, 1.4), 0.05, jit(rand, '#3b4a3d', 0.05));
    }
    if (C.venue === 'maple') {
      const bn = add(labelPlane('MAPLE RIDGE RAVENS · TENNIS', Math.min(10, W * 0.45), 0.55, '#7c2232', '#e6b03c', 18));
      bn.position.set(0, 0.95, z + 0.02);
    } else
      posts
        .filter((_, i) => i % 3 === 1)
        .slice(0, 3)
        .forEach((x) => {
          perches.push({ x: x - nx, y: H, z });
        });
  }
  if (g === 'plaza') {
    const z = -D / 2 + 0.4;
    if (C.venue === 'maple') {
      for (let y = 0; y < 2.4; y += 0.3)
        for (let x = -W / 2 + 0.2; x < W / 2 - 0.2; x += 1.2) {
          const off = (Math.round(y / 0.3) % 2) * 0.6;
          solid.box(clamp(x + off, -W / 2 + 0.6, W / 2 - 0.6), y, z, 1.15, 0.28, 0.4, jit(rand, '#9b4a37', 0.05));
        }
      for (let x = -W / 2 + 2; x < W / 2 - 1; x += 3.6) {
        solid.box(x, 1.0, z + 0.22, 1.6, 1.0, 0.06, '#eeeadf');
        solid.box(x, 1.06, z + 0.26, 1.44, 0.86, 0.04, '#86b2c9');
      }
      solid.box(0, 2.4, z, W - 0.4, 0.2, 0.6, '#d2c3a6');
    } else {
      solid.box(0, 0, z, W - 0.4, 2.0, 0.3, '#8a8780');
      for (const [c, x] of [
        ['#d46a9f', -6],
        ['#4fb3bf', -2.5],
        ['#d46a9f', 5],
      ] as const)
        for (let k = 0; k < 8; k++)
          solid.box(x + k * 0.16, 0.7 + Math.sin(k * 1.3) * 0.3, z + 0.17, 0.15, 0.12, 0.02, c);
      if (C.venue === 'hollow') for (let i = 0; i < 3; i++) perches.push({ x: -W / 2 + 3 + i * 7, y: 2.0, z });
    }
  }
  // 后面两个角
  const cL = { x: -W / 2 + 1.0, z: -D / 2 + 1.0 };
  const cR = { x: W / 2 - 1.0, z: -D / 2 + 1.0 };
  if (!meta.noCorner?.L) {
    if (C.venue === 'maple') tree(solid, rand, cL.x, cL.z, 0.55, AUTUMN);
    else if (C.venue === 'hollow') bareTree(solid, rand, cL.x, cL.z, 0.7);
    else tree(solid, rand, cL.x, cL.z, 0.55, undefined, hot);
  }
  if (!meta.noCorner?.R) {
    if (C.venue === 'maple') {
      for (let k = 0; k < 14; k++)
        solid.box(
          cR.x + rr(-0.5, 0.5),
          rr(0, 0.35),
          cR.z + rr(-0.5, 0.5),
          rr(0.3, 0.5),
          0.2,
          rr(0.3, 0.5),
          jit(rand, pick(AUTUMN, rand), 0.05),
          rr(0, 3),
        );
      solid.box(cR.x + 0.7, 0, cR.z, 0.05, 1.4, 0.05, '#8a6a45', 0, 0, 0.4);
    } else if (C.venue === 'hollow') {
      for (let t = 0; t < 3; t++)
        for (let k = 0; k < 8; k++) {
          const an = (k / 8) * Math.PI * 2;
          solid.box(cR.x + Math.cos(an) * 0.32, t * 0.22, cR.z + Math.sin(an) * 0.32, 0.2, 0.22, 0.2, '#1f1f1f', -an);
        }
      solid.box(cR.x - 0.9, 0, cR.z + 0.2, 0.55, 0.8, 0.55, '#3d4d45');
      solid.box(cR.x - 0.9, 0.8, cR.z + 0.2, 0.25, 0.18, 0.25, '#c9c9c2');
    }
  }
  if (C.venue === 'hollow' && !perches.length) perches.push({ x: cL.x + 0.3 - nx, y: 2.6, z: cL.z });

  /** 立在 z 处、沿 x 方向的一片网（围网、球网）：画稀疏的网格线代替半透明平面。y0..y1 是上下沿。 */
  function mesh(cx: number, z: number, w: number, H: number, col: string, step: number, y0 = 0): Custom {
    const c = new Custom(
      (r: DrawContext, self: Custom) => {
        const o = self.matrixWorld;
        const ox = o[9] as number;
        const oy = o[10] as number;
        const oz = o[11] as number;
        const cc = r.col(col);
        for (let u = -w / 2; u <= w / 2 + 1e-6; u += step) r.wline([ox + u, oy, oz], [ox + u, oy + H, oz], cc, 1);
        for (let v = 0; v <= H + 1e-6; v += step) r.wline([ox - w / 2, oy + v, oz], [ox + w / 2, oy + v, oz], cc, 1);
      },
      { x0: -w / 2, x1: w / 2, y0: 0, y1: H, z0: -0.02, z1: 0.02 },
    );
    c.position.set(cx, y0, z);
    return c;
  }

  /** 沿 z 方向的一片网（球网，在 x 处） */
  function netMesh(x: number, z0: number, z1: number, y0: number, top: (z: number) => number, col: string): Custom {
    const c = new Custom(
      (r: DrawContext, self: Custom) => {
        const o = self.matrixWorld;
        const ox = o[9] as number;
        const oy = o[10] as number;
        const oz = o[11] as number;
        const cc = r.col(col);
        for (let z = z0; z <= z1 + 1e-6; z += 0.25) r.wline([ox, oy + y0, oz + z], [ox, oy + top(z), oz + z], cc, 1);
        for (let y = y0; y < top(0); y += 0.2) {
          const pts: [number, number, number][] = [];
          for (let z = z0; z <= z1 + 1e-6; z += 0.5) pts.push([ox, oy + Math.min(y, top(z)), oz + z]);
          for (let i = 1; i < pts.length; i++)
            r.wline(pts[i - 1] as [number, number, number], pts[i] as [number, number, number], cc, 1);
        }
      },
      { x0: -0.03, x1: 0.03, y0, y1: top(0), z0, z1 },
    );
    c.position.set(x, 0, 0);
    return c;
  }

  function netAt(x: number, half: number, top = 1.0) {
    solid.box(x, 0, -half, 0.12, top + 0.05, 0.12, '#24402f');
    solid.box(x, 0, half, 0.12, top + 0.05, 0.12, '#24402f');
    const netCol = '#1b2521';
    if (C.venue === 'hollow') {
      // 塌下去的旧网：中间低，白色网带一段段
      const n = 12;
      const sw = (2 * half) / n;
      for (let i = 0; i < n; i++) {
        const z = -half + sw * (i + 0.5);
        const u = z / half;
        const t = top - 0.34 * (1 - u * u);
        solid.box(x, t - 0.06, z, 0.065, 0.065, sw + 0.02, i % 4 === 1 ? '#bdb8a8' : '#d9d4c3');
      }
      add(netMesh(x, -half, half, 0.06, (z) => top - 0.34 * (1 - (z / half) ** 2) - 0.05, netCol));
      return;
    }
    solid.box(x, top - 0.07, 0, 0.07, 0.07, 2 * half, '#f4f2ea');
    solid.box(x, 0, 0, 0.05, top - 0.08, 0.05, '#f4f2ea');
    add(netMesh(x, -half, half, 0.08, () => top - 0.08, netCol));
  }

  solid.build(root);
  own.push(solid.group);
  world.statics.add(root);
  world.view?.invalidate();

  /* ---- 雨 ---- */
  const fx = new Particles(world.scene, rand, { n: 200 });
  let rain: Custom | null = null;
  const drops: { x: number; y: number; z: number }[] = [];
  if (C.weather === 'rain') {
    const N = Math.round(W * D * 0.75);
    for (let i = 0; i < N; i++) drops.push({ x: rr(-W / 2, W / 2), y: rr(0, 13), z: rr(-D / 2, D / 2) });
    rain = new Custom(
      (r: DrawContext) => {
        const c = r.col('#d4e2ea');
        for (const p of drops) r.wline([p.x, p.y, p.z], [p.x, p.y + 0.55, p.z], c, 1);
      },
      { x0: -W / 2, x1: W / 2, y0: 0, y1: 13.5, z0: -D / 2, z1: D / 2 },
    );
    rain.name = 'rain';
    // 雨丝画在最前面（盖在人物上）
    rain.renderOrder = 1e3;
    world.scene.add(rain);
  }

  const { area, bounds } = dioramaArea(meta);
  return {
    scene: world.scene,
    root,
    sky,
    area,
    bounds,
    perches,
    W,
    D,
    groundY: () => 0,
    update(dt) {
      if (rain)
        for (const p of drops) {
          p.y -= 16 * dt;
          if (p.y < 0) {
            p.y = rr(10, 13);
            p.x = rr(-W / 2, W / 2);
            p.z = rr(-D / 2, D / 2);
            if (chance(0.04)) fx.splash(p.x, 0.03, p.z, 2);
          }
        }
      fx.update(dt);
    },
    dispose() {
      fx.dispose();
      rain?.parent?.remove(rain);
      root.parent?.remove(root);
      own.length = 0;
      world.view?.invalidate();
    },
  };
}
