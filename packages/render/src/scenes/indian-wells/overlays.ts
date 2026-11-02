import { mulberry32 } from '@td/shared';
import * as THREE from 'three';
import { COURT, net } from '../../props/court';
import { VoxelBatcher } from '../../voxel/batcher';
import { sign } from '../../voxel/text';
import { type BuildContext, jit, sr } from '../../world/build-context';
import { CourtFrame } from '../../world/frame';
import type { Stage } from '../../world/stage';
import { onTick } from './anim';
import {
  car,
  facade,
  inPit,
  PAL,
  type PalmKind,
  palm,
  S1_SPEC,
  S2_SPEC_N,
  S2_SPEC_S,
  S3_SPECS,
  type Seg,
  s1Collapsed,
  s1Gap,
  s1Seat,
  s2Seat,
  sandPile,
  stands,
  tumbleweed,
  wornCourt,
} from './build';
import {
  ARCH_X,
  CLUBHOUSE,
  F_O1,
  F_O2,
  F_O3,
  F_P1,
  F_P2,
  F_S1,
  F_S2,
  F_S3,
  FOUNTAIN,
  LAWNS,
  PLAZA,
  S1,
  S1_BOWL,
  S2,
  S3,
} from './layout';

/**
 * 设施状态的画面（ADR 0015：修好就是解锁，画面也跟着复原）。
 * 每个 "设施.状态" 一层，模拟里设施换了状态就只显示那一层；没有对应层的状态就是静态底子的样子。
 * 开局的破败（积沙、倒网、碎石、钉木板、枯树）是一层，修好以后收起来，换上
 * 新场地、新网、绿草、活的棕榈、补好的看台、亮灯的会所、有水的喷泉和飘着的旗。
 * 球场的场地面每个状态都在层里画（旧的、新的二选一），修好以后旧场地裂缝里的草不会透出来。
 */

export interface FacilityOverlays {
  set(facility: string, state: string): void;
}

/** ctx 往这一层的批次里加盒子；g 是这一层（网、招牌、旗这些单独的网格加在这里）；root 是整个场景（登记动画用） */
type Build = (ctx: BuildContext, g: THREE.Object3D, root: THREE.Object3D) => void;

const lift = (fr: CourtFrame, dy: number) => new CourtFrame(fr.ox, fr.oy - 0.07 + dy, fr.oz, fr.a, fr.hx, fr.hz);

function layer(root: THREE.Object3D, seed: number, build: Build): THREE.Group {
  const sc = new THREE.Scene();
  const ctx: BuildContext = { scene: sc, flat: new VoxelBatcher(), solid: new VoxelBatcher(), rand: mulberry32(seed) };
  const g = new THREE.Group();
  g.visible = false;
  build(ctx, g, root);
  if (ctx.flat.boxCount) ctx.flat.build(sc, false, true);
  if (ctx.solid.boxCount) ctx.solid.build(sc, true, true);
  g.add(...sc.children);
  root.add(g);
  return g;
}

const all =
  (...fs: Build[]): Build =>
  (ctx, g, root) => {
    for (const f of fs) f(ctx, g, root);
  };

/* ---------------- 共用的几样 ---------------- */

/** 沙子盖住一块场地 */
const sanded =
  (fr: CourtFrame, n: number): Build =>
  (ctx) => {
    for (let k = 0; k < n; k++) {
      const p = fr.w({ x: sr(ctx, -fr.hx, fr.hx), z: sr(ctx, -fr.hz, fr.hz) });
      sandPile(ctx, p.x, fr.oy, p.z, sr(ctx, 1.4, 3.4));
    }
    for (let k = 0; k < 3; k++) {
      const p = fr.w({ x: sr(ctx, -fr.hx, fr.hx), z: fr.hz * (ctx.rand() < 0.5 ? -1 : 1) });
      tumbleweed(ctx, p.x, fr.oy, p.z);
    }
  };

/** 废弃的场地面（sag：网还挂着、塌着） */
const worn =
  (fr: CourtFrame, sag = false): Build =>
  (ctx, g) =>
    wornCourt({ ...ctx, scene: g as THREE.Scene }, fr, sag);

