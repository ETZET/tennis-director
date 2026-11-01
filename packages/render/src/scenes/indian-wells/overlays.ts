import { mulberry32 } from '@td/shared';
import * as THREE from 'three';
import { net, surface } from '../../props/court';
import { VoxelBatcher } from '../../voxel/batcher';
import { sign } from '../../voxel/text';
import { type BuildContext, jit, sr } from '../../world/build-context';
import { CourtFrame } from '../../world/frame';
import type { Stage } from '../../world/stage';
import { bowl, PAL, palm, sandPile, tumbleweed } from './build';
import { CLUBHOUSE, F_O1, F_O2, F_O3, F_P1, F_P2, F_S1, F_S2, F_S3, FOUNTAIN, PLAZA, S1, S3 } from './layout';

/**
 * 设施状态的画面（ADR 0015：修好就是解锁，画面也跟着复原）。
 * 每个 "设施.状态" 一层，模拟里设施换了状态就只显示那一层；没有对应层的状态就是静态底子的样子。
 * 开局的破败（积沙、倒网、碎石）也是一层，修好以后收起来。
 */

export interface FacilityOverlays {
  set(facility: string, state: string): void;
}

const lift = (fr: CourtFrame, dy: number) => new CourtFrame(fr.ox, fr.oy - 0.07 + dy, fr.oz, fr.a, fr.hx, fr.hz);

function layer(seed: number, build: (ctx: BuildContext) => void): THREE.Group {
  const sc = new THREE.Scene();
  const ctx: BuildContext = { scene: sc, flat: new VoxelBatcher(), solid: new VoxelBatcher(), rand: mulberry32(seed) };
  build(ctx);
  if (ctx.flat.boxCount) ctx.flat.build(sc, false, true);
  if (ctx.solid.boxCount) ctx.solid.build(sc, true, true);
  const g = new THREE.Group();
  g.add(...sc.children);
  g.visible = false;
  return g;
}

/** 沙子盖住一块场地 */
const sanded = (fr: CourtFrame, n: number) => (ctx: BuildContext) => {
  for (let k = 0; k < n; k++) {
    const p = fr.w({ x: sr(ctx, -fr.hx, fr.hx), z: sr(ctx, -fr.hz, fr.hz) });
    sandPile(ctx, p.x, fr.oy, p.z, sr(ctx, 1.2, 3));
  }
  for (let k = 0; k < 3; k++) {
    const p = fr.w({ x: sr(ctx, -fr.hx, fr.hx), z: fr.hz * (ctx.rand() < 0.5 ? -1 : 1) });
    tumbleweed(ctx, p.x, fr.oy, p.z);
  }
};

/** 倒在地上的网和网柱 */
const downedNet = (fr: CourtFrame) => (ctx: BuildContext) => {
  const p = fr.w({ x: 0, z: -6.4 });
  ctx.solid.box(p.x, fr.oy, p.z, 0.12, 0.12, 1.1, '#2a332d', fr.a);
  for (let i = 0; i < 8; i++) {
    const q = fr.w({ x: sr(ctx, -0.6, 0.6), z: -5 + i * 1.4 });
    ctx.flat.box(q.x, fr.oy, q.z, 0.8, 0.05, 1.4, jit(ctx, '#2c2f2c', 0.06), fr.a + sr(ctx, -0.3, 0.3));
  }
};

const both =
  (...fs: ((ctx: BuildContext) => void)[]) =>
  (ctx: BuildContext) => {
    for (const f of fs) f(ctx);
  };

/** 新铺的硬地场 + 新网 */
const fresh =
  (fr: CourtFrame, inner = '#3f6d9c', outer = '#4f8a6a', withNet = true) =>
  (ctx: BuildContext) => {
    surface(ctx, lift(fr, 0.03), inner, outer, {
      worn: 0,
      cracks: 0,
      weeds: 0,
      puddles: 0,
      missing: 0,
      lineCol: '#f4f1e8',
    });
    if (withNet) net(ctx, lift(fr, 0.03), 'new');
  };

/** 扫干净、换了网，但场地还是旧的 */
const patched = (fr: CourtFrame) => (ctx: BuildContext) => {
  net(ctx, lift(fr, 0.01), 'new');
};

