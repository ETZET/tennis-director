// 跑步机（B1 有氧区，三台一排，面朝南）：低的跑带 + 前头两根立柱 + 顶上一块亮的控制台。跑的人面朝镜头（+z），控制台在他前面（+z 一头），
// −z 是跑带的尾巴。0.81 × 1.32 × 1.8 米（9 × 15 × 20 纹素；规格 0.85 × 1.8，高按控制台）。跑带顶 y 0.28（人站在上面）。
// 元素：跑带 = 深色橡胶，planks 每 4 纹素一道横棱（local，跟着物件）；两边的边条各 1 纹素亮边；
// 控制台 = 俱乐部蓝的壳 + 一块亮青的小屏（俯视 45° 下看到的是台面，所以屏铺在台面上）；电机罩（前头的低盒子）也是俱乐部蓝。
// 三角形 180（故障版：屏挪一格、红灯 + 4 段警示条 = 240）。userData：beltY = 0.28（跑的人脚下的高度）。
// gym-treadmill-fault 用这里的 treadmill(ctx, true)：控制台上多一块发光的红灯 + 一条黄黑的警示条。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Elem, Tones } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import type { Pal } from '../palette';

type Opts = NonNullable<Parameters<AssetCtx['mat']>[1]>;
type C3 = [number, number, number];
const tn = (lit: C3, mid: C3, dark: C3, seam: C3, hi: C3): Tones => ({ bands: [lit, mid, dark], seam, hi });

/** 朝镜头的竖直面：留中档，不接投影 */
export const FACE: Opts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true };

/** 盒子：中心 x、z，底 y0、顶 y1 */
export const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/** 按材质收几何体，最后每种材质合成一个网格 */
export class Parts {
  private m = new Map<string, { key: keyof Pal; extra?: Opts; geos: THREE.BufferGeometry[] }>();
  constructor(private ctx: AssetCtx) {}
  def(name: string, key: keyof Pal, extra?: Opts) {
    this.m.set(name, { key, extra, geos: [] });
  }
  add(name: string, ...g: THREE.BufferGeometry[]) {
    const e = this.m.get(name);
    if (!e) throw new Error(`Parts: no material ${name}`);
    e.geos.push(...g);
  }
  build(root: THREE.Group) {
    for (const [name, e] of this.m) {
      if (!e.geos.length) continue;
      const mesh = new THREE.Mesh(
        mergeGeometries(e.geos.map((g) => (g.index ? g.toNonIndexed() : g))),
        this.ctx.mat(e.key, e.extra),
      );
      mesh.name = name;
      root.add(mesh);
    }
  }
}

/**
 * 轮子 / 飞轮：轴沿 x 的 n 棱柱（只有侧面一圈，两头的圆盖在 yaw 0 下正好侧着看不到），每个面一个平法线。
 * 返回 n 个面按 k 种轮流分的几何体（[0] 第 1 种，[1] 第 2 种…）→ 辐条 / 分段的 2～3 种颜色。
 */
export function wheel(cx: number, cy: number, cz: number, r: number, w: number, n: number, k = 2, rot = 0) {
  const out: number[][] = Array.from({ length: k }, () => []);
  const nor: number[][] = Array.from({ length: k }, () => []);
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * Math.PI * 2;
    const a1 = rot + ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const [y0, z0, y1, z1] = [
      cy + r * Math.sin(a0),
      cz + r * Math.cos(a0),
      cy + r * Math.sin(a1),
      cz + r * Math.cos(a1),
    ];
    // 外法线 (0, sin am, cos am)；三角形绕向朝外
    const p = out[i % k];
    p.push(x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z1);
    for (let j = 0; j < 6; j++) nor[i % k].push(0, Math.sin(am), Math.cos(am));
  }
  return out.map((p, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor[i], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((p.length / 3) * 2).fill(0), 2));
    return g;
  });
}

/** 深色钢（底架、立柱、扶手）：靛蓝钢，不发灰 */
export const STEEL: C3 = [0x7a7ae0, 0x6262cc, 0x34327e];
/** 俱乐部蓝的塑料壳 */
export const CLUB_BLUE: C3 = [0x38b4ff, 0x228ef0, 0x2444a8];

