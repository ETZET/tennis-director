// 地面的中间层细节（参考图草地上那层"稀疏但有"的东西）：成簇的小草团、几簇小花、碎石、几块深一点的沙斑。
// 原则：手摆的簇（崖脚的阴影带里、植物脚下、步道转弯处、铺面边上冒出来的杂草），不是满地均匀撒；每个东西 ≥ 2～3 纹素。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blob } from '../clubsite/nature/creosote/kit';
import { vnoise } from '../clubsite/render/noise';
import { EL } from '../clubsite/render/palette-base';
import { COURT, H, PATHS, SLOTS, STAIRS, type V2 } from './layout';
import { smoothLine, type Terrain, topGeo } from './terrain';
import type { AssetCtx } from './world';

type Kind = 'tuft' | 'tuftDry' | 'flowerY' | 'flowerP' | 'pebble';

/** 点在多边形里 */
function inside(p: V2, poly: V2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function edgeDist(p: V2, poly: V2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t));
  }
  return best;
}

/** 地面高度（按台地轮廓）；不能放东西的地方返回 null（崖边、池里、岛外） */
export function makeGround(t: Terrain) {
  const o = t.outlines;
  const order: [string, number][] = [
    ['mesa', H.mesa],
    ['north', H.north],
    ['west', H.west],
    ['east', H.west],
    ['court', H.court],
  ];
  const paths = PATHS.map((p) => ({ line: smoothLine(p.pts, 0.4), w: p.w }));
  return (x: number, z: number, margin = 0.3): number | null => {
    const p: V2 = [x, z];
    if (!inside(p, o.island) || edgeDist(p, o.island) < margin) return null;
    let y = H.low;
    for (const [id, h] of order) {
      if (inside(p, o[id])) {
        if (edgeDist(p, o[id]) < margin) return null;
        y = h;
        break;
      }
    }
    // 也别贴着上一层崖壁的墙脚（墙脚 0.3 米内）
    for (const [id] of order) if (!inside(p, o[id]) && edgeDist(p, o[id]) < 0.25) return null;
    if (inside(p, o.pool) || edgeDist(p, o.pool) < 0.5) return null;
    if (y === H.court && Math.abs(x) < COURT.padHw + 0.15 && Math.abs(z) < COURT.padHl + 0.15) return null;
    if (
      x > STAIRS.x0 - 0.4 &&
      x < STAIRS.x1 + 0.4 &&
      z > STAIRS.z0 - 0.6 &&
      z < STAIRS.z0 + STAIRS.run * STAIRS.steps + 0.4
    )
      return null;
    for (const P of paths) for (const [px, pz] of P.line) if (Math.hypot(px - x, pz - z) < P.w / 2 + 0.15) return null;
    return y;
  };
}

/** 手摆的簇：中心、半径、各种东西的个数 */
interface Cluster {
  x: number;
  z: number;
  r: number;
  n: Partial<Record<Kind, number>>;
}

