// 红岩（rocks-ne、rocks-pool、rock-e、rocks-e）：v0 一大块红砂岩 + 两块小的；v1 平顶的岩板（两层台）；v2 一块灰紫冷石 + 一块小红石。
// 做法照参考图的石头：几圈随机点的凸包（每块 20～40 个大三角面）→ 面法线出硬面三档（亮顶 / 中腰 / 暗前脸），
// 面比二十面体大、少，剪影有棱角，不会读成圆馒头；砂岩顶上那圈点几乎共面 → 一整块亮顶。
// 描边按"棱多面小"调低（edge 0.55、convex 0.5，否则每条棱都是白线）；石头不接收投影（掠射的面上投影毛边 = 麻点）。
// 沙漠的一点：上风侧（西南）一道积沙压住石脚；红岩下半截一圈偏暗的"岩漆"（逐面顶点色 0.86，只做明暗）；冷石顶上一小块地衣（sage）。
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../world';

type Rnd = () => number;

/** 一圈点：高度 y（± dy），半径 rx/rz（× 1 ± jr），n 个，起始角 a0 */
interface Ring {
  y: number;
  dy?: number;
  r: number;
  jr?: number;
  n: number;
}

interface RockOpts {
  /** 半宽（x）、半深（z），高 */
  rx: number;
  rz: number;
  rings: Ring[];
  x: number;
  z: number;
  ry?: number;
  /** 岩漆带：这个高度（米，本地）以下、不朝上的面压暗 */
  varnish?: number;
}

/** 凸包石块：面法线、非索引，逐面顶点色（岩漆） */
function rock(o: RockOpts, rnd: Rnd): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (const ring of o.rings) {
    const a0 = rnd() * Math.PI * 2;
    for (let i = 0; i < ring.n; i++) {
      const a = a0 + ((i + (rnd() - 0.5) * 0.5) / ring.n) * Math.PI * 2;
      const k = ring.r * (1 + (rnd() - 0.5) * 2 * (ring.jr ?? 0.12));
      const y = ring.y + (rnd() - 0.5) * 2 * (ring.dy ?? 0);
      pts.push(new THREE.Vector3(Math.cos(a) * o.rx * k, y, Math.sin(a) * o.rz * k));
    }
  }
  let g: THREE.BufferGeometry = new ConvexGeometry(pts);
  g.rotateY(o.ry ?? 0);
  g.translate(o.x, 0, o.z);
  if (g.index) g = g.toNonIndexed();
  g.computeVertexNormals(); // 非索引 → 面法线
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3).fill(1);
  if (o.varnish !== undefined) {
    for (let f = 0; f < pos.count; f += 3) {
      const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
      if (cy < o.varnish && n.getY(f) < 0.5) for (let k = 0; k < 9; k++) col[f * 3 + k] = 0.86;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const a of Object.keys(g.attributes))
    if (a !== 'position' && a !== 'normal' && a !== 'color') g.deleteAttribute(a);
  return g;
}

/** 积沙：压扁的半球，平滑法线，压住石脚 */
function drift(x: number, z: number, w: number, h: number, d: number, ry: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(w / 2, h, d / 2);
  g.rotateY(ry);
  g.translate(x, -0.03, z);
  g.deleteAttribute('uv');
  return g;
}