export function treadmill(ctx: AssetCtx, fault: boolean): THREE.Object3D {
  const T = ctx.texel; // 0.09
  const root = new THREE.Group();
  root.name = fault ? 'gym-treadmill-fault' : 'gym-treadmill';
  const P = new Parts(ctx);

  const HW = 4.5 * T; // 半宽 0.405（9 纹素）
  const BELT_Y = 0.28;
  const Z0 = -0.9;
  const Z1 = 0.9;

  // 跑带：深色橡胶，每 4 纹素一道横棱（planks 的缝 = 棱，比带面亮一级：凸起的棱接光），整块冷靛
  const beltElem: Elem = { kind: 'planks', space: 'local', p: [0, 0, 1, 4 * T], seam: 1, hi: 0 };
  P.def('belt', 'ironwork', {
    ramp: [0x3c4cb0, 0x323e9c, 0x222870],
    tones: tn(
      [0x3c4cb0, 0x4050b8, 0x3848a8],
      [0x323e9c, 0x3642a4, 0x2e3a94],
      [0x222870, 0x262c78, 0x1e2468],
      [0x5468cc, 0x4454b8, 0x30388a], // 缝 = 横棱：凸起的棱接光，比带面亮一级
      [0x5468cc, 0x4454b8, 0x30388a],
    ),
    elem: beltElem,
    edge: 0.3,
    convex: 0.2,
  });
  // 边条（跑带两边的踏板）：亮的灰蓝铝，一纹素宽的亮边
  P.def('rail', 'silverBlue', { ramp: [0x5a98e0, 0x4078d0, 0x3448a8], edge: 0.4, convex: 0.6 });
  P.def('steel', 'ironwork', { ramp: STEEL, edge: 0.5, convex: 0.4 });
  P.def('steelFace', 'ironwork', { ramp: STEEL, ...FACE });
  P.def('shell', 'counter', { ramp: CLUB_BLUE, edge: 0.5, convex: 0.5 });
  P.def('shellFace', 'counter', { ramp: CLUB_BLUE, ...FACE });
  // 屏：亮青，带一点自发光（暗档里也亮）
  P.def('screen', 'jug', {
    ramp: [0x40d8f4, 0x20b4e4, 0x1a70c0],
    emissive: 0x061418,
    noShadowReceive: true,
    edge: 0.3,
    convex: 0.2,
  });
  // 扶手的橡胶握把
  P.def('grip', 'ironwork', { ramp: [0x3a3e6a, 0x2c2e56, 0x1e1e3c], edge: 0.4, convex: 0.3 });

  // ── 底盘 + 跑带 ──
  P.add('steel', slab(-HW, HW, 0, 0.2, Z0, 0.5));
  P.add('belt', slab(-HW + T, HW - T, 0.2, BELT_Y, Z0 + 0.04, 0.54));
  // 边条：1 纹素宽，比跑带高一点点（侧面的一纹素亮边）
  for (const s of [-1, 1])
    P.add('rail', slab(s > 0 ? HW - T : -HW, s > 0 ? HW : -HW + T, 0.2, BELT_Y + 0.02, Z0, 0.54));

  // ── 电机罩（前头的低盒子，俱乐部蓝）：顶面亮、正面中档 ──
  const HZ0 = 0.54;
  P.add('shell', slab(-HW, HW, 0.2, 0.4, HZ0, Z1 - 0.02));
  P.add('shellFace', slab(-HW, HW, 0, 0.4, Z1 - 0.02, Z1));

  // ── 两根立柱（2 纹素见方），从电机罩两角往上到控制台 ──
  const PX = HW - T; // 柱中心 x ±0.315
  const CY0 = 1.12;
  const CY1 = 1.3;
  for (const s of [-1, 1]) {
    P.add('steelFace', slab(s * PX - T, s * PX + T, 0.4, CY0, 0.66, 0.84));
    // 扶手：从立柱往后（−z）伸 0.45 米，2 纹素宽，顶 1.0
    P.add('steel', slab(s * PX - T, s * PX + T, 0.92, 1.02, 0.24, 0.66));
    P.add('grip', slab(s * PX - T, s * PX + T, 0.92, 1.03, 0.24, 0.4));
  }

  // ── 控制台（4 纹素深）：俱乐部蓝的壳，台面上一块亮青的屏 ──
  const KZ0 = 0.54;
  P.add('shell', slab(-HW, HW, CY0, CY1, KZ0, Z1 - 0.02));
  P.add('shellFace', slab(-HW, HW, CY0, CY1, Z1 - 0.02, Z1));
  const SZ0 = KZ0 + 0.02;
  const SZ1 = SZ0 + 2 * T;
  if (!fault) P.add('screen', slab(-2.5 * T, 2.5 * T, CY1, CY1 + 0.02, SZ0, SZ1));
  else {
    // 屏往左挪一格；右边一块发光的红灯：3 × 2 纹素、立高 1.5 纹素（顶面和正面都红）
    P.add('screen', slab(-4 * T, 0, CY1, CY1 + 0.02, SZ0, SZ1));
    P.def('lamp', 'carRed', {
      ramp: [0xff2a3a, 0xe82234, 0xa81a44],
      emissive: 0x801410,
      noShadowReceive: true,
      edge: 0.3,
      convex: 0.6,
    });
    P.add('lamp', slab(T, 4 * T, CY1, CY1 + 0.14, SZ0, SZ1));
    // 警示条：台面前沿 + 朝镜头的正面一条黄黑相间（每段 2 纹素），一个盒子同时盖住台面和正面
    P.def('hazY', 'straw', { ramp: [0xffd040, 0xf0a830, 0x9a6448], ...FACE, lightUp: 0.7 });
    P.def('hazK', 'ironwork', { ramp: [0x40406a, 0x323258, 0x22223e], ...FACE, lightUp: 0.7 });
    for (let i = 0; i < 4; i++) {
      const x0 = -4 * T + i * 2 * T;
      P.add(i % 2 ? 'hazK' : 'hazY', slab(x0, x0 + 2 * T, CY0 + 0.02, CY1 + 0.01, SZ1 + 0.02, Z1 + 0.01));
    }
  }

  P.build(root);
  root.userData.beltY = BELT_Y;
  ctx.mats.prepare(root);
  return root;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  return treadmill(ctx, false);
}