function clubhouseOpen(ctx: BuildContext): void {
  const C = CLUBHOUSE;
  for (let x = C.x0; x < C.x1; x += 2)
    for (let z = C.z0; z < C.z1; z += 2) ctx.solid.box(x + 1, 6.05, z + 1, 2.04, 0.32, 2.04, jit(ctx, '#a0582f', 0.04));
  for (let x = C.x0 + 2; x < C.x1 - 1; x += 3)
    for (const y of [1.2, 3.8]) ctx.solid.box(x, y, C.z1 + 0.06, 1.6, 1.3, 0.06, '#f2d98a');
  sign(ctx.scene, 'CLUBHOUSE', 6, 0.8, (C.x0 + C.x1) / 2, 5.2, C.z1 + 0.12, 0, '#1f3a5a', '#f2e6c8', 22);
}

function clubhouseRuined(ctx: BuildContext): void {
  const C = CLUBHOUSE;
  // 钉上的木板、门口的碎屋顶
  for (let x = C.x0 + 2; x < C.x1 - 1; x += 6) {
    ctx.solid.box(x, 1.2, C.z1 + 0.1, 1.8, 0.25, 0.08, PAL.board, 0, 0, 0.6);
    ctx.solid.box(x, 1.2, C.z1 + 0.12, 1.8, 0.25, 0.08, PAL.board, 0, 0, -0.6);
  }
  for (let k = 0; k < 10; k++)
    ctx.solid.box(
      sr(ctx, C.x0, C.x1),
      0,
      C.z1 + sr(ctx, 0.5, 3),
      sr(ctx, 0.6, 1.6),
      0.2,
      sr(ctx, 0.6, 1.6),
      jit(ctx, PAL.roof, 0.06),
      sr(ctx, 0, 3),
    );
}

function plazaDry(ctx: BuildContext): void {
  // 餐饮棚的屋顶滑下来一半
  for (let x = PLAZA.x0 + 2; x < PLAZA.x1 - 2; x += 2)
    ctx.solid.box(
      x,
      x < (PLAZA.x0 + PLAZA.x1) / 2 ? 3.2 : 0.4,
      PLAZA.z1 - 3,
      2,
      0.15,
      5,
      jit(ctx, '#9a8a72', 0.05),
      0,
      0,
      x < (PLAZA.x0 + PLAZA.x1) / 2 ? 0 : 0.3,
    );
  for (let k = 0; k < 6; k++) sandPile(ctx, sr(ctx, PLAZA.x0, PLAZA.x1), 0, sr(ctx, PLAZA.z0, PLAZA.z1), sr(ctx, 1, 2));
}

function plazaOpen(ctx: BuildContext): void {
  ctx.flat.box(FOUNTAIN.x, 0.1, FOUNTAIN.z, FOUNTAIN.r * 1.7, 0.08, FOUNTAIN.r * 1.7, '#5db4d4');
  ctx.flat.box(FOUNTAIN.x, 0.1, 9, 21.6, 0.08, 2.6, '#4ea6c8');
  for (let x = PLAZA.x0 + 2; x < PLAZA.x1 - 2; x += 2)
    ctx.solid.box(x, 3.4, PLAZA.z1 - 3, 2, 0.15, 5, jit(ctx, '#e8e2d2', 0.03));
  for (const [x, z, c] of [
    [PLAZA.x0 + 6, -12, '#d6362f'],
    [PLAZA.x0 + 14, -12, '#2fa3a8'],
    [PLAZA.x1 - 6, -12, '#e6b03c'],
  ] as const) {
    ctx.solid.box(x, 0, z, 0.12, 2.4, 0.12, '#5a5a5a');
    ctx.solid.box(x, 2.4, z, 3, 0.25, 3, c);
  }
  for (const [x, z] of [
    [52, -20],
    [68, -20],
    [60, 20],
  ] as const)
    palm(ctx, x + 1.5, z, 7, 'ok');
}

