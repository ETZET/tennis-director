import { mulberry32 } from '@td/shared';
import * as THREE from 'three';
import { courtLines, net, surface } from '../../props/court';
import { VoxelBatcher } from '../../voxel/batcher';
import type { BuildContext } from '../../world/build-context';
import { CourtFrame } from '../../world/frame';
import type { Stage } from '../../world/stage';
import { FA, FB, FC, FD } from './layout';

/**
 * 设施状态的画面：模拟里设施换了状态，就把对应的一层盖上去（或收起来）。
 * 静态场景本身不动（构建顺序就是画面），每层用自己的随机流单独建好，按状态显示。
 *
 * - court_1.repaired：新铺的场地、新网
 * - court_2.tennis：盖掉匹克球胶带的蓝色场地
 * - clay.restored：新红土和白线
 * - bubble.inflated：重新充起来的白色气膜
 */

export interface FacilityOverlays {
  set(facility: string, state: string): void;
}

const lift = (fr: CourtFrame, dy: number) => new CourtFrame(fr.ox, fr.oy - 0.07 + dy, fr.oz, fr.a, fr.hx, fr.hz);

function layer(seed: number, build: (ctx: BuildContext) => void): THREE.Group {
  const sc = new THREE.Scene();
  const ctx: BuildContext = { scene: sc, flat: new VoxelBatcher(), solid: new VoxelBatcher(), rand: mulberry32(seed) };
  build(ctx);
  ctx.flat.build(sc, false, true);
  ctx.solid.build(sc, true, true);
  const g = new THREE.Group();
  g.add(...sc.children);
  g.visible = false;
  return g;
}

const freshCourt = (fr: CourtFrame, inner: string, outer: string, withNet: boolean) => (ctx: BuildContext) => {
  surface(ctx, fr, inner, outer, { worn: 0, cracks: 0, weeds: 0, puddles: 0, missing: 0, lineCol: '#f4f1e8' });
  if (withNet) net(ctx, fr, 'new');
};

function clayCourt(ctx: BuildContext): void {
  const fr = lift(FD, 0.04);
  const y = fr.oy - 0.07;
  for (let x = -17; x < 17; x += 2)
    for (let z = -9; z < 9; z += 2) {
      const p = fr.w({ x: x + 1, z: z + 1 });
      ctx.flat.box(p.x, y, p.z, 2, 0.06, 2, ctx.rand() < 0.5 ? '#b5683f' : '#ad6239', fr.a);
    }
  courtLines(ctx, fr, '#f4f1e8', 0, y + 0.062);
  net(ctx, fr, 'new');
}

function dome(ctx: BuildContext): void {
  const fr = FC;
  const H = 7.5;
  for (let x = -19; x < 19; x += 1)
    for (let z = -9.5; z < 9.5; z += 1) {
      const u = (x + 0.5) / 19.4;
      const v = (z + 0.5) / 9.9;
      const r = 1 - u * u - v * v;
      if (r <= 0) continue;
      const h = Math.max(0.4, H * Math.sqrt(r));
      const p = fr.w({ x: x + 0.5, z: z + 0.5 });
      const rib = Math.abs((x + 19) % 4) < 1;
      ctx.solid.box(p.x, fr.oy, p.z, 1.02, h, 1.02, rib ? '#d7d6cf' : ctx.rand() < 0.5 ? '#efeee8' : '#e9e8e1', fr.a);
    }
}

export function createFacilityOverlays(stage: Stage): FacilityOverlays {
  const layers: Record<string, THREE.Group> = {
    'court_1.repaired': layer(0xc0471, freshCourt(lift(FA, 0.03), '#3f6d9c', '#3c7a5a', true)),
    'court_2.tennis': layer(0xc0472, freshCourt(lift(FB, 0.03), '#4f6a86', '#5a7562', false)),
    'clay.restored': layer(0xc0474, clayCourt),
    'bubble.inflated': layer(0xc0473, dome),
  };
  for (const g of Object.values(layers)) stage.scene.add(g);
  return {
    set(facility, state) {
      for (const [key, g] of Object.entries(layers))
        if (key.startsWith(`${facility}.`)) g.visible = key === `${facility}.${state}`;
    },
  };
}
