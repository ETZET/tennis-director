// carport：停车场的遮阳棚（北远排 carport-a/b、南远排 carport-c/d）。规格见 docs/lab/2026-11-07-3d-pixel/clubpark.md。
// 10.8 × 3.4 × 5.8 米：两排钢柱（每排 3 根，立在车位分隔线上）+ 前后两根梁 + 一整块绷紧的奶油帆布（北 3.4 → 南 3.0），
// 俱乐部蓝的宽条纹南北走（屏幕上是竖条，每条 0.9 米），南沿一道 0.3 米垂边（朝镜头 = 暗档，蓝白跟着条纹）。
// 帆布不是一块平板：车位分隔线上各有一根椽子（x = 0、±2.7），把布分成四个"枕头"（一个车位一个），每个枕头在
// 前后梁和椽子之间往下兜 0.35 米：北半坡朝南 → 中档的一道弧（读成兜下去的布），其余朝北 → 亮档；东西两条自由边是
// 往里收的悬链线（中段收 0.45 米，角柱露出来）；每根椽子上一道接缝（planks：1 纹素缝 + 缝后一纹素断续亮条 + 每个枕头
// 自己一个深浅）。条纹正好在每个枕头中间。
// 投影是构图的一部分（压在车上的一条暗带）：帆布双面、要投影；自己不接收投影（THIN）。
// 本地原点 = 占地中心，+z 朝南（镜头），单位米。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubfront/toon';
import type { AssetCtx } from '../world';
import { fabricGrid, type Surface } from './shade/fabric';

const W = 10.8;
const D = 5.8;
const Y_N = 3.4; // 北沿高
const Y_S = 3.0; // 南沿高
const SAG = 0.35; // 枕头中间往下兜多少
const CAT = 0.45; // 东西自由边往里收多少（悬链线，中段最深）
const BAY = 2.7; // 枕头宽 = 车位宽
const COL = 0.45; // 网格列宽（条纹边、布幅缝都落在列线上）
const STRIPES: [number, number][] = [
  // 每个枕头（车位）正中一条 0.9 米
  [-4.5, -3.6],
  [-1.8, -0.9],
  [0.9, 1.8],
  [3.6, 4.5],
];
const VAL = 0.3; // 南沿垂边
const POST = 0.27; // 钢柱 3 设计纹素见方
const POST_X = [-5.1, 0, 5.1];
const POST_Z = 2.72;