/** 圆钝的大石（底圈 + 外鼓的腰圈 + 收拢的肩圈 + 顶上几点） */
const boulder = (h: number, flat = 0.06): Ring[] => [
  { y: -0.1, r: 0.92, n: 7 },
  { y: h * 0.42, dy: h * 0.08, r: 1.0, n: 7 },
  { y: h * 0.82, dy: h * 0.05, r: 0.78, n: 6 },
  { y: h, dy: h * flat, r: 0.48, n: 5 },
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 3;
  const rnd = ctx.rng(`rocks:${v}`);
  const g = new THREE.Group();
  const red: THREE.BufferGeometry[] = [];
  const cool: THREE.BufferGeometry[] = [];
  const sand: THREE.BufferGeometry[] = [];
  let lichen: THREE.BufferGeometry | undefined;

  if (v === 0) {
    // 一大块红砂岩（平顶微斜）+ 右前一块中的 + 左前一块小的
    red.push(
      rock({ rx: 0.85, rz: 0.68, rings: boulder(1.15, 0.03), x: -0.15, z: -0.15, ry: 0.35, varnish: 0.45 }, rnd),
    );
    red.push(rock({ rx: 0.42, rz: 0.36, rings: boulder(0.55), x: 0.8, z: 0.45, ry: 1.1, varnish: 0.2 }, rnd));
    red.push(rock({ rx: 0.28, rz: 0.24, rings: boulder(0.32), x: -0.95, z: 0.6, ry: 0.4 }, rnd));
    sand.push(drift(-0.75, 0.2, 1.3, 0.34, 1.3, 0.5));
  } else if (v === 1) {
    // 平顶岩板：宽而低的底层（斜边、几乎共面的顶）+ 后面叠一块小的上层（层状砂岩的台）
    const slab = (h: number, n: number): Ring[] => [
      { y: -0.08, r: 1.0, jr: 0.06, n },
      { y: h * 0.7, dy: 0.02, r: 1.0, jr: 0.06, n },
      { y: h, dy: 0.015, r: 0.86, jr: 0.06, n },
    ];
    red.push(rock({ rx: 1.25, rz: 0.9, rings: slab(0.4, 6), x: 0.05, z: 0.15, ry: 0.15, varnish: 0.2 }, rnd));
    const top = rock({ rx: 0.7, rz: 0.45, rings: slab(0.34, 5), x: -0.3, z: -0.35, ry: -0.25 }, rnd);
    top.translate(0, 0.38, 0);
    red.push(top);
    sand.push(drift(-1.2, 0.4, 0.9, 0.26, 1.3, 0.3));
  } else {
    // 灰紫冷石：一块圆钝的大石 + 右前一块小红石；冷石顶上一小块地衣
    cool.push(rock({ rx: 0.72, rz: 0.62, rings: boulder(1.0, 0.1), x: -0.15, z: -0.1, ry: 0.7 }, rnd));
    red.push(rock({ rx: 0.36, rz: 0.3, rings: boulder(0.4), x: 0.75, z: 0.5, ry: 0.2, varnish: 0.15 }, rnd));
    sand.push(drift(-0.75, 0.25, 1.1, 0.3, 1.2, -0.3));
    // 地衣：顶上一块压扁的小团（≥ 3 纹素宽），朝上 → 亮档
    lichen = new THREE.IcosahedronGeometry(0.2, 0);
    lichen.scale(1.5, 0.3, 1.2);
    lichen.translate(-0.3, 1.0, -0.2);
  }

  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, name: string) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.name = name;
    g.add(m);
    return m;
  };
  // 多面体：凸边高光 ≤ 0.6，否则小面上一片白；不接收投影（掠射面上的投影毛边是麻点）
  const rockOpts = {
    edge: 0.55,
    convex: 0.4,
    vertexColors: true,
    noShadowReceive: true,
    bands: [-0.1, 0.45] as [number, number],
    lightUp: 0.35,
  };
  add(red, ctx.mat('rock', rockOpts), 'rock');
  // 冷石的面更亮、更平：凸边再降一点，否则中档面上撒满亮点
  add(cool, ctx.mat('rockCool', { ...rockOpts, convex: 0.3 }), 'rockCool');
  add(sand, ctx.mat('sandDrift', { lightUp: 0.3 }), 'drift');
  if (lichen) add([lichen], ctx.mat('sage', { edge: 0.4, convex: 0.3, noise: 0 }), 'lichen');
  ctx.mats.prepare(g);
  return g;
}