/** 倒在地上的网和网柱 */
const downedNet =
  (fr: CourtFrame): Build =>
  (ctx) => {
    const p = fr.w({ x: 0, z: -6.4 });
    ctx.solid.box(p.x, fr.oy, p.z, 0.12, 0.12, 1.1, '#2a332d', fr.a);
    for (let i = 0; i < 8; i++) {
      const q = fr.w({ x: sr(ctx, -0.6, 0.6), z: -5 + i * 1.4 });
      ctx.flat.box(q.x, fr.oy, q.z, 0.8, 0.05, 1.4, jit(ctx, '#2c2f2c', 0.06), fr.a + sr(ctx, -0.3, 0.3));
    }
  };

/** 新铺的硬地场（蓝场地紫外圈）+ 新网 */
const fresh =
  (fr: CourtFrame, inner: string = PAL.courtIn, outer: string = PAL.courtOut, withNet = true): Build =>
  (ctx, g) => {
    // 新铺的面是平整的：大块拼起来（比 surface() 的 2 米小格省很多三角形），只带一点点色差
    const y = fr.oy - 0.04;
    const box = (lx: number, lz: number, w: number, d: number, h: number, dy: number, col: string, amt: number) => {
      const p = fr.w({ x: lx, z: lz });
      ctx.flat.box(p.x, y + dy, p.z, w, h, d, jit(ctx, col, amt), fr.a);
    };
    const W = 2 * fr.hx + 0.4;
    const D = 2 * fr.hz + 0.4;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++)
        box(-W / 2 + (W / 4) * (i + 0.5), -D / 2 + (D / 2) * (j + 0.5), W / 4, D / 2, 0.06, 0, outer, 0.02);
    const { HL, HWD, HWS, SL } = COURT;
    for (let i = 0; i < 2; i++) box(-HL / 2 + HL * i, 0, HL, 2 * HWD, 0.012, 0.06, inner, 0.02);
    const L = '#f4f1e8';
    const line = (x0: number, z0: number, x1: number, z1: number) =>
      box(
        (x0 + x1) / 2,
        (z0 + z1) / 2,
        Math.max(0.1, Math.abs(x1 - x0)),
        Math.max(0.1, Math.abs(z1 - z0)),
        0.01,
        0.072,
        L,
        0,
      );
    line(-HL, -HWD, -HL, HWD);
    line(HL, -HWD, HL, HWD);
    line(-HL, -HWD, HL, -HWD);
    line(-HL, HWD, HL, HWD);
    line(-HL, -HWS, HL, -HWS);
    line(-HL, HWS, HL, HWS);
    line(-SL, -HWS, -SL, HWS);
    line(SL, -HWS, SL, HWS);
    line(-SL, 0, SL, 0);
    if (withNet) net({ ...ctx, scene: g as THREE.Scene }, lift(fr, 0.03), 'new');
  };

/** 扫干净、换了网，但场地还是旧的 */
const patched =
  (fr: CourtFrame): Build =>
  (ctx, g) =>
    net({ ...ctx, scene: g as THREE.Scene }, lift(fr, 0.01), 'new');

/** 剪过的绿草坪（一条深一条浅） */
const lawn =
  (facility: string): Build =>
  (ctx) => {
    for (const r of LAWNS[facility] ?? [])
      for (let x = r.x0; x < r.x1; x += 4)
        for (let z = r.z0; z < r.z1; z += 4) {
          if (inPit(x + 2, z + 2)) continue;
          const w = Math.min(4, r.x1 - x);
          const d = Math.min(4, r.z1 - z);
          const col = PAL.liveGrass[Math.floor((x - r.x0) / 4) % 2] as string;
          ctx.flat.box(x + w / 2, 0, z + d / 2, w, 0.025, d, jit(ctx, col, 0.015));
        }
  };

const palms =
  (spots: readonly (readonly [number, number])[], kind: PalmKind | ((i: number) => PalmKind)): Build =>
  (ctx) => {
    for (const [i, [x, z]] of spots.entries())
      palm(ctx, x, z, sr(ctx, 7.5, 10), typeof kind === 'function' ? kind(i) : kind);
  };

