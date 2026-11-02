import { mulberry32, range } from '@td/shared';
import * as THREE from 'three';
import type { CourtFrame } from '../../world/frame';
import type { Stage } from '../../world/stage';
import { PAL } from './build';
import { CLUBHOUSE, F_O1, F_O2, F_O3, F_P1, F_P2, F_S1, F_S2, F_S3, PLAZA } from './layout';

/**
 * 状况看得见（ART-8 原型，准则 6"先出画面信号，再掉档"）：修好的设施没人维护、状况往下掉时，
 * 场地上一点点长出积沙、杂草和垃圾。
 *
 * 宿主（游戏）按设施给一个"磨损量" amount（0 = 干净，1 = 快掉档了，再往上 = 已经掉档），这里只负责画；
 * 状况怎么换算成 amount 由游戏决定。每块碎屑有自己的门槛，amount 过了门槛就长出来（一小段长大的过程）。
 *
 * 全园三种碎屑各一个 InstancedMesh（一共 3 次绘制，不投影），位置用自己的种子随机流，不碰 Math.random。
 */

export interface WearLayer {
  set(facility: string, amount: number): void;
}

type Kind = 'sand' | 'weed' | 'litter';

interface Piece {
  kind: Kind;
  i: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  /** amount 到这里开始长 */
  thr: number;
}

const LITTER = ['#f1ece0', '#e8e2d2', '#d6362f', '#3a8fd9', '#9aa0a6', '#f0a020'];
const WEEDS = [...PAL.deadGrass, ...PAL.liveGrass, '#5f7f3a'];
const MAX: Record<Kind, number> = { sand: 520, weed: 420, litter: 260 };

/** 这几个设施有几块场地（和 overlays.ts 一致） */
const COURTS: Record<string, readonly CourtFrame[]> = {
  outer_1: [F_O1],
  outer_23: [F_O2, F_O3],
  practice: [F_P1, F_P2],
  stadium_1: [F_S1],
  stadium_2: [F_S2],
  stadium_3: [F_S3],
};

