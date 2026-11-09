// 姿势一览（画廊用，不放进场景）：<场景>.html?asset=people-sheet（&px=1 看 1×；&phase=0.3 全部定格；&row=0..3 只看一排）。
// 一排排摆好：总监的干活姿势（拿代用工具）、匹克球 / 孩子、坐着的人（长椅、裁判椅）、球童 / 裁判 / 刮水 / 推划线车。
import * as THREE from 'three';
import { build as bench } from '../../desert3d-v2/assets/bench';
import { build as umpireChair } from '../../desert3d-v2/assets/umpire-chair';
import type { AssetCtx as D3Ctx } from '../../desert3d-v2/world';
import { ballKid, coach, director, kid, player, umpire } from './index';

type Entry = {
  who: 'director' | 'player' | 'coach' | 'kid' | 'ballKid' | 'umpire';
  v?: number;
  pose: string;
  prop?: string | null;
  x: number;
  rotY?: number;
  seat?: [number, number] | null;
};

const ROWS: { z: number; items: Entry[] }[] = [
  {
    z: -4.2,
    items: [
      { who: 'director', pose: 'drag', prop: null, x: -4.4 },
      { who: 'director', pose: 'water', prop: 'hose', x: -2.2 },
      { who: 'director', pose: 'crank', prop: 'crank', x: 0, rotY: 0 },
      { who: 'director', pose: 'skim', prop: 'skim', x: 2.0, rotY: 0.5 },
      { who: 'director', pose: 'pour', prop: 'can', x: 4.4 },
    ],
  },
  {
    z: -1.4,
    items: [
      { who: 'player', v: 0, pose: 'dink', prop: 'paddle', x: -4.4 },
      { who: 'player', v: 2, pose: 'dinkB', prop: 'paddle', x: -2.4 },
      { who: 'player', v: 1, pose: 'ready', prop: 'paddle', x: -0.4 },
      { who: 'kid', v: 0, pose: 'idle', x: 1.4 },
      { who: 'kid', v: 1, pose: 'pickup', x: 2.8 },
      { who: 'kid', v: 2, pose: 'walk', x: 4.2 },
    ],
  },
  {
    z: 1.6,
    items: [
      { who: 'player', v: 0, pose: 'sit', prop: null, x: -4.0, seat: [0.52, 0] },
      { who: 'player', v: 3, pose: 'clap', prop: null, x: -3.3, seat: [0.52, 0] },
      { who: 'player', v: 1, pose: 'sip', prop: 'cup', x: -2.6, seat: [0.52, 0] },
      { who: 'kid', v: 1, pose: 'sit', x: -0.6, seat: [0.52, 0] },
      { who: 'player', v: 2, pose: 'sit', prop: null, x: 0.1, seat: [0.52, 0] },
      { who: 'coach', pose: 'sit', prop: null, x: 3.2, seat: [1.77, 1.54] },
    ],
  },
  {
    z: 4.6,
    items: [
      { who: 'ballKid', v: 0, pose: 'bkCrouch', x: -4.6 },
      { who: 'ballKid', v: 1, pose: 'bkStand', x: -3.6 },
      { who: 'ballKid', v: 2, pose: 'bkRoll', x: -2.6 },
      { who: 'player', v: 1, pose: 'sit', prop: null, x: -0.6, seat: [0.52, 0] },
      { who: 'ballKid', v: 3, pose: 'bkUmbrella', x: -1.35 },
      { who: 'umpire', v: 0, pose: 'call', x: 1.1, seat: [0.52, 0] },
      { who: 'umpire', v: 1, pose: 'sit', x: 1.9, seat: [0.52, 0] },
      { who: 'director', pose: 'squeegee', prop: 'squeegee', x: 3.0 },
      { who: 'director', pose: 'push', prop: 'marker', x: 4.8 },
    ],
  },
];

export function build(ctx: D3Ctx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'people-sheet';
  const q = ctx.params;
  const ph = q.has('phase') ? Number(q.get('phase')) : undefined;
  const onlyRow = q.has('row') ? Number(q.get('row')) : -1;
  const quiet = new URLSearchParams();
  ROWS.forEach((row, ri) => {
    if (onlyRow >= 0 && ri !== onlyRow) return;
    // 坐的那排：两张长椅（长椅原点 = 座面中心下方的地面，座面朝 +z）+ 一把裁判椅
    if (ri === 2) {
      for (const bx of [-3.3, -0.25]) {
        const bo = bench({ ...ctx, variant: 0, params: quiet });
        bo.position.set(bx, 0, row.z - 0.12);
        g.add(bo);
      }
      const uc = umpireChair({ ...ctx, variant: 0, params: quiet });
      uc.position.set(3.2, 0, row.z + 0.02);
      g.add(uc);
    }
    for (const it of row.items) {
      const c = { ...ctx, variant: it.v ?? 0, params: quiet };
      const p = (
        it.who === 'director'
          ? director(c)
          : it.who === 'coach'
            ? coach(c)
            : it.who === 'kid'
              ? kid(c)
              : it.who === 'ballKid'
                ? ballKid(c)
                : it.who === 'umpire'
                  ? umpire(c)
                  : player(c)
      ) as THREE.Group;
      p.position.set(it.x, 0, row.z);
      p.rotation.y = it.rotY ?? 0;
      g.add(p);
      const ud = p.userData;
      if (it.prop !== undefined) ud.setProp(it.prop);
      if (it.seat !== undefined) ud.setSeat(it.seat ? it.seat[0] : null, it.seat ? it.seat[1] : 0);
      // 代用捞网：画廊里没有水，水面当作离地 0.1
      if (it.pose === 'skim') ud.setSkim({ water: 0.1 });
      // 人自己的 update 由画廊的 collectUpdaters 收（traverse 到它们）
      ud.pose(it.pose, ph);
      if (it.pose === 'bkUmbrella') {
        // 伞斜向右边坐着的球员
        g.updateMatrixWorld(true);
        ud.setShade(g.localToWorld(new THREE.Vector3(-0.6, 0, row.z)));
      }
    }
    // 球童那排：两个坐的（球员、裁判）各一张长椅
    if (ri === 3) {
      for (const bx of [-0.6, 1.5]) {
        const bo = bench({ ...ctx, variant: 0, params: quiet });
        bo.position.set(bx, 0, row.z - 0.12);
        g.add(bo);
      }
    }
  });
  return g;
}