/** 场边的长凳 */
const benches =
  (fr: CourtFrame): Build =>
  (ctx) => {
    for (const lx of [-4, 4]) {
      const p = fr.w({ x: lx, z: -fr.hz + 0.9 });
      ctx.solid.box(p.x, 0, p.z, 2.4, 0.45, 0.6, '#2f5a55', fr.a);
      ctx.solid.box(p.x, 0.45, p.z - 0.25, 2.4, 0.5, 0.1, '#2f5a55', fr.a);
    }
  };

/** 风里飘的旗：挂在 (x,y,z) 的旗杆顶上，旗面朝 +x 方向展开，每帧摆一摆 */
const flagMats = new Map<string, THREE.MeshLambertMaterial>();
function flag(scene: THREE.Object3D, x: number, y: number, z: number, color: string, root: THREE.Object3D): void {
  const mat = flagMats.get(color) ?? new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  flagMats.set(color, mat);
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 0.05), mat);
  m.position.set(1.1, -0.65, 0);
  pivot.add(m);
  scene.add(pivot);
  const phase = (x * 0.37 + z * 0.61) % 6.28;
  onTick(root, (now) => {
    if (!pivot.parent?.visible) return;
    pivot.rotation.y = 0.35 + Math.sin(now * 2.2 + phase) * 0.28;
    m.scale.y = 1 - Math.abs(Math.sin(now * 3.1 + phase)) * 0.12;
    m.rotation.x = Math.sin(now * 4 + phase) * 0.15;
  });
}

/* ---------------- 外场、练习场 ---------------- */

/** 修好的外场之间的遮阳帆 */
const shadeSails: Build = (ctx) => {
  for (const [x, c] of [
    [-1, '#e6b03c'],
    [37, '#2fa3a8'],
  ] as const) {
    for (const z of [47, 61]) ctx.solid.box(x, 0, z, 0.2, 3.4, 0.2, '#7d8084');
    ctx.solid.box(x, 3.3, 54, 2.6, 0.08, 14, c, 0, 0, 0.12);
  }
};

const ballBaskets: Build = (ctx) => {
  for (const fr of [F_P1, F_P2]) {
    const p = fr.w({ x: -12, z: 3 });
    ctx.solid.box(p.x, 0, p.z, 0.6, 0.7, 0.6, '#3a3d40');
    ctx.solid.box(p.x, 0.7, p.z, 0.5, 0.15, 0.5, '#d6e04a');
  }
};

/* ---------------- 会所 ---------------- */

const CLUB_PALMS = [
  [-30, -46],
  [-18, -44],
  [2, -44],
  [14, -46],
] as const;

function clubhouseRuined(ctx: BuildContext, g: THREE.Object3D, root: THREE.Object3D): void {
  const C = CLUBHOUSE;
  // 钉上木板的窗、门口的碎屋顶和沙
  for (let x = C.x0 + 2; x < C.x1 - 1; x += 6.4) {
    ctx.solid.box(x, 2.1, C.z1 + 0.1, 2.8, 0.3, 0.1, PAL.board, 0, 0, 0.5);
    ctx.solid.box(x, 2.1, C.z1 + 0.14, 2.8, 0.3, 0.1, PAL.board, 0, 0, -0.5);
  }
  for (let k = 0; k < 14; k++)
    ctx.solid.box(
      sr(ctx, C.x0, C.x1),
      0,
      C.z1 + sr(ctx, 0.6, 4),
      sr(ctx, 0.6, 1.8),
      0.22,
      sr(ctx, 0.6, 1.8),
      jit(ctx, PAL.roof, 0.06),
      sr(ctx, 0, 3),
      sr(ctx, -0.2, 0.2),
    );
  for (let k = 0; k < 6; k++)
    sandPile(ctx, sr(ctx, C.x0 - 2, C.x1 + 2), 0, C.z1 + sr(ctx, 0.5, 2.5), sr(ctx, 1.2, 2.4));
  palms(CLUB_PALMS, (i) => (i === 2 ? 'snap' : 'dead'))(ctx, g, root);
}