/** Stadium 1 塌了的东南角：一堆碎石和钢筋 */
function s1Rubble(ctx: BuildContext): void {
  for (let k = 0; k < 70; k++) {
    const x = sr(ctx, S1.cx + 14, S1.cx + S1.hx);
    const z = sr(ctx, S1.cz + 10, S1.cz + S1.hz);
    ctx.solid.box(
      x,
      0,
      z,
      sr(ctx, 0.6, 2),
      sr(ctx, 0.3, 1.4),
      sr(ctx, 0.6, 2),
      jit(ctx, PAL.concrete[k % 3] as string, 0.08),
      sr(ctx, 0, 3),
      sr(ctx, -0.3, 0.3),
    );
  }
  for (let k = 0; k < 14; k++)
    ctx.solid.box(
      sr(ctx, S1.cx + 16, S1.cx + S1.hx),
      0.4,
      sr(ctx, S1.cz + 12, S1.cz + S1.hz),
      0.06,
      sr(ctx, 1, 2.4),
      0.06,
      '#6b4a34',
      0,
      sr(ctx, -0.6, 0.6),
      sr(ctx, -0.6, 0.6),
    );
  sanded(F_S1, 10)(ctx);
  // 翻倒的裁判椅
  const p = F_S1.w({ x: 0, z: -7.4 });
  ctx.solid.box(p.x, 0.07, p.z, 0.8, 0.8, 2.2, '#3a4048', 0, Math.PI / 2);
}

function s1Restored(ctx: BuildContext): void {
  // 补上塌掉的一角，换新座位
  const inCorner = (x: number, z: number) => x > S1.cx + 14 && z > S1.cz + 10;
  bowl(ctx, S1.cx, S1.cz, S1.hx - 10, S1.hz - 12, 12, PAL.seat, { skip: (x, z) => !inCorner(x, z) });
  fresh(F_S1, '#3a5f8f', '#5a8a6e')(ctx);
  sign(ctx.scene, 'STADIUM 1', 8, 1, S1.cx, 6.4, S1.cz - S1.hz - 2.2, 0, '#1f3a5a', '#f2e6c8', 26);
}

function s3Buried(ctx: BuildContext): void {
  for (let x = S3.cx - S3.hx + 2; x < S3.cx + S3.hx - 2; x += 3)
    for (let z = S3.cz - S3.hz + 2; z < S3.cz + S3.hz - 2; z += 3)
      if (ctx.rand() < 0.85)
        ctx.flat.box(
          x + 1.5,
          -S3.depth,
          z + 1.5,
          3.1,
          S3.depth * sr(ctx, 0.5, 1.02),
          3.1,
          jit(ctx, PAL.sand[k3(x, z)] as string, 0.04),
        );
}
const k3 = (x: number, z: number) => Math.abs(Math.round(x * 7 + z * 13)) % PAL.sand.length;

export function createFacilityOverlays(stage: Stage): FacilityOverlays {
  const layers: Record<string, THREE.Group> = {
    'outer_1.sanded': layer(0x1f01, both(sanded(F_O1, 14), downedNet(F_O1))),
    'outer_1.swept': layer(0x1f02, downedNet(F_O1)),
    'outer_1.playable': layer(0x1f03, patched(F_O1)),
    'outer_1.resurfaced': layer(0x1f04, fresh(F_O1)),
    'outer_23.ruined': layer(0x1f05, both(sanded(F_O2, 10), sanded(F_O3, 12), downedNet(F_O2), downedNet(F_O3))),
    'outer_23.playable': layer(0x1f06, both(fresh(F_O2), fresh(F_O3))),
    'practice.ruined': layer(0x1f07, both(sanded(F_P1, 8), sanded(F_P2, 8), downedNet(F_P1), downedNet(F_P2))),
    'practice.open': layer(0x1f08, both(fresh(F_P1, '#4a7a9c'), fresh(F_P2, '#4a7a9c'))),
    'clubhouse.ruined': layer(0x1f09, clubhouseRuined),
    'clubhouse.open': layer(0x1f0a, clubhouseOpen),
    'plaza.dry': layer(0x1f0b, plazaDry),
    'plaza.open': layer(0x1f0c, plazaOpen),
    'stadium_3.buried': layer(0x1f0d, s3Buried),
    'stadium_3.open': layer(0x1f0e, fresh(F_S3)),
    'stadium_2.ruined': layer(0x1f0f, both(sanded(F_S2, 10), downedNet(F_S2))),
    'stadium_2.open': layer(0x1f10, fresh(F_S2, '#3a5f8f', '#5a8a6e')),
    'stadium_1.ruined': layer(0x1f11, s1Rubble),
    'stadium_1.restored': layer(0x1f12, s1Restored),
  };
  for (const g of Object.values(layers)) stage.scene.add(g);
  return {
    set(facility, state) {
      for (const [key, g] of Object.entries(layers))
        if (key.startsWith(`${facility}.`)) g.visible = key === `${facility}.${state}`;
    },
  };
}
