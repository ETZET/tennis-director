import { mulberry32, range } from '@td/shared';
import * as THREE from 'three';
import { VoxelBatcher } from '../../voxel/batcher';
import type { Stage } from '../../world/stage';
import { ticksOf } from './anim';
import { PAL } from './build';

/**
 * Indian Wells 的环境动画：风从西边来，风滚草顺着几条空旷的走廊滚过去，地上时不时扬起一阵沙。
 * 覆盖层登记的旗子和喷泉水柱也在这里每帧推一下（anim.ts）。
 * 只动画面，用自己的种子随机流，不碰 Math.random 和模拟。
 */

/** 风滚草走的几条走廊：z 固定，x 从 x0 滚到 x1（避开看台和楼） */
const LANES: readonly { z: number; x0: number; x1: number }[] = [
  { z: 37.5, x0: -42, x1: 86 },
  { z: -35.5, x0: -46, x1: 48 },
  { z: -72, x0: -96, x1: 46 },
  { z: 72, x0: -112, x1: 112 },
  { z: 26, x0: 42, x1: 86 },
  { z: -80, x0: -112, x1: 112 },
];

interface Weed {
  m: THREE.Mesh;
  lane: (typeof LANES)[number];
  x: number;
  v: number;
  phase: number;
}

interface Puff {
  x: number;
  z: number;
  y: number;
  life: number;
  ttl: number;
  s: number;
}

export function createIndianWellsSky(stage: Stage): { update(dt: number, now: number, rain: number): void } {
  const rand = mulberry32(0x7e11);
  const R = (a: number, b: number) => range(rand, a, b);

  /* 风滚草：每棵一个合并好的网格 */
  const weeds: Weed[] = LANES.map((lane, i) => {
    const vb = new VoxelBatcher();
    for (let k = 0; k < 9; k++)
      vb.box(
        R(-0.35, 0.35),
        R(-0.35, 0.2),
        R(-0.35, 0.35),
        0.55,
        0.12,
        0.12,
        PAL.dead[k % PAL.dead.length] as string,
        R(0, 3.14),
        R(0, 3.14),
        R(0, 3.14),
      );
    const m = vb.build(stage.scene, true, false);
    const s = R(0.9, 1.4);
    m.scale.set(s, s, s);
    return { m, lane, x: lane.x0 + ((i * 37) % (lane.x1 - lane.x0)), v: R(2.2, 4), phase: R(0, 6) };
  });

  /* 扬沙：一批小方块，一阵阵从地上卷起来、往东飘、越飘越小 */
  const N = 48;
  const dust = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: '#e2c79c', transparent: true, opacity: 0.55, depthWrite: false }),
    N,
  );
  dust.frustumCulled = false;
  stage.scene.add(dust);
  const puffs: Puff[] = [];
  const spawn = (): Puff => {
    // 多在墙外的沙地和停车场起沙
    const out = rand() < 0.6;
    const x = out ? R(-110, 110) : R(50, 98);
    const z = out ? (rand() < 0.5 ? R(-84, -72) : R(66, 80)) : R(-70, -36);
    return { x, z, y: 0, life: 0, ttl: R(2.5, 5), s: R(0.5, 1.3) };
  };
  for (let i = 0; i < N; i++) {
    const p = spawn();
    p.life = R(0, p.ttl);
    puffs.push(p);
  }
  const o = new THREE.Object3D();

  return {
    update(dt, now, rain) {
      const step = Math.min(dt, 0.1);
      const calm = 1 - Math.min(1, rain * 1.5);
      for (const w of weeds) {
        w.x += w.v * step * (0.4 + 0.6 * calm);
        if (w.x > w.lane.x1) w.x = w.lane.x0;
        const hop = Math.abs(Math.sin(now * 2.6 + w.phase)) * 0.7 * calm;
        w.m.position.set(w.x, 0.35 + hop, w.lane.z + Math.sin(now * 0.4 + w.phase) * 1.5);
        w.m.rotation.z -= (w.v * step) / 0.5;
      }
      dust.visible = calm > 0.05;
      for (let i = 0; i < N; i++) {
        const p = puffs[i] as Puff;
        p.life += step;
        if (p.life > p.ttl) puffs[i] = Object.assign(p, spawn());
        const u = p.life / p.ttl;
        p.x += step * 3.2;
        p.y = Math.sin(u * Math.PI) * 2.2;
        const s = p.s * Math.sin(u * Math.PI) * calm;
        o.position.set(p.x, p.y, p.z + Math.sin(now + i) * 0.5);
        o.rotation.set(u * 2, u * 3 + i, 0);
        o.scale.set(s, s * 0.6, s);
        o.updateMatrix();
        dust.setMatrixAt(i, o.matrix);
      }
      dust.instanceMatrix.needsUpdate = true;
      for (const t of ticksOf(stage.scene)) t(now, step);
    },
  };
}