function clubhouseOpen(ctx: BuildContext, scene: THREE.Object3D, root: THREE.Object3D): void {
  const C = CLUBHOUSE;
  const cx = (C.x0 + C.x1) / 2;
  // 补好的屋顶（盖住开局的洞）、新刷的女儿墙
  ctx.solid.box(cx - 3, 7.66, C.z0 + 7, C.x1 - C.x0 - 7.8, 0.36, 14.2, jit(ctx, '#b77a52', 0.03));
  ctx.solid.box(cx, 4.26, C.z1 - 0.2, C.x1 - C.x0 + 0.04, 0.72, 0.44, '#f0e6d2');
  // 亮着灯的窗（自发光的一批）
  const lit = new VoxelBatcher();
  for (let x = C.x0 + 2; x < C.x1 - 1; x += 3.2) lit.box(x, 0.9, C.z1 + 0.06, 2.6, 2.5, 0.08, '#ffd98a');
  for (let x = C.x0 + 2.5; x < C.x1 - 10; x += 3.2) lit.box(x, 5.1, C.z1 - 4 + 0.06, 2, 1.6, 0.08, '#ffd98a');
  for (let z = C.z0 + 2; z < C.z1 - 1; z += 3.2) lit.box(C.x1 + 0.06, 1.2, z, 0.08, 2, 2, '#ffd98a');
  lit.build(scene, false, false, { emissive: new THREE.Color('#c88a2a'), emissiveIntensity: 0.7 });
  // 条纹雨棚、露台上的遮阳伞
  for (let k = 0; k < 5; k++)
    ctx.solid.box(-12 + k * 2 + 1, 3.95, C.z1 + 1.7, 2, 0.2, 4.1, k % 2 ? '#f2ede0' : '#2f7f86');
  for (const x of [-20, -12, -4, 4]) {
    ctx.solid.box(x, 4.25, C.z1 - 2, 0.12, 2, 0.12, '#5a5a5a');
    ctx.solid.box(x, 6.2, C.z1 - 2, 2.6, 0.2, 2.6, x % 8 ? '#e6b03c' : '#2f7f86');
  }
  sign(scene, 'CLUBHOUSE', 7, 0.9, cx, 4.6, C.z1 + 0.12, 0, '#1f3a5a', '#f2e6c8', 24);
  palms(CLUB_PALMS, 'ok')(ctx, scene, root);
  // 花坛
  for (const x of [-15, -1]) {
    ctx.solid.box(x, 0, C.z1 + 2.2, 3, 0.6, 1.2, '#7a6a58');
    ctx.solid.box(x, 0.6, C.z1 + 2.2, 2.8, 0.4, 1, '#d6505a');
  }
  // 大门挂上旗，停车场来了几辆车
  for (const [z, c] of [
    [-4, '#2f6fb0'],
    [0, '#e6b03c'],
    [4, '#5d4580'],
  ] as const)
    flag(scene, ARCH_X + 9, 8.9, z, c, root);
  for (const [x, z, c] of [
    [56, -40, '#c8372d'],
    [68, -40, '#e8e4da'],
    [74, -40, '#2f6fb0'],
    [65, -50, '#e2b33c'],
    [77, -50, '#3f4a52'],
  ] as const)
    car(ctx, x, z, Math.PI + 0.02, c, false);
}

/* ---------------- 广场 ---------------- */

const PLAZA_PALMS = [
  [44, -19],
  [52, -19],
  [64, -19],
  [76, -12],
  [76, 0],
  [76, 11],
  [48, 22],
  [60, 24],
  [72, 22],
] as const;

