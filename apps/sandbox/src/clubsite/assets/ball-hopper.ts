// 捡球篮：金属框篮子 + 一团荧光球。v0 = 翻倒在地，口朝镜头，球滚出来一串；v1 = 立着，满满一筐。
// 立着 0.55 × 0.95 × 0.55 米。球做大一点（直径 0.22 米 ≈ 2.4 纹素），才是画面里最亮的点而不是噪点。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import { blobNormals } from '../render/toon';
import { METAL_TONES, paint } from './bench/mats';

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** 道具的明暗：光往上（偏镜头）多一半 → 顶面亮、朝镜头的立面中档、底面和背面暗 */
const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number] };

/** 篮子（本地：底在 y0（= 腿长），口朝 +y）：实心的篮身（薄壁在 0.09 米下每纹素都是边 = 噪点）+ 口沿 + 两片胖腿；返回金属几何体 */
function basket(y0: number): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = [];
  const W = 0.52;
  const H = 0.46;
  gs.push(box(W, H, W, 0, y0 + H / 2, 0)); // 篮身
  gs.push(box(W + 0.18, 0.14, W + 0.18, 0, y0 + H - 0.03, 0)); // 口沿：一圈外凸整 1 纹素的箍（半纹素的台阶 = 锯齿噪点）
  // 腿：左右各一片（两条腿 + 底横档连成一块），3 纹素
  for (const sx of [-1, 1]) {
    const x = sx * 0.25; // 外撇整 1 纹素，腿之间留 ≥ 3 纹素的空
    gs.push(box(0.2, y0 + 0.05, 0.2, x, (y0 + 0.05) / 2, 0.25));
    gs.push(box(0.2, y0 + 0.05, 0.2, x, (y0 + 0.05) / 2, -0.25));
  }
  return mergeGeometries(gs);
}

function ball(r: number, x: number, y: number, z: number) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  return blobNormals(g, new THREE.Vector3(x, y, z));
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`ball-hopper:${ctx.variant}`);
  const g = new THREE.Group();
  const R = 0.13; // 直径 0.26 米 ≈ 3 纹素
  const balls: THREE.BufferGeometry[] = [];
  const cage = new THREE.Group();
  const tipped = ctx.variant % 2 === 0;
  // 翻倒时腿只露短短两截（长腿朝后翘着像一对耳朵，认不出是篮子）
  const legLen = tipped ? 0.2 : 0.4;
  // 材质规范 v2：青绿漆，几乎干净 —— 有机形状的轻微深浅（差 6～8）+ 很少的擦痕；跟着篮子走（local）
  cage.add(
    new THREE.Mesh(
      basket(legLen),
      ctx.mat('metal', {
        ...PROP,
        elem: { ...paint([4, 3], [0, 0.05], 7), space: 'local' },
        tones: METAL_TONES,
      }),
    ),
  );
  g.add(cage);

  if (tipped) {
    // 翻倒：底朝后（-z）躺下，口朝镜头，略转一点
    cage.rotation.set(Math.PI / 2, 0, 0);
    cage.position.set(0, 0.35, 0.21 - (legLen + 0.46));
    // 口里露出一团球（篮口在 z ≈ 0.21，口里的球半个露在外面）
    const inner: [number, number, number][] = [
      [-0.1, 0.16, 0.22],
      [0.12, 0.17, 0.24],
      [0.02, 0.36, 0.22],
    ];
    for (const [x, y, z] of inner) balls.push(ball(R, x, y, z));
    // 滚出来的几个：往镜头、往右（下风），间隔 ≥ 1 纹素，越远越稀
    const trail: [number, number][] = [
      [0.34, 0.48],
      [-0.14, 0.6],
      [0.66, 0.7],
      [0.28, 0.9],
      [0.92, 1.0],
    ];
    for (const [x, z] of trail) balls.push(ball(R, x + (rnd() - 0.5) * 0.04, R * 0.85, z + (rnd() - 0.5) * 0.04));
  } else {
    // 立着：满满一筐，冒尖
    const pile: [number, number, number][] = [
      [-0.12, 0.86, -0.1],
      [0.13, 0.86, -0.12],
      [-0.11, 0.86, 0.13],
      [0.12, 0.86, 0.12],
      [0.0, 0.98, 0.0],
    ];
    for (const [x, y, z] of pile) balls.push(ball(R, x, y, z));
    balls.push(ball(R, 0.48, R * 0.85, 0.36));
  }
  // 球不接投影：在树影里也是最亮的点（像参考图的睡莲）
  g.add(
    new THREE.Mesh(
      mergeGeometries(balls),
      ctx.mat('ball', { lightUp: 0.5, bands: [-0.3, 0.45], noShadowReceive: true }),
    ),
  );
  g.rotation.y = tipped ? -0.12 : 0; // 斜放会让方块边成锯齿台阶，只转一点
  ctx.mats.prepare(g); // 篮子接投影（放在蒲葵影里）；自身小，没有自投影的噪点
  const root = new THREE.Group();
  root.add(g);
  return root;
}