/** 帆布顶的高度场：沿南北线性下降 + 每个枕头的双向下兜（椽子 x = 0、±2.7、±5.4 和前后梁上为 0） */
const roof: Surface = {
  y(x, z) {
    const base = Y_N + ((Y_S - Y_N) * (z + D / 2)) / D;
    // 每个车位一个枕头：椽子在 x = 0、±2.7、±5.4（车位分隔线）
    const cx = (Math.floor(x / BAY) + 0.5) * BAY;
    const xi = Math.min(1, Math.abs(x - cx) / (BAY / 2));
    const eta = Math.min(1, Math.abs(z) / (D / 2));
    // 两个方向都是抛物线（试过 1 − ξ⁴：靠椽子一窄条折痕，整片读成斜着的褶，中档太多）
    return base - SAG * (1 - xi * xi) * (1 - eta * eta);
  },
};

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'carport';

  // 帆布：双面（单面的平板在阴影贴图里会被剔掉，投影带就没了）；档位阈值往上挪一点（平的帆布 l ≈ 0.64），
  // 北半坡（l < 0.55）落中档
  const fab: ToonOpts = {
    side: THREE.DoubleSide,
    bands: [0.1, 0.55],
    // 接缝：沿本地 x 每个枕头一幅（缝在椽子上），缝 1 纹素 + 缝后一纹素亮条；每幅自己一个深浅（本色 / 高一级 / 低一级）
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, BAY], q: [1, 0, 0, 0], seam: 1, hi: 1 },
    toneW: [0.3, 0.3],
  };
  const cream = ctx.mat('canvas', fab);
  const blue = ctx.mat('canvasStripe', fab);
  const isStripe = (x0: number, x1: number) => STRIPES.some(([a, b]) => x0 >= a - 1e-6 && x1 <= b + 1e-6);

  // 列：每 0.45 米一列，条纹、接缝都在列线上；最外两列的外沿按悬链线往里收
  const cols: number[] = [];
  for (let x = -W / 2; x <= W / 2 + 1e-6; x += COL) cols.push(Math.round(x * 100) / 100);
  const edgeX = (side: -1 | 1, z: number) => {
    const eta = z / (D / 2);
    return side * (W / 2 - CAT * (1 - eta * eta));
  };
  const top: Record<'c' | 'b', THREE.BufferGeometry[]> = { c: [], b: [] };
  for (let i = 0; i < cols.length - 1; i++) {
    const x0 = cols[i];
    const x1 = cols[i + 1];
    const geo = fabricGrid(roof, {
      x0: i === 0 ? (z) => edgeX(-1, z) : () => x0,
      x1: i === cols.length - 2 ? (z) => edgeX(1, z) : () => x1,
      z0: -D / 2,
      z1: D / 2,
      nx: 1,
      nz: 10,
    });
    top[isStripe(x0, x1) ? 'b' : 'c'].push(geo);
  }

  // 南沿垂边：从帆布南沿往下 0.3 米，朝镜头（南沿在梁上，没有下兜，是一条直线）
  const valance: Record<'c' | 'b', THREE.BufferGeometry[]> = { c: [], b: [] };
  for (let i = 0; i < cols.length - 1; i++) {
    const x0 = cols[i];
    const x1 = cols[i + 1];
    const y = roof.y(x0, D / 2);
    const geo = new THREE.PlaneGeometry(x1 - x0, VAL).translate((x0 + x1) / 2, y - VAL / 2, D / 2 + 0.02);
    valance[isStripe(x0, x1) ? 'b' : 'c'].push(geo);
  }

  const add = (geos: THREE.BufferGeometry[], m: THREE.Material, name: string) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos.map(clean)), m);
    mesh.name = name;
    g.add(mesh);
  };
  add(top.c, cream, 'canvas');
  add(top.b, blue, 'canvasStripe');
  // 垂边：朝镜头的暗档；最上面一行是卷边的亮边（planks 沿 −y，一块板 = 整条垂边，没有缝，
  // q.x = cos45：竖直的米换成屏幕行，亮边正好一行），其余一整片
  const val: ToonOpts = {
    side: THREE.DoubleSide,
    elem: { kind: 'planks', space: 'local', p: [0, -1, 0, VAL], q: [Math.SQRT1_2, 0, 0, 0], seam: 0, hi: 1 },
  };
  add(valance.c, ctx.mat('canvas', val), 'valance');
  add(valance.b, ctx.mat('canvasStripe', val), 'valanceStripe');

  // 钢构：6 根柱（只有南排露出来，北排藏在帆布下面）+ 前后两根梁（藏在垂边后面，只为投影）+ 柱脚的小水泥墩
  const steel = ctx.mat('steel', { lightUp: 0.5, bands: [-0.3, 0.45] });
  const parts: THREE.BufferGeometry[] = [];
  for (const x of POST_X)
    for (const z of [-POST_Z, POST_Z]) {
      // 柱顶按托板两边下面帆布最低的地方定（枕头往下兜，托板不能顶穿帆布）
      const h = Math.min(roof.y(x - 0.2, z), roof.y(x + 0.2, z), roof.y(x, z)) - 0.06;
      parts.push(new THREE.BoxGeometry(POST, h, POST).translate(x, h / 2, z));
      // 柱头的托板（比柱宽一纹素）
      parts.push(new THREE.BoxGeometry(POST + 0.09, 0.09, POST + 0.09).translate(x, h - 0.045, z));
    }
  for (const z of [-POST_Z, POST_Z]) {
    // 梁顶比帆布在这条线上最低的地方再低一纹素（枕头往下兜，梁不能穿出来）
    const y = Math.min(roof.y(0, z), roof.y(-BAY / 2, z)) - 0.09;
    const bl = new THREE.BoxGeometry(W - 0.6, 0.27, 0.2).translate(0, y - 0.135, z);
    parts.push(bl);
  }
  const steelMesh = new THREE.Mesh(mergeGeometries(parts.map(clean)), steel);
  steelMesh.name = 'steel';
  g.add(steelMesh);

  const piers: THREE.BufferGeometry[] = [];
  for (const x of POST_X)
    for (const z of [-POST_Z, POST_Z]) piers.push(new THREE.BoxGeometry(0.45, 0.18, 0.45).translate(x, 0.09, z));
  const pier = new THREE.Mesh(mergeGeometries(piers.map(clean)), ctx.mat('kerb'));
  pier.name = 'pier';
  g.add(pier);

  // 帆布自己不接收投影（palette 的 THIN），但要投影（投影带是构图的一部分）；柱子、墩子照常
  ctx.mats.prepare(g);
  return g;
}

/** mergeGeometries 要求属性一致：只留 position / normal / uv，统一成非索引 */
function clean(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.getAttribute('uv'))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  return g;
}