export function createWear(stage: Stage): WearLayer {
  const rand = mulberry32(0x3a7e);
  const R = (a: number, b: number) => range(rand, a, b);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length) % a.length] as T;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const meshes = {} as Record<Kind, THREE.InstancedMesh>;
  const used: Record<Kind, number> = { sand: 0, weed: 0, litter: 0 };
  for (const k of ['sand', 'weed', 'litter'] as const) {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), MAX[k]);
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    meshes[k] = m;
  }
  const byFacility = new Map<string, Piece[]>();
  const col = new THREE.Color();

  function add(
    f: string,
    kind: Kind,
    x: number,
    y: number,
    z: number,
    s: [number, number, number],
    c: string,
    thr: number,
  ) {
    const i = used[kind]++;
    if (i >= MAX[kind]) return;
    meshes[kind].setColorAt(i, col.set(c).offsetHSL(0, 0, R(-0.04, 0.04)));
    const list = byFacility.get(f) ?? [];
    list.push({ kind, i, x, y, z, yaw: R(0, Math.PI), sx: s[0], sy: s[1], sz: s[2], thr });
    byFacility.set(f, list);
  }

  /* 球场：风从西边来，积沙先堆在西边的围网根和底线，再往场里漫；裂缝里冒草；场边有垃圾 */
  for (const [f, frames] of Object.entries(COURTS))
    for (const fr of frames) {
      const y = fr.oy + 0.04;
      const at = (lx: number, lz: number) => fr.w({ x: lx, z: lz });
      for (let k = 0; k < 26; k++) {
        // 前一半沿着西边围网，后一半顺风往场里散
        const west = k < 13;
        const p = west ? at(-fr.hx + R(0, 3.5), R(-fr.hz, fr.hz)) : at(R(-fr.hx, fr.hx * 0.6), R(-fr.hz, fr.hz));
        const s = R(2, 4.6);
        add(
          f,
          'sand',
          p.x,
          y,
          p.z,
          [s * R(1.2, 1.8), R(0.1, 0.26), s * R(0.6, 1)],
          pick(PAL.sand),
          west ? R(0.02, 0.7) : R(0.25, 1.4),
        );
      }
      for (let k = 0; k < 26; k++) {
        // 杂草：沿着线和裂缝冒出来
        const p =
          rand() < 0.5
            ? at(R(-fr.hx, fr.hx), (rand() < 0.5 ? -1 : 1) * R(3.8, 4.4))
            : at(R(-fr.hx, fr.hx), R(-fr.hz, fr.hz));
        const h = R(0.25, 0.7);
        add(f, 'weed', p.x, y, p.z, [R(0.5, 1.1), h, R(0.5, 1.1)], pick(WEEDS), R(0.3, 1.6));
      }
      for (let k = 0; k < 10; k++) {
        const p = at(R(-fr.hx, fr.hx), (rand() < 0.5 ? -1 : 1) * R(fr.hz - 2.2, fr.hz - 0.4));
        add(f, 'litter', p.x, y, p.z, [R(0.2, 0.5), R(0.04, 0.22), R(0.2, 0.4)], pick(LITTER), R(0.15, 1.6));
      }
    }

  /* 会所门前和广场：垃圾多、积沙在墙根 */
  const rect = (
    f: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    nSand: number,
    nWeed: number,
    nLitter: number,
  ) => {
    for (let k = 0; k < nSand; k++) {
      const s = R(1, 2.6);
      add(
        f,
        'sand',
        R(x0, x1),
        0.04,
        R(z0, z1),
        [s * R(1.2, 1.8), R(0.1, 0.24), s * R(0.6, 1)],
        pick(PAL.sand),
        R(0.05, 1.6),
      );
    }
    for (let k = 0; k < nWeed; k++)
      add(f, 'weed', R(x0, x1), 0.04, R(z0, z1), [R(0.25, 0.5), R(0.25, 0.6), R(0.25, 0.5)], pick(WEEDS), R(0.3, 1.6));
    for (let k = 0; k < nLitter; k++)
      add(
        f,
        'litter',
        R(x0, x1),
        0.04,
        R(z0, z1),
        [R(0.2, 0.5), R(0.04, 0.22), R(0.2, 0.4)],
        pick(LITTER),
        R(0.05, 1.6),
      );
  };
  rect('clubhouse', CLUBHOUSE.x0 + 1, CLUBHOUSE.x1 - 1, CLUBHOUSE.z1 + 0.6, CLUBHOUSE.z1 + 9, 14, 16, 30);
  rect('plaza', PLAZA.x0 + 1, PLAZA.x1 - 1, PLAZA.z0 + 1, PLAZA.z1 - 1, 18, 18, 36);

  const o = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const last = new Map<string, number>();
  for (const k of ['sand', 'weed', 'litter'] as const) {
    const m = meshes[k];
    for (let i = 0; i < MAX[k]; i++) m.setMatrixAt(i, zero);
    m.count = Math.min(used[k], MAX[k]);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    stage.scene.add(m);
  }

  return {
    set(facility, amount) {
      const a = Math.round(amount * 50) / 50;
      if (last.get(facility) === a) return;
      last.set(facility, a);
      const dirty = new Set<Kind>();
      for (const p of byFacility.get(facility) ?? []) {
        if (p.i >= MAX[p.kind]) continue;
        // 过了门槛先冒头（0.12 内长到原大小），沙堆随后还会继续变大一点
        const grow = Math.min(1, Math.max(0, (a - p.thr) / 0.12));
        const more = p.kind === 'sand' ? 0.7 + 0.5 * Math.min(1, Math.max(0, (a - p.thr) / 0.6)) : 1;
        if (grow <= 0) meshes[p.kind].setMatrixAt(p.i, zero);
        else {
          o.position.set(p.x, p.y, p.z);
          o.rotation.set(0, p.yaw, 0);
          o.scale.set(p.sx * grow * more, p.sy * grow * more, p.sz * grow * more);
          o.updateMatrix();
          meshes[p.kind].setMatrixAt(p.i, o.matrix);
        }
        dirty.add(p.kind);
      }
      for (const k of dirty) meshes[k].instanceMatrix.needsUpdate = true;
    },
  };
}
