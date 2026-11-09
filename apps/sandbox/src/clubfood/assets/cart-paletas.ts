// #5 cart-paletas：冰棍三轮（餐车院子东边一列，世界 (−23.9, −29.2)，rotY −0.75 朝西南）。
// 尺寸 ≈ 1.9（x）× 2.3（伞顶）× 0.9（z，不算伞）；三角形 ≈ 0.8k。
// 剪影三团：粉白条纹伞（⌀ 1.9，8 片粉 / 奶油相间，朝天 = 亮档，主角）+ 白冷柜（粉盖、粉底边，正面三个冰棍图标）+ 轮子（两个前轮夹着冷柜、后面一个大轮）。
// 本地：冷柜在 −x（车头），车座、后轮在 +x（车尾，摊主那头）；+z = 冷柜正面（买的人站这边）。冷柜盖往上开一条缝，露出一排冰棍。
// userData：
//   spots = { vendor: [1.0, −0.35]（车座旁、偏后，摊主站的地面点）, window: [−0.42, 0.95]（冷柜正面前，买的人站的地面点） }（本地 x, z，米）
//   setStock(k)：0..1，冷柜盖缝里的冰棍跟着少（≥ 0.67 三根、≥ 0.34 两根、> 0 一根、0 没有）
// 变体：没有（一辆）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：lightUp + 低 bands 留住中档，不接投影 */
const SIDE: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true };
/** 朝镜头的竖直面压到亮档（小图标：在白冷柜的中档上靠亮档拉开） */
const SIDE_LIT: ToonOpts = { lightUp: 0.55, bands: [-0.6, -0.35], noShadowReceive: true };
/** 整块只取"低一级"那个色（奶油：clothWhite 亮档往中档挪 30%，L ≈ 225，和粉的亮档差 < 60） */
const LOW_TONE: ToonOpts['elem'] = { kind: 'planks', space: 'local', seam: 0, hi: 0, p: [0, 1, 0, 100] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'cart-paletas';
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, geo: THREE.BufferGeometry) => {
    const l = bins.get(m);
    if (l) l.push(geo);
    else bins.set(m, [geo]);
  };

  // ── 材质 ──
  const white = ctx.mat('clothWhite', {
    ...SIDE,
    convex: 0.3,
    elem: { kind: 'paint', space: 'local', size: [9, 6], density: [0, 0] },
  });
  const pinkSide = ctx.mat('accPaleta', { ...SIDE, convex: 0.3 });
  // 伞面、盖子朝天：亮档；不接投影（伞面上没有东西挡太阳，接了就是阴影贴图的麻点）
  const pinkTop = ctx.mat('accPaleta', { lightUp: 0.4, convex: 0.3, side: THREE.DoubleSide, noShadowReceive: true });
  const cream = ctx.mat('clothWhite', {
    lightUp: 0.4,
    convex: 0.3,
    side: THREE.DoubleSide,
    noShadowReceive: true,
    elem: LOW_TONE,
    toneW: [0, 1],
  });
  const pinkVal = ctx.mat('accPaleta', { ...SIDE, convex: 0.2, side: THREE.DoubleSide });
  const creamVal = ctx.mat('clothWhite', {
    ...SIDE,
    convex: 0.2,
    side: THREE.DoubleSide,
    elem: LOW_TONE,
    toneW: [0, 1],
  });
  const pinkIcon = ctx.mat('accPaleta', { ...SIDE_LIT, convex: 0.2 });
  const yellow = ctx.mat('flowerYellow', { ...SIDE, convex: 0.2 });
  const green = ctx.mat('accBurger', { ...SIDE, convex: 0.2 });
  const stick = ctx.mat('wood', { ...SIDE_LIT, convex: 0.2 });
  // 冷柜里面：暗档主色（不用黑：强边缘）
  const inside = ctx.mat('accPaleta', { bands: [2, 3], noShadowReceive: true, edge: 0.2, convex: 0 });
  const metal = ctx.mat('metal', { convex: 0.3 });
  const tyre = ctx.mat('tyre', { ...SIDE_LIT, convex: 0.2 });
  const hub = ctx.mat('metal', { ...SIDE, convex: 0.2 });
  const seat = ctx.mat('wood', { lightUp: 0.4, convex: 0.3 });

  // ── 冷柜（车头，−x）──
  const CX = -0.42;
  const CW = 1.04;
  const CD = 0.72;
  const Y0 = 0.42; // 箱底
  const Y1 = 1.04; // 箱口
  const BAND = 0.13; // 粉底边
  put(pinkSide, box(CW + 0.04, BAND, CD + 0.04, CX, Y0, 0));
  put(white, box(CW, Y1 - Y0 - BAND, CD, CX, Y0 + BAND, 0));
  // 箱口：里面一层暗粉（盖子开着，从缝里看进去）
  put(inside, box(CW - 0.02, 0.02, CD - 0.02, CX, Y1 - 0.02, 0));
  // 箱口一圈粉边（1 纹素高），盖子合上时压在上面
  put(pinkSide, box(CW + 0.04, 0.05, 0.09, CX, Y1 - 0.05, CD / 2 - 0.025));
  // 盖子：后沿铰链，往上掀 0.42 弧度（前沿抬起 ≈ 0.33）
  const LID = 0.42;
  const lid = new THREE.BoxGeometry(CW + 0.08, 0.09, CD + 0.08)
    .translate(0, 0.045, (CD + 0.08) / 2)
    .rotateX(-LID)
    .translate(CX, Y1, -(CD + 0.08) / 2);
  put(pinkTop, lid);
  // 车架托住冷柜（一条暗线）+ 前轴
  put(metal, box(CW + 0.1, 0.08, CD - 0.1, CX, Y0 - 0.08, 0));
  put(metal, box(0.1, 0.1, 1.0, CX, 0.19, 0));

  // 正面三个冰棍图标：胖冰棍（0.24 × 0.3）+ 棍（0.09 × 0.11）。粉 = 亮档，黄 / 绿 = 中档（都和白冷柜的中档差 < 60）
  const zF = CD / 2 + 0.012;
  const icons: [THREE.Material, number][] = [
    [pinkIcon, -0.33],
    [yellow, 0],
    [green, 0.33],
  ];
  for (const [m, dx] of icons) {
    put(m, box(0.24, 0.3, 0.03, CX + dx, 0.65, zF));
    put(m, box(0.16, 0.05, 0.03, CX + dx, 0.95, zF)); // 圆一点的顶
    put(stick, box(0.09, 0.11, 0.03, CX + dx, 0.55, zF));
  }

  // 盖缝里一排冰棍（setStock 控制）：三根，粉 / 黄 / 绿，立在冷柜前沿后面
  const pops: THREE.Mesh[] = [];
  const popMats = [pinkSide, yellow, green];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(box(0.2, 0.2, 0.12, CX + (i - 1) * 0.32, Y1 - 0.04, CD / 2 - 0.2), popMats[i]);
    pops.push(m);
    g.add(m);
  }

  // ── 车架、车座、车把（车尾，+x）──
  const tube = (a: [number, number], b: [number, number], z: number, t = 0.11) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    return new THREE.BoxGeometry(t, len, t)
      .rotateZ(Math.atan2(-dx, dy))
      .translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
  };
  const RX = 0.66; // 后轴
  const RR = 0.34; // 后轮半径
  put(metal, tube([CX + CW / 2 - 0.05, 0.4], [RX, RR], 0)); // 下管：冷柜 → 后轴
  put(metal, tube([0.2, 0.42], [0.2, 1.12], 0)); // 车把立管
  put(metal, tube([0.2, 0.86], [0.56, 0.86], 0)); // 上管
  put(metal, tube([0.5, 0.36], [0.56, 0.92], 0)); // 座管
  put(metal, box(0.1, 0.1, 0.66, 0.22, 1.1, 0)); // 车把横杆
  for (const z of [-0.3, 0.3]) put(tyre, box(0.12, 0.12, 0.12, 0.22, 1.09, z)); // 把套
  put(seat, box(0.34, 0.1, 0.26, 0.58, 0.92, 0)); // 车座

  // ── 轮子：前面两个夹着冷柜，后面一个大轮。胎 = tyre（朝镜头压亮档，L 84），毂 = metal ──
  const wheel = (x: number, y: number, z: number, r: number, t: number) => {
    put(tyre, new THREE.CylinderGeometry(r, r, t, 14).rotateX(Math.PI / 2).translate(x, y, z));
    put(hub, new THREE.CylinderGeometry(r * 0.5, r * 0.5, t + 0.03, 10).rotateX(Math.PI / 2).translate(x, y, z));
  };
  const FR = 0.24;
  wheel(CX, FR, CD / 2 + 0.1, FR, 0.16);
  wheel(CX, FR, -(CD / 2 + 0.1), FR, 0.16);
  wheel(RX, RR, 0, RR, 0.16);

  // ── 伞：杆夹在冷柜右后角的车架上；8 片粉 / 奶油相间，伞面朝天（亮档），南沿落中档出圆 ──
  const UX = 0.14;
  const UZ = -0.3;
  const R = 0.95;
  const TOP = 2.3;
  const RIM = 1.92;
  const VAL = 0.14; // 垂边
  put(metal, box(0.12, TOP - 0.36, 0.12, UX, 0.36, UZ));
  const yAt = (r: number) => TOP - (TOP - RIM) * (r / R) ** 1.5;
  const C = new THREE.Vector3(0, 0.9, 0); // 法线中心：越低越"平"
  const N = 8;
  const RM = 0.5 * R;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2 + Math.PI / 8;
    const a1 = ((i + 1) / N) * Math.PI * 2 + Math.PI / 8;
    const P = (r: number, a: number) => new THREE.Vector3(r * Math.cos(a), yAt(r), r * Math.sin(a));
    const A = new THREE.Vector3(0, TOP, 0);
    const M0 = P(RM, a0);
    const M1 = P(RM, a1);
    const R0 = P(R, a0);
    const R1 = P(R, a1);
    const gore = triGeo([A, M1, M0, M0, M1, R1, M0, R1, R0], (p) => p.clone().sub(C).normalize());
    put(i % 2 ? cream : pinkTop, gore.translate(UX, 0, UZ));
    // 垂边：每片一段竖条，法线朝外
    const out = new THREE.Vector3(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2));
    const t0 = R0.clone();
    const t1 = R1.clone();
    const b0 = t0.clone().setY(RIM - VAL);
    const b1 = t1.clone().setY(RIM - VAL);
    const val = triGeo([b0, t0, t1, b0, t1, b1], () => out);
    put(i % 2 ? creamVal : pinkVal, val.translate(UX, 0, UZ));
  }

  for (const [m, list] of bins) g.add(new THREE.Mesh(mergeGeometries(list), m));

  const stock = (k: number) => {
    const n = k <= 0 ? 0 : Math.max(1, Math.ceil(Math.min(1, k) * 3 - 0.01));
    pops.forEach((p, i) => {
      p.visible = i < n;
    });
  };
  g.userData.spots = { vendor: [1.0, -0.35], window: [-0.42, 0.95] };
  g.userData.setStock = stock;
  ctx.mats.prepare(g);
  return g;
}

/** 三角形表 → 有 position / normal / uv 的索引几何体（和 BoxGeometry 一样的属性，能合并） */
function triGeo(pts: THREE.Vector3[], normal: (p: THREE.Vector3) => THREE.Vector3): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const p of pts) {
    pos.push(p.x, p.y, p.z);
    const n = normal(p);
    nor.push(n.x, n.y, n.z);
    uv.push(0, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(pts.map((_, i) => i));
  return geo;
}
