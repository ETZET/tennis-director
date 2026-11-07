// 植物：Indian Wells / Coachella Valley 低地沙漠原生植物铺满地台（球场铺面和围栏外，留出步道）。
// 每个物种几种变体，每种变体按材质分块（叶、枝、花），每块一个 InstancedMesh（手挑三档色阶 + 接近白的顶点/实例明暗），带风摆。
// 造型见 plants/species.ts，摆放规则见 plants/place.ts。
import * as THREE from 'three';
import { COURT } from '../layout';
import type { Build } from '../world';
import { anywhere, around, edgeBand, Field, nearEdge, openGround, type Spot } from './plants/place';
import { MATS, SPECIES } from './plants/species';

function plan(w: Parameters<Build>[0]): Spot[] {
  const f = new Field();
  const R = (k: string) => w.rng(`plants:${k}`);
  /** 成簇的中心：先找一块空地 */
  const centre = (rnd: () => number, gen: () => [number, number], r: number): [number, number] => {
    for (let i = 0; i < 80; i++) {
      const p = gen();
      if (openGround(p[0], p[1], r) && f.free(p[0], p[1], r)) return p;
    }
    return gen();
  };

  // 1. 绿洲：远端西北角一丛蒲葵，另有一棵孤零零的在东北角
  const oasis = { x: -12.8, z: -22.6 };
  const palmAt: [number, number][] = [
    [-1.9, -1.4],
    [1.3, -2.3],
    [-0.6, 1.5],
    [2.6, 0.8],
  ];
  for (const [dx, dz] of palmAt) f.spots.push({ x: oasis.x + dx, z: oasis.z + dz, r: 1.2, species: 'palm' });
  f.spots.push({ x: 13.4, z: -23.6, r: 1.2, species: 'palm' });

  // 2. 树：两侧长条和远端（近处的高树会挡住球场）
  const treeOk = (x: number, z: number, r: number) => openGround(x, z, r) && z < 17 && !(Math.abs(x) < 12 && z > 14);
  const rt = R('trees');
  f.scatter(rt, 'mesquite', 1, 1.6, around(rt, -9, -23.5, 1.5), { ok: treeOk });
  f.scatter(rt, 'mesquite', 1, 1.6, anywhere(rt), { ok: treeOk, k: 1.6 });
  f.scatter(rt, 'paloVerde', 3, 1.5, anywhere(rt), { ok: treeOk, k: 1.7 });
  f.scatter(rt, 'smokeTree', 2, 1.1, anywhere(rt), { ok: treeOk, k: 1.7 });

  // 3. 仙人掌和多肉：靠岛边的坡
  const rc = R('cacti');
  f.scatter(rc, 'ocotillo', 6, 0.7, nearEdge(rc, 5), { k: 2.2 });
  for (let i = 0; i < 2; i++) {
    const [cx, cz] = centre(rc, nearEdge(rc, 4), 1);
    f.scatter(rc, 'cholla', 3, 0.45, around(rc, cx, cz, 1.2), { k: 1.3 });
  }
  f.scatter(rc, 'cholla', 2, 0.45, nearEdge(rc, 4));
  f.scatter(rc, 'barrel', 8, 0.45, nearEdge(rc, 4), { k: 1.6 });
  f.scatter(rc, 'agave', 6, 0.7, nearEdge(rc, 5), { k: 1.4 });
  f.scatter(rc, 'pricklyPear', 6, 0.6, nearEdge(rc, 5), { k: 1.4 });

  // 4. 灌木：石炭酸灌木（creosote）最多、均匀；脆灌木（brittlebush）成片
  const rs = R('shrubs');
  f.scatter(rs, 'creosote', 16, 0.8, anywhere(rs), { k: 1.7 });
  for (let i = 0; i < 4; i++) {
    const [cx, cz] = centre(rs, anywhere(rs), 1.2);
    f.scatter(rs, 'brittlebush', 3, 0.6, around(rs, cx, cz, 1.3), { k: 1.1 });
  }
  f.scatter(rs, 'jojoba', 5, 0.9, anywhere(rs), { k: 1.8 });
  f.scatter(rs, 'lavender', 4, 0.6, anywhere(rs), { k: 1.8 });

  // 5. 地面：草丛、野花、枯枝都少，而且成簇（绿洲里多一点）
  const rg = R('ground');
  f.scatter(rg, 'grass', 10, 0.3, around(rg, oasis.x, oasis.z, 2.4));
  f.scatter(rg, 'verbena', 4, 0.45, around(rg, oasis.x + 1, oasis.z + 1.5, 2.4));
  const patch = (sp: string, patches: number, each: number, r: number, sd: number) => {
    for (let i = 0; i < patches; i++) {
      const [cx, cz] = centre(rg, anywhere(rg), 0.8);
      f.scatter(rg, sp, each, r, around(rg, cx, cz, sd), { tries: 15 });
    }
  };
  patch('grass', 7, 5, 0.3, 0.9);
  patch('verbena', 2, 3, 0.45, 0.8);
  patch('globemallow', 2, 3, 0.4, 0.8);
  f.scatter(rg, 'deadBrush', 7, 0.45, anywhere(rg), { k: 1.5 });

  // 6. 荒废：从铺面边缘和围栏脚下钻出来的草和小灌木
  const re = R('edge');
  const band = () => {
    const side = re() < 0.6;
    const s = re() < 0.5 ? -1 : 1;
    return side
      ? ([s * (COURT.padHw + (re() - 0.6) * 1.2), (re() * 2 - 1) * COURT.padHl] as [number, number])
      : ([(re() * 2 - 1) * COURT.padHw, s * (COURT.padHl + (re() - 0.6) * 1.2)] as [number, number]);
  };
  f.scatter(re, 'grass', 12, 0.25, band, { ok: edgeBand, edge: true, k: 1.5 });
  f.scatter(re, 'creosote', 2, 0.5, band, { ok: edgeBand, edge: true, k: 3 });
  f.scatter(re, 'brittlebush', 3, 0.4, band, { ok: edgeBand, edge: true, k: 3 });
  f.scatter(re, 'deadBrush', 3, 0.35, band, { ok: edgeBand, edge: true, k: 2 });
  return f.spots;
}