function plazaDry(ctx: BuildContext, g: THREE.Object3D, root: THREE.Object3D): void {
  const P = PLAZA;
  // 餐饮棚的棚顶：西半边还在，东半边滑下来斜靠在地上
  for (let x = P.x0 + 1; x < P.x1; x += 2) {
    const fallen = x > (P.x0 + P.x1) / 2;
    ctx.solid.box(x, fallen ? 1.6 : 3.4, P.z1 - 3, 2, 0.15, 5.6, jit(ctx, '#9a8a72', 0.05), 0, fallen ? 0.42 : 0);
  }
  // 喷泉里积了沙、长了草
  sandPile(ctx, FOUNTAIN.x - 2, 0.06, FOUNTAIN.z + 1.5, 1.6);
  sandPile(ctx, FOUNTAIN.x + 2.2, 0.06, FOUNTAIN.z - 1.8, 1.2);
  for (let k = 0; k < 8; k++) sandPile(ctx, sr(ctx, P.x0, P.x1), 0.06, sr(ctx, P.z0, P.z1), sr(ctx, 1, 2.2));
  // 翻倒的桌椅
  for (let k = 0; k < 5; k++)
    ctx.solid.box(sr(ctx, P.x0 + 2, P.x0 + 12), 0.06, sr(ctx, 10, 14), 1, 0.7, 1, '#7d8084', sr(ctx, 0, 3), 1.4);
  palms(PLAZA_PALMS, (i) => (i % 3 === 1 ? 'snap' : 'dead'))(ctx, g, root);
}

function plazaOpen(ctx: BuildContext, scene: THREE.Object3D, root: THREE.Object3D): void {
  const P = PLAZA;
  // 水：喷泉池和长水池
  const water = new VoxelBatcher();
  water.box(FOUNTAIN.x, 0.1, FOUNTAIN.z, FOUNTAIN.r * 1.8, 0.4, FOUNTAIN.r * 1.8, '#3f98c2');
  water.box(70, 0.12, -4, 2.8, 0.4, 17.2, '#3a90bb');
  water.build(scene, false, true, { emissive: new THREE.Color('#164a63'), emissiveIntensity: 0.25 });
  // 水柱：一节节往上，越上越细，跳动
  const jetMat = new THREE.MeshLambertMaterial({
    color: '#d8f2ff',
    transparent: true,
    opacity: 0.85,
    emissive: '#6fb6d6',
  });
  const jet = new THREE.Group();
  jet.position.set(FOUNTAIN.x, 3.1, FOUNTAIN.z);
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7 - k * 0.12, 0.9, 0.7 - k * 0.12), jetMat);
    m.position.y = 0.45 + k * 0.9;
    jet.add(m);
  }
  scene.add(jet);
  onTick(root, (now) => {
    if (!jet.parent?.visible) return;
    jet.scale.y = 1 + Math.sin(now * 5) * 0.12 + Math.sin(now * 11.3) * 0.05;
  });
  // 餐饮棚：白顶
  for (let x = P.x0 + 1; x < P.x1; x += 2) ctx.solid.box(x, 3.4, P.z1 - 3, 2, 0.15, 5.6, jit(ctx, '#f2ede0', 0.02));
  // 售卖亭开了：彩色遮阳篷
  for (const [x, c] of [
    [P.x0 + 6, '#d6362f'],
    [P.x1 - 4, '#2fa3a8'],
  ] as const) {
    ctx.solid.box(x, 2.6, P.z1 - 3.4, 4.2, 0.2, 1.4, c, 0, 0.35);
    ctx.solid.box(x, 0.9, P.z1 - 3.06, 3.2, 1.3, 0.06, '#ffd98a');
  }
  // 桌子和伞
  for (const [x, z, c] of [
    [P.x0 + 3, -14, '#d6362f'],
    [P.x0 + 9, -14, '#2fa3a8'],
    [P.x1 - 9, -14, '#e6b03c'],
    [P.x1 - 3, -14, '#d6362f'],
    [P.x0 + 3, 1, '#e6b03c'],
    [P.x0 + 10, 12, '#2fa3a8'],
  ] as const) {
    ctx.solid.box(x, 0, z, 1.2, 0.75, 1.2, '#e8e4da');
    ctx.solid.box(x, 0, z, 0.1, 2.4, 0.1, '#5a5a5a');
    ctx.solid.box(x, 2.3, z, 2.8, 0.22, 2.8, c);
  }
  lawn('plaza')(ctx, scene, root);
  palms(PLAZA_PALMS, 'ok')(ctx, scene, root);
}

/* ---------------- 三座球场 ---------------- */