const CLUSTERS: Cluster[] = [
  // 北台崖脚（球场台地上，阴影带里）：草团一溜
  { x: -5.5, z: -15.4, r: 1.6, n: { tuft: 5, pebble: 2 } },
  { x: 8.6, z: -15.0, r: 1.4, n: { tuft: 4, tuftDry: 2, pebble: 2 } },
  // 铺面边上冒出来的杂草（荒废感）：四个角
  { x: -7.6, z: -13.6, r: 0.8, n: { tuft: 3, tuftDry: 2 } },
  { x: 7.7, z: 13.2, r: 0.9, n: { tuft: 3, flowerY: 2 } },
  { x: -7.7, z: 12.0, r: 0.9, n: { tuftDry: 3, pebble: 1 } },
  { x: 7.6, z: -9.0, r: 0.7, n: { tuft: 2 } },
  // 球场台地东侧空沙：一块石头边一簇
  { x: 10.2, z: -8.6, r: 1.2, n: { tuft: 3, pebble: 3, flowerP: 2 } },
  { x: 9.8, z: 10.5, r: 1.0, n: { tuftDry: 3, pebble: 2 } },
  // 球场台地南沿（崖边内侧）
  { x: -4.5, z: 15.0, r: 1.4, n: { tuft: 3, flowerY: 3 } },
  // 低地：南崖脚的阴影带里
  { x: -2.5, z: 17.4, r: 1.6, n: { tuft: 5, pebble: 2 } },
  { x: 9.6, z: 17.3, r: 1.5, n: { tuft: 4, tuftDry: 2 } },
  // 池边：草和小花多
  { x: -9.0, z: 23.2, r: 1.6, n: { tuft: 6, flowerP: 4 } },
  { x: -3.0, z: 24.2, r: 1.5, n: { tuft: 4, flowerY: 3, pebble: 2 } },
  { x: -11.6, z: 20.4, r: 1.2, n: { tuft: 3, pebble: 2 } },
  // 步道转弯处
  { x: 3.2, z: 21.4, r: 1.2, n: { tuft: 3, flowerY: 2 } },
  { x: 11.0, z: 20.8, r: 1.2, n: { tuftDry: 3, pebble: 3 } },
  { x: 15.5, z: 23.6, r: 1.3, n: { tuft: 3, flowerP: 3 } },
  { x: 21.0, z: 23.8, r: 1.4, n: { tuftDry: 4, pebble: 2 } },
  // 北台：遮阳帆旁、石堆边
  { x: 1.0, z: -18.6, r: 1.4, n: { tuft: 3, pebble: 2 } },
  { x: 17.5, z: -17.4, r: 1.6, n: { tuftDry: 4, pebble: 3 } },
  { x: -2.4, z: -21.0, r: 1.6, n: { tuft: 4, flowerY: 3 } },
  // 西台、东台
  { x: -13.0, z: -6.0, r: 1.8, n: { tuft: 4, tuftDry: 2, pebble: 2 } },
  { x: -17.5, z: -1.0, r: 1.6, n: { tuftDry: 4, flowerP: 2 } },
  { x: 20.0, z: -2.0, r: 1.6, n: { tuft: 3, pebble: 3 } },
  { x: 23.0, z: 4.0, r: 1.4, n: { tuftDry: 3, flowerY: 2 } },
  { x: 21.5, z: -4.5, r: 1.8, n: { tuft: 4, pebble: 2 } },
  { x: 19.5, z: 5.0, r: 1.5, n: { tuftDry: 3, flowerP: 2 } },
  { x: 19.5, z: 19.5, r: 1.8, n: { tuft: 4, flowerY: 2 } },
  { x: 24.5, z: 19.0, r: 1.5, n: { tuftDry: 4, pebble: 2 } },
  { x: -15.0, z: -4.0, r: 1.6, n: { tuft: 3, flowerY: 2 } },
  { x: -24.0, z: 1.5, r: 1.6, n: { tuftDry: 4, pebble: 2 } },
  { x: 8.0, z: -23.5, r: 1.6, n: { tuft: 3, flowerP: 2 } },
  { x: -12.5, z: -19.0, r: 1.4, n: { tuftDry: 3, pebble: 2 } },
  { x: -21.0, z: 12.0, r: 1.6, n: { tuft: 4, flowerP: 2 } },
  { x: 14.0, z: 10.0, r: 1.6, n: { tuftDry: 3, pebble: 2 } },
];

/** 球场裂缝里冒出来的几小团草（主角上的细节，只放在裂缝上） */
const CRACK_WEEDS: [number, number, number][] = [
  [-5.7, 5.75, 1.0],
  [-3.1, 6.55, 0.8],
  [5.5, 8.95, 0.9],
  [4.75, -12.9, 0.9],
];

/** 深一点的沙斑（低频大块，2～4 米，压实的土 / 背风积的沙） */
const PATCHES: { x: number; z: number; rx: number; rz: number }[] = [
  { x: 9.4, z: -2.5, rx: 1.3, rz: 2.6 },
  { x: -15.5, z: 21.5, rx: 3.2, rz: 1.6 },
  { x: 12.5, z: -21.5, rx: 2.8, rz: 1.4 },
  { x: -18.5, z: -9.5, rx: 2.4, rz: 1.8 },
  { x: 18.5, z: 18.5, rx: 2.6, rz: 1.3 },
  { x: -7.5, z: -24.5, rx: 2.0, rz: 1.1 },
];