function galleryPlan(only: string): Spot[] {
  const out: Spot[] = [];
  const list = Object.values(SPECIES).filter((sp) => only === '1' || only.split(',').includes(sp.id));
  list.forEach((sp, si) => {
    const gap = sp.id === 'palm' || sp.id === 'paloVerde' || sp.id === 'mesquite' ? 6 : sp.id === 'smokeTree' ? 4 : 2.4;
    for (let vi = 0; vi < sp.variants; vi++)
      out.push({ x: (vi - (sp.variants - 1) / 2) * gap, z: si * 3, r: 0.5, species: sp.id });
  });
  return out;
}

export const build: Build = (w) => {
  const root = new THREE.Group();
  root.name = 'plants';
  // 地面高度：在占地圆上取最低点，坡上不悬空；根部再埋 0.08 米
  const ground = (x: number, z: number, r: number) => {
    let y = w.groundY(x, z);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      y = Math.min(y, w.groundY(x + Math.cos(a) * r * 0.6, z + Math.sin(a) * r * 0.6));
    }
    return y - 0.08;
  };
  // ?plantgallery=palm,agave（或 1 = 全部）：只把这些物种的每个变体排成一行放在球场上，近看造型用
  const only = w.params.get('plantgallery');
  const gallery = !!only;
  const spots = only ? galleryPlan(only) : plan(w);
  const rnd = w.rng('plants:instances');

  const stats: Record<string, number> = {};
  let tris = 0;
  for (const sp of Object.values(SPECIES)) {
    const mine = spots.filter((s) => s.species === sp.id);
    if (!mine.length) continue;
    stats[sp.id] = mine.length;
    const gr = w.rng(`plants:shape:${sp.id}`);
    for (let vi = 0; vi < sp.variants; vi++) {
      const list = mine.filter((_, i) => i % sp.variants === vi);
      if (!list.length) continue;
      const parts = sp.make(gr, vi);
      // 同一株的几块（叶、枝、花）共用同一组实例矩阵
      const mats4: THREE.Matrix4[] = [];
      const cols: THREE.Color[] = [];
      for (const s of list) {
        const edge = s.edge ? 0.7 : 1;
        const sc = gallery ? 1 : (sp.scale[0] + (sp.scale[1] - sp.scale[0]) * rnd()) * edge;
        const q = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          gallery ? 0 : rnd() * Math.PI * 2,
        );
        mats4.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(s.x, ground(s.x, s.z, s.r), s.z),
            q,
            new THREE.Vector3(sc, sc * (0.92 + 0.16 * rnd()), sc),
          ),
        );
        const k = 1 + (rnd() * 2 - 1) * sp.tint;
        cols.push(new THREE.Color(k, k, k));
      }
      for (const [key, mesher] of parts.map) {
        const pm = MATS[key];
        const mat = w.mats.toon(0xffffff, {
          ramp: pm.ramp,
          vertexColors: true,
          sway: sp.sway,
          swayH: sp.swayH,
          edge: pm.edge ?? 0.4,
          convex: pm.convex ?? 0.2,
          // 太阳在画面后方：圆的植物都把明暗光往上偏，不然朝镜头一面全黑；叶团再加档位噪声（竖向笔触）
          lightUp: 0.4,
          bands: [0.02, 0.5] as [number, number],
          ...(pm.foliage ? { noise: 0.35 } : {}),
        });
        const mesh = new THREE.InstancedMesh(mesher.geometry(), mat, list.length);
        mesh.name = `plants:${sp.id}:${vi}:${key}`;
        mats4.forEach((m4, i) => {
          mesh.setMatrixAt(i, m4);
          mesh.setColorAt(i, cols[i]);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        root.add(mesh);
        tris += mesher.tris * list.length;
      }
    }
  }
  w.mats.prepare(root);
  w.scene.add(root);
  root.userData.stats = { ...stats, meshes: root.children.length, tris };
  if (w.params.get('plantstats') === '1') console.info('plants', root.userData.stats);
  return {};
};