/** Stadium 1 塌了的东南角：一堆碎石和钢筋 */
function s1Rubble(ctx: BuildContext, g: THREE.Object3D, root: THREE.Object3D): void {
  for (let k = 0; k < 90; k++) {
    const x = sr(ctx, S1.cx + 13, S1.cx + S1.hx);
    const z = sr(ctx, S1.cz + 9, S1.cz + S1.hz);
    ctx.solid.box(
      x,
      0,
      z,
      sr(ctx, 0.6, 2.2),
      sr(ctx, 0.3, 1.6),
      sr(ctx, 0.6, 2.2),
      jit(ctx, (k % 4 === 0 ? PAL.seatHiFaded[0] : PAL.concrete[k % 3]) as string, 0.08),
      sr(ctx, 0, 3),
      sr(ctx, -0.3, 0.3),
    );
  }
  for (let k = 0; k < 16; k++)
    ctx.solid.box(
      sr(ctx, S1.cx + 15, S1.cx + S1.hx),
      0.4,
      sr(ctx, S1.cz + 11, S1.cz + S1.hz),
      0.08,
      sr(ctx, 1, 2.6),
      0.08,
      '#6b4a34',
      0,
      sr(ctx, -0.6, 0.6),
      sr(ctx, -0.6, 0.6),
    );
  sanded(F_S1, 12)(ctx, g, root);
  // 翻倒的裁判椅
  const p = F_S1.w({ x: 0, z: -7.4 });
  ctx.solid.box(p.x, 0.07, p.z, 0.8, 0.8, 2.2, '#3a4048', 0, Math.PI / 2);
}

function s1Restored(ctx: BuildContext, scene: THREE.Object3D, root: THREE.Object3D): void {
  const gapOr = (s: Seg) => s1Gap(s);
  // 新座位盖住旧的；塌掉的一角连台阶一起补上
  stands(ctx, S1_SPEC, {
    risers: false,
    seat: s1Seat(true),
    skip: (s, r) => gapOr(s) || s1Collapsed(s, r),
    grow: 0.06,
  });
  stands(ctx, S1_SPEC, { risers: true, seat: s1Seat(true), skip: (s, r) => gapOr(s) || !s1Collapsed(s, r) });
  const top = S1_BOWL.rows * S1_BOWL.rise;
  facade(ctx, S1_SPEC, top + 1.4, (s) => gapOr(s) || !s1Collapsed(s, 9));
  // 场边换成深紫色
  ctx.flat.box(S1.cx, 0, S1.cz, S1_BOWL.ix * 2 + 1, 0.05, S1_BOWL.iz * 2 + 1, '#4b3a6b');
  fresh(F_S1)(ctx, scene, root);
  // 东南角的灯塔立回去
  ctx.solid.box(30, 0, 24, 0.6, 13, 0.6, '#7d8084');
  ctx.solid.box(30, 13, 24, 2.8, 1.6, 0.6, '#5d6064', Math.atan2(-30, -24));
  const s = S1.cz + S1_BOWL.iz + S1_BOWL.rows + 0.4;
  sign(scene, 'STADIUM 1', 7, 0.9, S1.cx, top + 0.6, s + 0.68, 0, '#1f3a5a', '#f2e6c8', 26);
  // 碗顶一圈旗
  const cols = ['#2f6fb0', '#e6b03c', '#5d4580', '#d6362f'];
  const rim = S1_SPEC.segs(S1_BOWL.rows * S1_BOWL.rowD + 0.4).filter((q) => q.i % 9 === 4 && !s1Gap(q));
  for (const [i, q] of rim.entries()) {
    ctx.solid.box(q.x, top + 1.4, q.z, 0.12, 3.2, 0.12, '#9a9ea2');
    flag(scene, q.x, top + 4.5, q.z, cols[i % cols.length] as string, root);
  }
  lawn('stadium_1')(ctx, scene, root);
}

