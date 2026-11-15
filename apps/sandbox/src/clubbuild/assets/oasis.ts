// oasis（绿洲水塘，地形，3 × 3 格 = 9 × 9 米）：开局就在地上的一汪水 —— 不规则的塘（≈ 6.4 × 5.2 米）、一圈湿沙岸、
// 岸边一丛丛芦苇（香蒲：绿叶 + 褐色的穗）、几块石头，两棵往水面歪的椰子树（flora-kit 的放射叶）。
// 水面 = 喷泉池水（fountainWater，借 jug 过调色 + 亮档除太阳色，gnd-kit 的 pmat），toon 的 water 元素（北岸脚下天光带、深处、漂的斑块）。
// 门格 (1, 2) = 前排正中：南岸正中不种芦苇，留一块平的沙岸（客人站这儿看水）。
// 本地原点 = 占地中心，+z 朝镜头。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { build as rocks } from '../../clubsite/nature/rocks';
import { topGeo, wallGeo } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { palmTree } from './flora-kit';
import { Bucket, finish, place, reuse, type V2, waterGrid } from './gnd-kit';

/** 不规则的圆：半径 rx、rz，每个点按角度起伏 */
function blob(rx: number, rz: number, wob: number[], n = 28, cx = 0, cz = 0): V2[] {
  return Array.from({ length: n }, (_, i): V2 => {
    const a = (i / n) * Math.PI * 2;
    let k = 1;
    wob.forEach((w, j) => {
      k += w * Math.sin(a * (j + 2) + j * 1.7);
    });
    return [cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k];
  });
}

/** 地块顶面 y = 0 是草坪，水面不能比它低（会被草坪盖住）：岸堆高一点（0.14），水面 0.03 */
const BANK_Y = 0.14;
const WATER_Y = 0.03;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'oasis';
  const v = ((ctx.variant % 2) + 2) % 2;
  const rnd = ctx.rng(`oasis:${v}`);
  const own = new THREE.Group();
  root.add(own);
  const B = new Bucket();

  // 岸（湿沙，比地面高一点点）、塘
  const bank = blob(4.25, 4.1, [0.05, 0.04, 0.03]);
  const pond = blob(3.2, 2.6, [0.06, 0.05, 0.04], 28, -0.15, -0.35);
  B.add('sandPatch', topGeo(bank, BANK_Y, [pond]), {
    cast: false,
    extra: { elem: { ...EL.sand, seed: 51, pebbles: 0.05 }, edge: 0.05, convex: 0 },
  });
  // 岸往下到水面的一圈（朝镜头的北岸内壁 = 一条暗边，水面被它框住）
  B.add('sandPatch', wallGeo(pond, BANK_Y, WATER_Y - 0.02, false), { cast: false, recv: false, tag: 'lip' });
  // 岸外沿往下到地面（地面上一条薄的暗边：岸比地高）
  B.add('sandPatch', wallGeo(bank, BANK_Y, -0.05, true), { cast: false, recv: false, tag: 'edge' });
  // 水面
  B.add('fountainWater', waterGrid(pond, WATER_Y, 0.3, 0.25, 1.4), {
    cast: false,
    keep: ['aElem'],
    extra: { elem: { kind: 'water', attr: true, seed: 71 }, noShadowReceive: false },
  });
  B.build(ctx, own, 'oasis:');
  finish(ctx, own);

  // 芦苇：沿塘岸一丛丛（南岸正中留空），每丛 6～8 片 0.2 米宽的竖叶（2 纹素）+ 2 根带褐穗的
  const leaves: THREE.BufferGeometry[] = [];
  const heads: THREE.BufferGeometry[] = [];
  const clumps = 9;
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + rnd() * 0.3;
    // 南岸正中（a ≈ π/2，+z）留给门格
    if (Math.abs(a - Math.PI / 2) < 0.5) continue;
    const r = 1.02 + rnd() * 0.06;
    const cx = -0.15 + Math.cos(a) * 3.2 * r;
    const cz = -0.35 + Math.sin(a) * 2.6 * r;
    const n = 6 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const h = 0.7 + rnd() * 0.6;
      const ox = (rnd() - 0.5) * 0.6;
      const oz = (rnd() - 0.5) * 0.4;
      const tilt = (rnd() - 0.5) * 0.5;
      const g = new THREE.BoxGeometry(0.2, h, 0.08)
        .translate(0, h / 2, 0)
        .rotateZ(tilt)
        .rotateY(rnd() * Math.PI);
      leaves.push(g.translate(cx + ox, BANK_Y - 0.05, cz + oz).toNonIndexed());
    }
    for (let k = 0; k < 2; k++) {
      const h = 1.2 + rnd() * 0.4;
      const x = cx + (rnd() - 0.5) * 0.4;
      const z = cz + (rnd() - 0.5) * 0.3;
      leaves.push(new THREE.BoxGeometry(0.12, h, 0.12).translate(x, h / 2 + BANK_Y, z).toNonIndexed());
      heads.push(new THREE.BoxGeometry(0.22, 0.42, 0.22).translate(x, h + 0.1 + BANK_Y, z).toNonIndexed());
    }
  }
  const sway = { sway: 0.06, swayH: 1.3 };
  const reedMat = ctx.mat('lawn', {
    ...sway,
    lightUp: 0.5,
    bands: [-0.3, 0.35],
    edge: 0.35,
    convex: 0,
    noShadowReceive: true,
  });
  const reeds = new THREE.Mesh(mergeGeometries(leaves), reedMat);
  reeds.name = 'oasis:reeds';
  const headMesh = new THREE.Mesh(
    mergeGeometries(heads),
    ctx.mat('palmTrunk', { ...sway, lightUp: 0.5, bands: [-0.3, 0.35], edge: 0.4, convex: 0, noShadowReceive: true }),
  );
  headMesh.name = 'oasis:cattails';
  const reedGrp = new THREE.Group();
  reedGrp.add(reeds, headMesh);
  ctx.mats.prepare(reedGrp, { cast: false });
  root.add(reedGrp);

  // 石头：岸上三块（一块半泡在水边）
  for (const [x, z, s] of [
    [2.9, -2.4, 0.55],
    [-3.3, 1.3, 0.45],
    [1.4, 2.35, 0.35],
  ] as const) {
    const rk = reuse(rocks, ctx, Math.floor(rnd() * 3));
    place(root, rk, x, z, rnd() * Math.PI * 2, s, BANK_Y - 0.02);
    rk.traverse((c) => {
      c.castShadow = false;
    });
  }

  // 两棵往水面歪的椰子树（西北、东边），冠不出占地（±4.7 米）
  const palms: [number, number, number, [number, number]][] =
    v === 0
      ? [
          [-3.1, -3.0, 5.6, [1.3, 0.8]],
          [3.4, 0.6, 4.6, [-1.2, -0.3]],
        ]
      : [
          [3.0, -3.1, 5.4, [-1.2, 0.8]],
          [-3.5, 0.2, 4.8, [1.2, -0.4]],
        ];
  palms.forEach(([x, z, h, lean], i) => {
    const p = palmTree({ ...ctx, variant: i }, { h, reach: 1.75, n: 8, lean, seed: `oasis${i}` });
    p.position.set(x, BANK_Y, z);
    root.add(p);
  });
  return root;
}