export function buildGround(ctx: AssetCtx, terrain: Terrain): THREE.Object3D {
  const rnd = ctx.rng('ground');
  const at = makeGround(terrain);
  const root = new THREE.Group();
  root.name = 'ground-detail';

  // 几种原型（每种几个变体合并在一个几何体里不行 —— 实例共享几何；做 3 个变体各一个 InstancedMesh 太多，这里每种一个形状 + 实例缩放/旋转）
  const tuftGeo = mergeGeometries(
    [
      blob(0.24, rnd, { detail: 1, squash: 0.8, jitter: 0.25 }).translate(0, 0.12, 0),
      blob(0.18, rnd, { detail: 1, squash: 0.8, jitter: 0.25 }).translate(0.22, 0.08, 0.06),
      blob(0.16, rnd, { detail: 1, squash: 0.85, jitter: 0.25 }).translate(-0.19, 0.07, 0.1),
    ],
    false,
  )!;
  const petals = mergeGeometries(
    [
      new THREE.OctahedronGeometry(0.1, 0).translate(0.03, 0.24, 0.03),
      new THREE.OctahedronGeometry(0.09, 0).translate(-0.14, 0.19, 0.08),
      new THREE.OctahedronGeometry(0.085, 0).translate(0.15, 0.17, 0.1),
    ].map((g) => {
      g.deleteAttribute('uv');
      return g;
    }),
    false,
  )!;
  const flowerGeo = mergeGeometries([blob(0.16, rnd, { detail: 1, squash: 0.8 }).translate(0, 0.08, 0), petals], true)!;
  const pebbleGeo = blob(0.17, rnd, { detail: 0, squash: 0.55, jitter: 0.3, lowC: 0.6 });

  const items: Record<Kind, THREE.Matrix4[]> = { tuft: [], tuftDry: [], flowerY: [], flowerP: [], pebble: [] };
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const c of CLUSTERS) {
    for (const [k, n0] of Object.entries(c.n) as [Kind, number][]) {
      const n = Math.round(n0 * 1.4);
      let placed = 0;
      for (let tries = 0; placed < n && tries < n * 12; tries++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * c.r;
        const x = c.x + Math.cos(a) * d;
        const z = c.z + Math.sin(a) * d * 0.8;
        const y = at(x, z);
        if (y === null) continue;
        const s = k === 'pebble' ? 0.7 + rnd() * 0.9 : 0.75 + rnd() * 0.6;
        q.setFromAxisAngle(up, rnd() * Math.PI * 2);
        items[k].push(
          new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.02, z), q.clone(), new THREE.Vector3(s, s, s)),
        );
        placed++;
      }
    }
  }
  for (const [x, z, sc] of CRACK_WEEDS) {
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    items.tuft.push(
      new THREE.Matrix4().compose(new THREE.Vector3(x, 0.02, z), q.clone(), new THREE.Vector3(sc, sc * 0.8, sc)),
    );
  }
  // 植物脚下各两三团草
  for (const s of SLOTS) {
    if (!/palm|palo|smoke|creosote|ocotillo|agave|barrel|cholla|rocks/.test(s.asset)) continue;
    const n = /palm|palo|smoke/.test(s.asset) ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = (/palm|palo|smoke/.test(s.asset) ? 1.0 : 0.7) + rnd() * 0.6;
      const x = s.x + Math.cos(a) * d;
      const z = s.z + Math.sin(a) * d * 0.7;
      const y = at(x, z);
      if (y === null) continue;
      const sc = 0.8 + rnd() * 0.5;
      const kind: Kind = rnd() < 0.3 ? 'tuftDry' : rnd() < 0.15 ? 'pebble' : 'tuft';
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      items[kind].push(
        new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.02, z), q.clone(), new THREE.Vector3(sc, sc, sc)),
      );
    }
  }

  const FOL = { sway: 0.03, swayH: 0.25, lightUp: 0.5, noise: 0.25, bands: [-0.1, 0.45] as [number, number] };
  const mk = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material | THREE.Material[],
    list: THREE.Matrix4[],
    name: string,
  ) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    for (const [i, m4] of list.entries()) m.setMatrixAt(i, m4);
    m.instanceMatrix.needsUpdate = true;
    m.name = name;
    m.computeBoundingSphere();
    root.add(m);
  };
  mk(tuftGeo, ctx.mat('olive', FOL), items.tuft, 'ground:tuft');
  mk(tuftGeo, ctx.mat('dryTuft', FOL), items.tuftDry, 'ground:tuftDry');
  mk(
    flowerGeo,
    [ctx.mat('sage', FOL), ctx.mat('flowerYellow', { bands: [-0.6, 0.2], lightUp: 0.6 })],
    items.flowerY,
    'ground:flowerY',
  );
  mk(
    flowerGeo,
    [ctx.mat('sage', FOL), ctx.mat('flowerPurple', { bands: [-0.6, 0.2], lightUp: 0.6 })],
    items.flowerP,
    'ground:flowerP',
  );
  mk(pebbleGeo, ctx.mat('rockCool', { edge: 0.6, convex: 0.6 }), items.pebble, 'ground:pebble');

  // 沙斑：平贴地面的圆滑块（材质规范 v2：和沙地同一套沙纹/碎石，只是整套深一点，不是一块平涂）
  const patchMat = ctx.mat('sandPatch', { edge: 0, convex: 0, elem: { ...EL.sand, seed: 5 } });
  for (const P of PATCHES) {
    const y = at(P.x, P.z, 0.2);
    if (y === null) continue;
    const pts: V2[] = [];
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const k =
        0.7 +
        0.45 * vnoise(Math.cos(a) * 1.6 + P.x, Math.sin(a) * 1.6 + P.z, 611) +
        0.2 * vnoise(Math.cos(a) * 4 + P.x, Math.sin(a) * 4, 612);
      const x = P.x + Math.cos(a) * P.rx * k;
      const z = P.z + Math.sin(a) * P.rz * k;
      pts.push([x, z]);
    }
    if (pts.some(([x, z]) => at(x, z, 0.1) !== y)) continue;
    const m = new THREE.Mesh(topGeo(pts, y + 0.008), patchMat);
    m.name = 'ground:patch';
    root.add(m);
  }

  ctx.mats.prepare(root);
  for (const c of root.children) {
    c.castShadow = c.name !== 'ground:patch' && c.name !== 'ground:pebble';
    if (c.name === 'ground:patch') c.receiveShadow = true;
  }
  return root;
}
