// chimney：二层休息室壁炉的烟囱（#6），站在两排屋顶之间（y 7.8 起）。1.1 × 5.1 × 0.9 米（12 × 57 × 10 设计纹素；
// 包围盒 1.18 × 0.98 = 腰线、压顶、瓦帽出挑 0.04；高 5.1：瓦帽比规格高 0.5，陡一点的帽子两坡才露得出来）。
// 白灰泥烟囱身（朝镜头的南面背光 = 白灰泥暗档 + 石灰水斑，同钟楼）、离顶 0.5 一道腰线、腰线上一圈塔拉韦拉蓝釉砖带、腰线下一块花砖菱形
// （会所的花砖点一下色）；顶上陶砖压顶（cap）+ 四角小砖墩（墩之间一圈暗的烟道口）+ 盖满整个顶的小瓦帽
// （四坡金字塔形，不接投影、往上偏光 0.35 + 低阈值：四个坡都在亮档 L ≈ 175）。
// 元素：stucco = stones 16 × 10（石灰水斑）；cap = stones 6 × 4；roofTile = planks 沿 z 0.49 米（东西坡上一行行瓦，只有缝）。
// 材质：stucco、talavera、cap、roofTile、ironwork（烟道口）。三角形 ≈ 90。只在外观里。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
function merge(geos: G[]): G {
  const list = geos.map((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const k of Object.keys(g.attributes))
      if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv)
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  });
  const m = mergeGeometries(list);
  if (!m) throw new Error('chimney: merge failed');
  return m;
}
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
function tris(list: number[][][]): G {
  const pos: number[] = [];
  for (const t of list) for (const p of t) pos.push(...p);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const W = 1.1;
  const D = 0.9;
  const H = 4.3; // 烟囱身顶（压顶底）
  // 白灰泥：暗档同钟楼（本色 L 127、石灰水斑 L 146、旧斑 L 110）
  const wall = ctx.mat('stucco', {
    elem: { kind: 'stones', size: [16, 10], seam: 0, hi: 0 },
    toneW: [0.3, 0.26],
    tones: {
      bands: [
        [0xfaeedc, 0xfff9e6, 0xeee0cc],
        [0xdcc6c0, 0xe8d2ca, 0xd0b8b4],
        [0x9a7686, 0xab8a97, 0x886676],
      ],
      seam: [0xe1d7c6, 0xc2afa9, 0x7b5e6a],
      hi: [0xffffff, 0xefd8d1, 0xae8597],
    },
  });
  const cap = ctx.mat('cap', {
    elem: { kind: 'stones', size: [6, 4], seam: 0.6, hi: 0.4 },
    noShadowReceive: true,
    convex: 0.4,
  });
  const tile = ctx.mat('roofTile', {
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 0, p: [0, 0, 1, 0.49], q: [1, 0, 0, 0] },
    tones: {
      bands: [
        [0xffa46c, 0xffb07a, 0xfca06a], // L 179 / 188 / 176（调色 +9、亮档乘太阳色 −10：画面上三色都过 170）
        [0xc0584c, 0xcc6454, 0xb04e46],
        [0x5c2c52, 0x6c3460, 0x4c2544],
      ],
      seam: [0xd06e4a, 0x983e42, 0x3f1e39],
      hi: [0xffb07a, 0xe06c5e, 0x803d72],
    },
    noShadowReceive: true,
    lightUp: 0.35,
    bands: [-0.5, 0.28],
    edge: 0.5,
    convex: 0.4,
  });
  const blue = ctx.mat('talavera', { noShadowReceive: true, lightUp: 0.55, bands: [-0.45, 0.35], convex: 0.2 });
  const band = ctx.mat('talavera', {
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 0, p: [1, 0, 0, 0.18], q: [1, 0, 0, 0] },
    noShadowReceive: true,
    lightUp: 0.55,
    bands: [-0.45, 0.35],
    convex: 0.3,
  });
  const dark = ctx.mat('ironwork', {
    ramp: [0x6e5474, 0x624a6c, 0x5a4468],
    noShadowReceive: true,
    edge: 0.3,
    convex: 0,
  });

  // 烟囱身 + 腰线
  g.add(new THREE.Mesh(merge([bx(W, H, D, 0, 0, 0), bx(W + 0.08, 0.12, D + 0.08, 0, H - 0.49, 0)]), wall));
  // 菱形花砖（腰线下 0.5 米，贴在南面）
  const r = 0.28; // 横半宽；竖半高 0.4（45° 下竖向压到 0.7，屏幕上是个正菱形）
  const rv = 0.4;
  const yc = H - 1.1;
  const zf = D / 2 + 0.012;
  g.add(
    new THREE.Mesh(
      tris([
        [
          [0, yc - rv, zf],
          [r, yc, zf],
          [0, yc + rv, zf],
        ],
        [
          [0, yc - rv, zf],
          [0, yc + rv, zf],
          [-r, yc, zf],
        ],
      ]),
      blue,
    ),
  );
  // 腰线上面一圈花砖带（0.36 米高，南、东、西三面），竖缝 0.18 米一块砖
  g.add(new THREE.Mesh(bx(W + 0.02, 0.36, D + 0.02, 0, H - 0.37 + 0.005, 0), band));
  // 压顶 + 四角的小砖墩（墩之间是暗的烟道口）+ 盖满整个顶的瓦帽
  const PH = 0.2;
  const px = W / 2 + 0.04 - 0.1;
  const pz = D / 2 + 0.04 - 0.1;
  const piers = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => bx(0.2, PH, 0.2, sx * px, H + 0.1, sz * pz)));
  g.add(new THREE.Mesh(merge([bx(W + 0.08, 0.1, D + 0.08, 0, H, 0), ...piers]), cap));
  g.add(new THREE.Mesh(bx(W - 0.32, PH, D - 0.3, 0, H + 0.1, 0), dark));
  // 瓦帽：四坡（金字塔形），不接投影、往上偏光 0.35 + 低阈值：四个坡都落亮档
  const y0 = H + 0.1 + PH;
  const y1 = y0 + 0.52;
  const hw = W / 2 + 0.04;
  const hd = D / 2 + 0.04;
  const P = (x: number, y: number, z: number) => [x, y, z];
  const top = P(0, y1, 0);
  const sw = P(-hw, y0, hd);
  const se = P(hw, y0, hd);
  const ne = P(hw, y0, -hd);
  const nw = P(-hw, y0, -hd);
  g.add(
    new THREE.Mesh(
      tris([
        [sw, se, top],
        [se, ne, top],
        [ne, nw, top],
        [nw, sw, top],
        [sw, nw, ne],
        [sw, ne, se],
      ]),
      tile,
    ),
  );
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}