function s3Buried(ctx: BuildContext): void {
  // 沙子把坑填得快平了，上面还有几道沙丘
  ctx.flat.box(
    S3.cx,
    -S3.depth,
    S3.cz,
    2 * (S3.hx - 2) + 0.2,
    S3.depth - 0.25,
    2 * (S3.hz - 2) + 0.2,
    jit(ctx, PAL.sand[1], 0.02),
  );
  for (let x = S3.cx - S3.hx + 3; x < S3.cx + S3.hx - 3; x += 3)
    for (let z = S3.cz - S3.hz + 3; z < S3.cz + S3.hz - 3; z += 3)
      if (ctx.rand() < 0.55)
        ctx.flat.box(x + 1.5, -0.25, z + 1.5, 3.1, sr(ctx, 0.1, 0.5), 3.1, jit(ctx, PAL.sand[0], 0.02));
  for (let k = 0; k < 3; k++) tumbleweed(ctx, sr(ctx, S3.cx - 14, S3.cx + 14), 0, sr(ctx, S3.cz - 9, S3.cz + 9));
}

function s3Open(ctx: BuildContext, scene: THREE.Object3D, root: THREE.Object3D): void {
  fresh(F_S3)(ctx, scene, root);
  for (const sp of S3_SPECS) stands(ctx, sp, { risers: false, seat: () => '#c9cdd1', grow: 0.04 });
  lawn('stadium_3')(ctx, scene, root);
}

function s2Open(ctx: BuildContext, scene: THREE.Object3D, root: THREE.Object3D): void {
  fresh(F_S2)(ctx, scene, root);
  ctx.flat.box(S2.cx, 0, S2.cz, 42, 0.05, 27.2, '#4b3a6b');
  for (const sp of [S2_SPEC_N, S2_SPEC_S]) stands(ctx, sp, { risers: false, seat: s2Seat(true), grow: 0.06 });
  lawn('stadium_2')(ctx, scene, root);
}

export function createFacilityOverlays(stage: Stage): FacilityOverlays {
  const L = (seed: number, b: Build) => layer(stage.scene, seed, b);
  const layers: Record<string, THREE.Group> = {
    'outer_1.sanded': L(0x1f01, all(worn(F_O1), sanded(F_O1, 14), downedNet(F_O1))),
    'outer_1.swept': L(0x1f02, all(worn(F_O1), downedNet(F_O1))),
    'outer_1.playable': L(0x1f03, all(worn(F_O1), patched(F_O1), lawn('outer_1'), benches(F_O1))),
    'outer_1.resurfaced': L(0x1f04, all(fresh(F_O1), lawn('outer_1'), benches(F_O1))),
    'outer_23.ruined': L(
      0x1f05,
      all(worn(F_O2), worn(F_O3), sanded(F_O2, 10), sanded(F_O3, 12), downedNet(F_O2), downedNet(F_O3)),
    ),
    'outer_23.playable': L(
      0x1f06,
      all(fresh(F_O2), fresh(F_O3), lawn('outer_23'), benches(F_O2), benches(F_O3), shadeSails),
    ),
    'practice.ruined': L(
      0x1f07,
      all(worn(F_P1), worn(F_P2), sanded(F_P1, 8), sanded(F_P2, 8), downedNet(F_P1), downedNet(F_P2)),
    ),
    'practice.open': L(0x1f08, all(fresh(F_P1), fresh(F_P2), lawn('practice'), ballBaskets)),
    'clubhouse.ruined': L(0x1f09, clubhouseRuined),
    'clubhouse.open': L(0x1f0a, all(clubhouseOpen, lawn('clubhouse'))),
    'plaza.dry': L(0x1f0b, plazaDry),
    'plaza.open': L(0x1f0c, plazaOpen),
    'stadium_3.buried': L(0x1f0d, s3Buried),
    'stadium_3.dug': L(0x1f13, all(worn(F_S3), sanded(F_S3, 4))),
    'stadium_3.open': L(0x1f0e, s3Open),
    'stadium_2.ruined': L(0x1f0f, all(worn(F_S2), sanded(F_S2, 10), downedNet(F_S2))),
    'stadium_2.open': L(0x1f10, s2Open),
    'stadium_1.ruined': L(0x1f11, all(worn(F_S1, true), s1Rubble)),
    'stadium_1.cleared': L(0x1f14, worn(F_S1, true)),
    'stadium_1.restored': L(0x1f12, s1Restored),
  };
  return {
    set(facility, state) {
      for (const [key, g] of Object.entries(layers))
        if (key.startsWith(`${facility}.`)) g.visible = key === `${facility}.${state}`;
    },
  };
}
