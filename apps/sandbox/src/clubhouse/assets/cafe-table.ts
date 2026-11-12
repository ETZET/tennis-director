// cafe-table：咖啡吧（1F 后段两张）和露台（2F 三张，其中两张撑伞：伞杆从桌心穿过）的小圆桌 + 东西两把铁椅子。
// 尺寸 1.6 × 0.75 × 0.8 米（w × h × d）≈ 18 × 8 × 9 设计纹素。桌面 y 0.75（脏杯子 shop-dirty-cups 就摆在这上面），椅座 0.45。
// 元素：桌面是钴蓝釉砖拼的（talavera 借 club 组调色，stones 4 × 3 纹素，缝 −24、四成砖上沿亮）；桌沿一圈 1 纹素铁；
// 椅子是深靛的铁（ironwork，club 组暗档留蓝紫）+ 藏红花黄的座垫和靠垫（fabricStripe 借 club 组，换成黄橙三档）。
// 两把椅子各往镜头转 25°（"\ /"），45° 下看得到靠垫的正面；看不见的面（朝北、朝下）不建。
// 三角形 154（画廊实测：桌 ≈ 58，每把椅子 48）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
/** BoxGeometry 的面序：+x −x +y −y +z −z；默认不建朝下、朝北（−z）的面（镜头在南上方，看不见） */
const NY = 3;
const NZ = 5;
const PY = 2;
function boxG(w: number, h: number, d: number, x: number, y: number, z: number, drop: number[] = [NY, NZ]): G {
  const g = new THREE.BoxGeometry(w, h, d);
  const src = g.getIndex()!.array;
  const keep: number[] = [];
  for (let f = 0; f < 6; f++) if (!drop.includes(f)) for (let i = 0; i < 6; i++) keep.push(src[f * 6 + i]);
  g.setIndex(keep);
  g.clearGroups();
  return g.translate(x, y + h / 2, z);
}

/** 桌面半径、桌面高、座高 */
const R = 0.4;
const TOP = 0.75;
const SEAT = 0.45;
/** 椅子中心离桌心、往镜头转的角度 */
const CX = 0.56;
const TURN = (32 * Math.PI) / 180;

export function build(ctx: AssetCtx): THREE.Object3D {
  const iron: G[] = [];
  const cush: G[] = [];
  const tile: G[] = [];

  // ── 桌：釉砖桌面 + 1 纹素铁沿 + 一根柱 + 十字脚 ──
  tile.push(new THREE.CircleGeometry(R, 12).rotateX(-Math.PI / 2).translate(0, TOP, 0));
  iron.push(new THREE.CylinderGeometry(R, R, 0.09, 12, 1, true).translate(0, TOP - 0.045, 0));
  iron.push(boxG(0.09, TOP - 0.09 - 0.05, 0.09, 0, 0.05, 0, [NY, NZ, PY]));
  iron.push(boxG(0.54, 0.05, 0.09, 0, 0, 0));
  iron.push(boxG(0.09, 0.05, 0.54, 0, 0, 0));

  // ── 椅子（本地：靠背在 +x，脸朝 −x 对着桌子），东边那把转 +TURN，西边的镜像 ──
  const chair = (side: 1 | -1) => {
    const parts: [G, G[]][] = [];
    // 座垫（顶 = 座高）
    parts.push([boxG(0.42, 0.09, 0.42, 0, SEAT - 0.09, 0), cush]);
    // 四条腿（0.09 方，顶盖在垫子下看不见）
    for (const lx of [-0.15, 0.15])
      for (const lz of [-0.15, 0.15]) parts.push([boxG(0.09, SEAT - 0.09, 0.09, lx, 0, lz, [NY, NZ, PY]), iron]);
    // 靠背 = 一块厚靠垫（盖住后面的铁背板）+ 顶上一根 1 纹素的铁横梁
    parts.push([boxG(0.09, 0.4, 0.4, 0.165, SEAT, 0), cush]);
    parts.push([boxG(0.09, 0.09, 0.44, 0.165, SEAT + 0.4, 0), iron]);
    for (const [g, to] of parts) {
      if (side < 0) g.scale(-1, 1, 1);
      g.rotateY(side * TURN).translate(side * CX, 0, 0);
      // 镜像以后三角形绕向反了：翻回来
      if (side < 0) flip(g);
      to.push(g);
    }
  };
  chair(1);
  chair(-1);

  const root = new THREE.Group();
  root.name = 'cafe-table';
  const add = (gs: G[], m: THREE.Material) => {
    const mesh = new THREE.Mesh(mergeGeometries(gs), m);
    root.add(mesh);
  };
  // 铁：深靛（L 125 / 103 / 70）；只挨着地台、垫子侧面（中档 L ≈ 122）和桌沿，不挨垫子顶（L ≈ 162）
  add(
    iron,
    ctx.mat('ironwork', {
      ramp: [0x7c7ab8, 0x6462a6, 0x46427e],
      lightUp: 0.5,
      bands: [-0.45, 0.35],
      edge: 0.35,
      convex: 0.3,
      noShadowReceive: true,
    }),
  );
  // 垫子：孔雀青（顶面亮档 L ≈ 152 → 朝镜头的侧面、靠垫中档 L ≈ 122 → 暗档靛蓝）：和橙色陶砖地是补色
  add(
    cush,
    ctx.mat('clothTeal', {
      ramp: [0x34b49c, 0x2a9088, 0x24506e],
      lightUp: 0.5,
      bands: [-0.45, 0.35],
      edge: 0.25,
      convex: 0.3,
      noShadowReceive: true,
    }),
  );
  // 釉砖桌面：柠檬黄的塔拉韦拉砖（亮档 L 206 / 216 / 195，缝 −27、亮边 +25；比橙色陶砖地偏黄、亮一截），砖块 4 × 3 纹素；不接投影（1F 北墙的影子边落在桌面上是一片麻点，椅子也不接）
  add(
    tile,
    ctx.mat('talavera', {
      ramp: [0xf0d050, 0xc8983e, 0x7a4c78],
      tones: {
        bands: [
          [0xf0d050, 0xf8dc64, 0xe6c240], // L 206 / 216 / 195
          [0xc8983e, 0xd2a246, 0xbc8c38], // L 158 / 167 / 147
          [0x7a4c78, 0x845482, 0x70446e], // L 87 / 95 / 79
        ],
        seam: [0xd4b040, 0xac7c36, 0x5e3a62],
        hi: [0xfff07c, 0xe0b45a, 0x946490],
      },
      elem: { kind: 'stones', size: [4, 3], seam: 0.5, hi: 0.4, seed: 3 + ctx.variant },
      edge: 0.3,
      convex: 0.2,
      noShadowReceive: true,
    }),
  );
  ctx.mats.prepare(root);
  return root;
}

/** 镜像过的几何体：交换每个三角形的两个顶点，法线 x 取反已经由 scale 做了 */
function flip(g: G) {
  const ix = g.getIndex()!;
  const a = ix.array as Uint16Array | Uint32Array;
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  ix.needsUpdate = true;
}
