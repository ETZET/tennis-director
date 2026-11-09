// #6 cart-churros：吉事果车（餐车院子南边，世界 (−26.3, −12.6)，rotY −0.3 朝南偏西）。
// 尺寸 ≈ 1.6（x）× 2.2（篷顶）× 0.8（z，不算轮）；三角形 ≈ 0.7k。
// 剪影三团：芥末黄 + 红条的小平顶篷（两根后柱撑着，篷顶朝天 = 亮档）+ 木车厢（竖板，正面一块吉事果图标牌）+ 两个胖木轮（马车轮：深色铁箍 + 木辐条）。
// 车厢上一只玻璃柜（背板、侧板是玻璃，正面敞着），里面立着一排吉事果（bun 黄棕短条，2 纹素粗、≥ 3 纹素长）；柜边一罐巧克力酱。
// 本地：+z = 车前（买的人），−z = 车后（摊主）；轮轴在 +x 那头，−x 那头两条支腿 + 两根推把。
// userData：
//   spots = { vendor: [0.2, −0.8]（车后，摊主站的地面点）, window: [−0.2, 0.9]（玻璃柜前，买的人站的地面点） }（本地 x, z，米）
//   setStock(k)：0..1，玻璃柜里的吉事果跟着少（1 → 5 根，0.3 → 3 根，< 0.3 只剩 2 根，< 0.15 一根，0 空）
// 变体：没有（一辆）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：lightUp + 低 bands 留住中档，不接投影 */
const SIDE: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true };
/** 朝镜头的竖直面压到亮档（玻璃映天、图标、轮胎） */
const SIDE_LIT: ToonOpts = { lightUp: 0.55, bands: [-0.6, -0.35], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'cart-churros';
  const rnd = ctx.rng('cart-churros:churros');
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, geo: THREE.BufferGeometry) => {
    const l = bins.get(m);
    if (l) l.push(geo);
    else bins.set(m, [geo]);
  };

  // ── 材质 ──
  // 车厢：竖板（每块 0.31 米 ≈ 3.4 纹素，1 纹素缝 + 缝后一纹素亮条）
  const BW = 1.24;
  const planks = ctx.mat('timber', {
    ...SIDE,
    convex: 0.3,
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 1, p: [1, 0, 0, BW / 4] },
  });
  const timber = ctx.mat('timber', { ...SIDE, convex: 0.3 });
  const counter = ctx.mat('wood', { lightUp: 0.3, convex: 0.3 });
  // 篷：顶面朝天 = 亮档（主色最亮的一块），前沿和垂边靠 lightUp 留在中档（不落暗档）
  const yellow = ctx.mat('accChurro', { ...SIDE, convex: 0.2 });
  const red = ctx.mat('flowerRed', { ...SIDE, convex: 0.2 });
  const glass = ctx.mat('glass', { ...SIDE_LIT, convex: 0.2, edge: 0.3 });
  const churro = ctx.mat('bun', { ...SIDE, convex: 0.3 });
  const jar = ctx.mat('wood', { ...SIDE, convex: 0.3 });
  const choc = ctx.mat('ironwork', { lightUp: 0.3, bands: [-2, 2], noShadowReceive: true, convex: 0 });
  const plaque = ctx.mat('accChurro', { ...SIDE, convex: 0.2 });
  const iconStick = ctx.mat('bun', { ...SIDE_LIT, convex: 0.2 });
  const iconCone = ctx.mat('flowerRed', { ...SIDE_LIT, convex: 0.2 });
  const tyre = ctx.mat('tyre', { ...SIDE_LIT, convex: 0.2 });
  const spoke = ctx.mat('wood', { ...SIDE, convex: 0.2 });
  const hub = ctx.mat('ironwork', { ...SIDE, convex: 0.2 });

  // ── 车厢 + 台面 ──
  const BD = 0.64;
  const Y0 = 0.36;
  const Y1 = 1.0;
  put(planks, box(BW, Y1 - Y0, BD, 0, Y0, 0));
  put(counter, box(BW + 0.12, 0.08, BD + 0.14, 0, Y1, 0.01));
  const YC = Y1 + 0.08; // 台面
  // 支腿（−x 那头）+ 推把
  for (const z of [-0.24, 0.24]) {
    put(timber, box(0.1, Y0, 0.1, -0.52, 0, z));
    put(timber, box(0.26, 0.11, 0.11, -BW / 2 - 0.12, 0.86, z));
  }

  // 正面的吉事果图标牌（不写字）：芥末黄圆牌 + 红纸筒 + 三根吉事果
  const zF = BD / 2 + 0.015;
  const PX = -0.36;
  const PY = 0.68;
  put(plaque, new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16).rotateX(Math.PI / 2).translate(PX, PY, zF));
  const cone = new THREE.Shape();
  cone.moveTo(-0.11, 0);
  cone.lineTo(0.11, 0);
  cone.lineTo(0, -0.19);
  cone.closePath();
  // Extrude 是非索引几何体：补上索引才能和别的合并
  put(iconCone, indexed(new THREE.ExtrudeGeometry(cone, { depth: 0.03, bevelEnabled: false })).translate(PX, PY, zF));
  for (const a of [-0.38, 0, 0.38]) {
    const s = new THREE.BoxGeometry(0.1, 0.24, 0.03)
      .translate(0, 0.12, 0)
      .rotateZ(a)
      .translate(PX, PY - 0.02, zF + 0.02);
    put(iconStick, s);
  }

  // ── 玻璃柜：背板、两侧是玻璃（映天，亮档），正面敞着；上沿一根玻璃框 ──
  const GX0 = -0.58;
  const GX1 = 0.18;
  const GZ0 = -0.22;
  const GZ1 = 0.16;
  const GH = 0.36;
  const gx = (GX0 + GX1) / 2;
  const gw = GX1 - GX0;
  put(glass, box(gw, GH, 0.04, gx, YC, GZ0 + 0.02));
  put(glass, box(0.05, GH, GZ1 - GZ0, GX0 + 0.025, YC, (GZ0 + GZ1) / 2));
  put(glass, box(0.05, GH, GZ1 - GZ0, GX1 - 0.025, YC, (GZ0 + GZ1) / 2));
  put(glass, box(gw, 0.09, 0.05, gx, YC + GH - 0.09, GZ1 - 0.025));
  put(glass, box(gw, 0.08, 0.05, gx, YC, GZ1 - 0.025));

  // 一排吉事果（立着，略歪，比柜子高一截：亮的顶头从柜沿上露出来）：前排三根、后排两根。InstancedMesh，setStock 改 count
  const SPOTS: [number, number, number][] = [
    [-0.2, 0.04, 0.4],
    [-0.065, -0.1, 0.42],
    [-0.47, 0.04, 0.38],
    [0.07, 0.04, 0.39],
    [-0.335, -0.1, 0.42],
  ];
  const churros = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.18, 1, 0.12).translate(0, 0.5, 0),
    churro,
    SPOTS.length,
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  SPOTS.forEach(([x, z, h], i) => {
    e.set(0, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.24);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, YC + 0.03, z), q, new THREE.Vector3(1, h, 1));
    churros.setMatrixAt(i, m4);
  });
  churros.instanceMatrix.needsUpdate = true;
  g.add(churros);

  // 巧克力酱罐（柜边）：木色罐身 + 深色酱面
  put(jar, new THREE.CylinderGeometry(0.13, 0.13, 0.24, 12).translate(0.42, YC + 0.12, -0.04));
  put(choc, new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12).translate(0.42, YC + 0.24, -0.04));

  // ── 平顶篷：两根后柱 + 篷顶（芥末黄 0.27 / 红 0.18 相间的竖条，朝天 = 亮档）+ 前沿垂边 ──
  const TY = 2.06;
  for (const x of [-0.6, 0.6]) put(timber, box(0.12, TY - YC, 0.12, x, YC, -0.28));
  const CZ0 = -0.5;
  const CZ1 = 0.42;
  const VAL = 0.14;
  // 黄 3 纹素、红 2 纹素（整纹素宽）
  let x = -0.81;
  for (let i = 0; i < 7; i++) {
    const w = i % 2 ? 0.18 : 0.27;
    const cx = x + w / 2;
    const m = i % 2 ? red : yellow;
    put(m, box(w, 0.08, CZ1 - CZ0, cx, TY, (CZ0 + CZ1) / 2));
    put(m, box(w, VAL, 0.04, cx, TY - VAL + 0.02, CZ1 - 0.02));
    x += w;
  }

  // ── 两个胖木轮（轴在 +x 那头）：铁箍（tyre）+ 木轮辋 + 十字辐条（wood），毂 ironwork ──
  const WX = 0.3;
  const WR = 0.4;
  for (const side of [1, -1]) {
    const z = side * (BD / 2 + 0.1);
    put(tyre, new THREE.CylinderGeometry(WR, WR, 0.12, 16).rotateX(Math.PI / 2).translate(WX, WR, z));
    const zf = z + side * 0.065;
    put(spoke, annulus(WR - 0.07, WR - 0.18, 16, side).translate(WX, WR, zf));
    for (const a of [0, Math.PI / 2]) {
      const sp = new THREE.BoxGeometry(0.1, 2 * (WR - 0.12), 0.03).rotateZ(a).translate(WX, WR, zf - side * 0.01);
      put(spoke, sp);
    }
    put(hub, new THREE.CylinderGeometry(0.1, 0.1, 0.18, 10).rotateX(Math.PI / 2).translate(WX, WR, z));
  }
  put(timber, box(0.1, 0.1, BD + 0.2, WX, WR - 0.05, 0)); // 轴

  for (const [m, list] of bins) g.add(new THREE.Mesh(mergeGeometries(list), m));

  const stock = (k: number) => {
    let n: number;
    if (k <= 0) n = 0;
    else if (k < 0.15) n = 1;
    else if (k < 0.3) n = 2;
    else n = Math.min(5, Math.max(3, Math.round(3 + ((k - 0.3) / 0.7) * 2)));
    churros.count = n;
  };
  g.userData.spots = { vendor: [0.2, -0.8], window: [-0.2, 0.9] };
  g.userData.setStock = stock;
  ctx.mats.prepare(g);
  return g;
}

/** 非索引几何体 → 索引几何体（每个顶点一个索引；能和 BoxGeometry 合并） */
function indexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geo.index) geo.setIndex(Array.from({ length: geo.getAttribute('position').count }, (_, i) => i));
  return geo;
}

/** 竖直的圆环面（法线 ±z），外径 ro、内径 ri，side = 1 朝 +z、−1 朝 −z */
function annulus(ro: number, ri: number, seg: number, side: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(ri * Math.cos(a), ri * Math.sin(a), 0, ro * Math.cos(a), ro * Math.sin(a), 0);
  }
  for (let i = 0; i < seg; i++) {
    const i0 = i * 2;
    const o0 = i * 2 + 1;
    const i1 = i * 2 + 2;
    const o1 = i * 2 + 3;
    if (side > 0) idx.push(i0, o0, o1, i0, o1, i1);
    else idx.push(i0, o1, o0, i0, i1, o1);
  }
  const n = pos.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      new Array(n).fill(0).flatMap(() => [0, 0, side]),
      3,
    ),
  );
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0), 2));
  geo.setIndex(idx);
  return geo;
}
