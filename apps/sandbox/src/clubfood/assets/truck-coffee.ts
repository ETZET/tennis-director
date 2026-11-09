// truck-coffee：#1 咖啡车（主角那一排的西头，世界 (−37.4, −39.7)，朝南 rotY 0）。
// 圆头矮胖的老面包车（雪铁龙 H van / 老 VW 那种）：侧面轮廓是一条圆角的"面包"（车尾上角 r 0.45、车头上角 r 1.1 = 圆头，
// 分体挡风玻璃贴在车头圆弧上，俯视 45° 在车顶东头看得见），车顶到朝镜头的侧面再滚一道 0.28 的圆边（车头那头 0.43）；
// 前脸两只圆灯坐在车头两角（朝镜头的那只看得见）；后轮、前轮有轮拱、薄荷轮毂。
// 车顶上一只大咖啡杯招牌（杯碟 + 薄荷杯套 + 杯把 + 拿铁面）和三团胖热气（一纹素一纹素地晃）。
// 南面（+z）服务窗 x −1.3…0.7、y 1.35…2.35，木窗台（timber 顺长的板）伸出 0.25，窗里是暗档薄荷（不是黑），
// 东侧窗里一台咖啡机；窗上一块近乎水平的条纹篷（7 条薄荷 / 奶油相间，伸出 0.42、往下 0.06，垂边 0.18）；
// 窗西边一块奶油菜单牌（三个图标：热咖啡杯、冰咖啡、可颂，不写字）；车身一条奶油腰线。
// 尺寸：长 4.4（x）× 深 2.2（z）× 车顶 2.9（杯子招牌到 ≈ 3.7，热气到 ≈ 4.6）；车地板 0.85；驾驶室在东头（x 1.0…2.2）。
// 三角形 ≈ 2.2k。变体：只有 v0。画廊 `&stock=0.2` 看缺货的样子。
// userData（本地坐标，米；+z 朝镜头）：
//   spots = { window: [−0.3, 1.9]（点餐的客人站的地面点，窗台外沿前 0.55）, vendor: [−0.3, 0.65]（摊主站在车地板上）,
//             back: [−0.8, −1.6]（车北面补货卸货的地面点，车外 0.5） }
//   floor = 0.85；sill = [−0.3, 1.37, 1.2]（窗台顶面中心 [lx, ly, lz]）
//   setStock(k 0..1)：窗台上一排纸杯（6 只）按 k 少下去，k < 0.3 菜单牌的图标变灰。默认 1。
//   update(dt, t)：热气晃。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

type V2 = [number, number];

const L = 4.4;
const D = 2.2;
const ROOF = 2.9;
const FLOOR = 0.85;
const Z0 = -D / 2;
const Z1 = D / 2;
/** 服务窗（本地 x、y） */
const WIN = { x0: -1.3, x1: 0.7, y0: 1.35, y1: 2.35 };
/** 轮子：后轮、前轮的 x，半径，轮拱半径 */
const WHEEL_X = [-1.3, 1.35];
const WHEEL_R = 0.36;
const ARCH_R = 0.46;
const BODY_Y = 0.48;
/** 车头上角的大圆角（圆头）：挡风玻璃贴在这段弧上，45° 俯视下在车顶东头看得见 */
const FRONT_R = 1.1;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 车身朝镜头那条边的圆角半径（按高度：底下是直角，车顶 0.28） */
const roundAt = (x: number, y: number) => (0.28 + 0.15 * smooth(1.0, 2.2, x)) * smooth(0.9, 2.0, y);

/** 侧面轮廓（xy，逆时针）：车底 → 轮拱 → 车头 → 车顶 → 车尾 */
function profile(): V2[] {
  const P: V2[] = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number, skipFirst = false) => {
    for (let i = skipFirst ? 1 : 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  const h = L / 2;
  // 车尾下角
  arc(-h + 0.15, BODY_Y + 0.15, 0.15, Math.PI, 1.5 * Math.PI, 2);
  // 两个轮拱（凹进去：从左往右走，弧往上拱）
  const a = Math.asin((BODY_Y - WHEEL_R) / ARCH_R);
  for (const wx of WHEEL_X) arc(wx, WHEEL_R, ARCH_R, Math.PI - a, a, 8);
  // 车头下角、车头（竖直）、车头上角（大圆角 = 圆头）
  arc(h - 0.25, BODY_Y + 0.25, 0.25, 1.5 * Math.PI, 2 * Math.PI, 3);
  arc(h - FRONT_R, ROOF - FRONT_R, FRONT_R, 0, Math.PI / 2, 10);
  // 车尾上角
  arc(-h + 0.45, ROOF - 0.45, 0.45, Math.PI / 2, Math.PI, 6);
  return P;
}

/**
 * 侧面轮廓沿 z 挤出（z0…z1），两头的边按 rOf 滚圆角（seg 段）；南面（z1）可以开一个洞（hole，xy 逆时针），洞口往里一圈 reveal 深的内壁。
 * 法线：沿轮廓每条边一个（平的），沿圆角光滑 → 车顶到侧面是一道渐变的亮 → 中。
 */
function loaf(outline: V2[], rOf: (x: number, y: number) => number, seg: number, hole: V2[] | null, reveal: number) {
  const n = outline.length;
  const en: V2[] = outline.map((p, i) => {
    const q = outline[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy);
    return [dy / l, -dx / l];
  });
  const mv: V2[] = outline.map((_, i) => {
    const a = en[(i - 1 + n) % n];
    const b = en[i];
    const d = 1 + a[0] * b[0] + a[1] * b[1];
    return [(a[0] + b[0]) / d, (a[1] + b[1]) / d];
  });
  const rr = outline.map((p) => rOf(p[0], p[1]));
  const pos: number[] = [];
  const nor: number[] = [];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const tri = (a: number[], b: number[], c: number[], na: number[], nb: number[], nc: number[]) => {
    va.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    vb.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    vc.crossVectors(va, vb);
    const len = vc.length();
    if (len < 1e-9) return;
    const nx = na[0] + nb[0] + nc[0];
    const ny = na[1] + nb[1] + nc[1];
    const nz = na[2] + nb[2] + nc[2];
    if (vc.x * nx + vc.y * ny + vc.z * nz < 0) {
      pos.push(...a, ...c, ...b);
      nor.push(...na, ...nc, ...nb);
    } else {
      pos.push(...a, ...b, ...c);
      nor.push(...na, ...nb, ...nc);
    }
  };
  // 圆角的环：北头 a = π/2 → 0，南头 0 → π/2
  const rings: { a: number; south: boolean }[] = [];
  for (let j = seg; j >= 0; j--) rings.push({ a: ((Math.PI / 2) * j) / seg, south: false });
  for (let j = 0; j <= seg; j++) rings.push({ a: ((Math.PI / 2) * j) / seg, south: true });
  const vert = (i: number, k: number) => {
    const { a, south } = rings[k];
    const r = rr[i];
    const d = r * (1 - Math.cos(a));
    const p = outline[i];
    const z = south ? Z1 - r + r * Math.sin(a) : Z0 + r - r * Math.sin(a);
    return [p[0] - mv[i][0] * d, p[1] - mv[i][1] * d, z];
  };
  const norm = (i: number, k: number) => {
    const { a, south } = rings[k];
    return [en[i][0] * Math.cos(a), en[i][1] * Math.cos(a), (south ? 1 : -1) * Math.sin(a)];
  };
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    for (let k = 0; k < rings.length - 1; k++) {
      const A = vert(i, k);
      const B = vert(i1, k);
      const C = vert(i1, k + 1);
      const Dd = vert(i, k + 1);
      const nk = norm(i, k);
      const nk1 = norm(i, k + 1);
      tri(A, B, C, nk, nk, nk1);
      tri(A, C, Dd, nk, nk1, nk1);
    }
  }
  // 两头的盖子
  const capPts = outline.map((p, i) => new THREE.Vector2(p[0] - mv[i][0] * rr[i], p[1] - mv[i][1] * rr[i]));
  const holeV = hole ? hole.map(([x, y]) => new THREE.Vector2(x, y)) : null;
  for (const south of [true, false]) {
    const holes = south && holeV ? [holeV] : [];
    const all = [...capPts, ...holes.flat()];
    const faces = THREE.ShapeUtils.triangulateShape(capPts, holes);
    const z = south ? Z1 : Z0;
    const nz = [0, 0, south ? 1 : -1];
    for (const [a, b, c] of faces) {
      tri([all[a].x, all[a].y, z], [all[b].x, all[b].y, z], [all[c].x, all[c].y, z], nz, nz, nz);
    }
  }
  // 窗洞的内壁（朝洞口中心）
  if (hole) {
    for (let j = 0; j < hole.length; j++) {
      const p = hole[j];
      const q = hole[(j + 1) % hole.length];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const l = Math.hypot(dx, dy);
      const nn = [-dy / l, dx / l, 0];
      const A = [p[0], p[1], Z1];
      const B = [q[0], q[1], Z1];
      const C = [q[0], q[1], Z1 - reveal];
      const Dd = [p[0], p[1], Z1 - reveal];
      tri(A, B, C, nn, nn, nn);
      tri(A, C, Dd, nn, nn, nn);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** 圆柱面的一片（轴沿 z）：圆心 (cx, cy)、半径 r、角度 a0→a1（逆时针）、z0…z1；法线朝外 */
function arcPatch(cx: number, cy: number, r: number, a0: number, a1: number, z0: number, z1: number, n: number) {
  const pos: number[] = [];
  const nor: number[] = [];
  const P = (a: number, z: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a), z];
  const N = (a: number) => [Math.cos(a), Math.sin(a), 0];
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const b = a0 + ((a1 - a0) * (i + 1)) / n;
    pos.push(...P(a, z0), ...P(b, z0), ...P(b, z1), ...P(a, z0), ...P(b, z1), ...P(a, z1));
    nor.push(...N(a), ...N(b), ...N(b), ...N(a), ...N(b), ...N(a));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** 盒子：中心 x、z，底在 y（BoxGeometry 去掉 uv 以便和自建几何合并） */
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  g.deleteAttribute('uv');
  return g;
};
const strip = (g: THREE.BufferGeometry) => {
  g.deleteAttribute('uv');
  return g;
};
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)));

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const root = new THREE.Group();
  root.name = 'truck-coffee';
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };

  // ── 材质 ────────────────────────────────────────
  // 朝镜头的竖直面（太阳在画面后方）：lightUp + 低 bands 留住中档；车顶、篷顶朝天 → 亮档（主色最亮的一块）
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const body = ctx.mat('accCoffee', {
    ...face,
    elem: { kind: 'paint', size: [18, 10], density: [0, 0.03], patch: 3 },
  });
  const cream = ctx.mat('clothWhite', face);
  // 窗里：整块落暗档薄荷（L 90），不黑。不靠投影（壳子的投影按背面画，壳里的东西会被当成亮的）
  const inside = ctx.mat('accCoffee', { edge: 0.2, convex: 0.1, bands: [1.5, 2], noShadowReceive: true });
  const glass = ctx.mat('glass', face);
  const tyre = ctx.mat('tyre', face);
  const steel = ctx.mat('carSilver', face);
  const iron = ctx.mat('ironwork', { noShadowReceive: true });
  const lamp = ctx.mat('bulb', { lightUp: 0.5, noShadowReceive: true });
  // 招牌杯：球面法线（blobNormals）+ 往下挪的档位 → 上半亮白、下半中档
  const signBands: [number, number] = [-0.5, -0.1];
  const signM = ctx.mat('clothWhite', { lightUp: 0.45, bands: signBands, noShadowReceive: true });
  const sleeveM = ctx.mat('accCoffee', { lightUp: 0.45, bands: signBands, noShadowReceive: true });
  const latte = ctx.mat('bun', { noShadowReceive: true, edge: 0.2 });
  const steamM = ctx.mat('smoke', { lightUp: 0.5, bands: [-0.6, -0.2], noShadowReceive: true });
  const bunFace = ctx.mat('bun', face);
  const grey = ctx.mat('carSilver', face);

  // ── 车身（一个圆角的面包壳，南面开窗）+ 轮毂、篷的薄荷条 ───────────────────
  const outline = profile();
  const hole: V2[] = [
    [WIN.x0, WIN.y0],
    [WIN.x1, WIN.y0],
    [WIN.x1, WIN.y1],
    [WIN.x0, WIN.y1],
  ];
  const shell = loaf(outline, roundAt, 3, hole, 0.1);

  // 遮阳篷：车顶线（圆边下段）伸出 0.42、往下 0.06（再长就把窗里的摊主挡光了），7 条（薄荷 / 奶油相间，每条 ≈ 3.5 纹素），篷沿一圈 0.18 的垂边
  const AW = { x0: -1.42, x1: 0.82, z0: Z1 - 0.12, out: 0.42, y: ROOF - 0.18, drop: 0.06, val: 0.18 };
  const nStripe = 7;
  const sw = (AW.x1 - AW.x0) / nStripe;
  const tilt = Math.atan2(AW.drop, AW.out + (Z1 - AW.z0));
  const span = (AW.out + (Z1 - AW.z0)) / Math.cos(tilt);
  const mintBits: THREE.BufferGeometry[] = [shell];
  const creamBits: THREE.BufferGeometry[] = [];
  const zEdge = Z1 + AW.out;
  const yEdge = AW.y - AW.drop;
  for (let i = 0; i < nStripe; i++) {
    const cx = AW.x0 + sw * (i + 0.5);
    const top = box(sw, 0.05, span, 0, -0.025, 0)
      .rotateX(tilt)
      .translate(cx, (AW.y + yEdge) / 2, (AW.z0 + zEdge) / 2);
    const val = box(sw, AW.val, 0.05, cx, yEdge - AW.val + 0.02, zEdge - 0.02);
    (i % 2 === 0 ? mintBits : creamBits).push(top, val);
  }
  // 轮毂（薄荷，3 纹素）
  for (const wx of WHEEL_X) {
    mintBits.push(
      strip(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 10).rotateX(Math.PI / 2).translate(wx, WHEEL_R, Z1 - 0.04)),
    );
  }
  add(merge(mintBits), body, 'body');

  // 奶油：腰线（窗台下面一条，和窗台之间留一行薄荷）+ 篷的奶油条 + 菜单牌
  const bandY0 = 0.9;
  const bandY1 = 1.17;
  const bandX0 = -L / 2 + roundAt(-L / 2, bandY1) + 0.02;
  const bandX1 = L / 2 - roundAt(L / 2, bandY1) - 0.02;
  creamBits.push(box(bandX1 - bandX0, bandY1 - bandY0, 0.03, (bandX0 + bandX1) / 2, bandY0, Z1 + 0.012));
  const MB = { x0: -1.9, x1: -1.42, y0: 1.44, y1: 2.38 };
  const mbx = (MB.x0 + MB.x1) / 2;
  creamBits.push(box(MB.x1 - MB.x0, MB.y1 - MB.y0, 0.04, mbx, MB.y0, Z1 + 0.02));
  add(merge(creamBits), cream, 'cream');

  // 菜单牌上的图标（不写字）：热咖啡杯（薄荷，带杯把）、冰咖啡（焦糖色高杯 + 薄荷吸管）、可颂（月牙）
  const zi = Z1 + 0.055;
  const iconMint = merge([
    box(0.24, 0.24, 0.02, mbx - 0.04, 2.06, zi), // 杯身
    box(0.08, 0.12, 0.02, mbx + 0.12, 2.12, zi), // 杯把
    box(0.06, 0.09, 0.02, mbx + 0.05, 1.98, zi), // 冰咖啡的吸管
  ]);
  const iconBun = merge([
    box(0.2, 0.22, 0.02, mbx - 0.02, 1.76, zi), // 冰咖啡杯
    box(0.22, 0.14, 0.02, mbx, 1.53, zi), // 可颂中段
    box(0.09, 0.09, 0.02, mbx - 0.15, 1.48, zi), // 两只角
    box(0.09, 0.09, 0.02, mbx + 0.15, 1.48, zi),
  ]);
  const icons = [add(iconMint, body, 'icon-mint'), add(iconBun, bunFace, 'icon-bun')];
  const iconMats = icons.map((m) => m.material as THREE.Material);

  // ── 窗里（暗洞）：后墙、两侧、地板、顶 + 东边一张小台子和咖啡机 ─────────────────
  const IN = { x0: -1.5, x1: 0.9, z0: 0.0, z1: Z1 - 0.1 };
  add(
    merge([
      box(IN.x1 - IN.x0, ROOF - 0.35 - FLOOR, 0.1, (IN.x0 + IN.x1) / 2, FLOOR, IN.z0 + 0.05), // 后墙（面朝 +z 在 z 0.1）
      box(0.1, ROOF - 0.35 - FLOOR, IN.z1 - IN.z0, IN.x0, FLOOR, (IN.z0 + IN.z1) / 2),
      box(0.1, ROOF - 0.35 - FLOOR, IN.z1 - IN.z0, IN.x1, FLOOR, (IN.z0 + IN.z1) / 2),
      box(IN.x1 - IN.x0, 0.1, IN.z1 - IN.z0, (IN.x0 + IN.x1) / 2, FLOOR - 0.1, (IN.z0 + IN.z1) / 2), // 地板顶 = 0.85
      box(IN.x1 - IN.x0, 0.1, IN.z1 - IN.z0, (IN.x0 + IN.x1) / 2, ROOF - 0.35, (IN.z0 + IN.z1) / 2),
      box(0.6, 1.25 - FLOOR, 0.42, 0.5, FLOOR, 0.76), // 咖啡机下的小台子（窗里东边）
    ]),
    inside,
    'inside',
  );
  // 咖啡机（不锈钢，4～5 纹素宽）+ 顶上一摞杯子（奶油）
  add(merge([box(0.46, 0.36, 0.34, 0.5, 1.25, 0.78), box(0.3, 0.06, 0.2, 0.5, 1.61, 0.74)]), steel, 'machine');

  // 窗台（木台面，伸出 0.25）、前后保险杠（不锈钢）
  const SILL = { y: 1.37, z0: Z1 - 0.1, z1: Z1 + 0.25 };
  add(
    box(WIN.x1 - WIN.x0 + 0.24, 0.1, SILL.z1 - SILL.z0, (WIN.x0 + WIN.x1) / 2, SILL.y - 0.1, (SILL.z0 + SILL.z1) / 2),
    ctx.mat('timber', { ...face, elem: { kind: 'planks', p: [0, 0, 1, 0.12], seam: 1, hi: 1 } }),
    'sill',
  );
  add(
    merge([box(0.14, 0.18, D - 0.1, L / 2 + 0.03, 0.52, 0), box(0.12, 0.16, D - 0.2, -L / 2 - 0.02, 0.52, 0)]),
    steel,
    'steel',
  );

  // 驾驶室车窗（朝镜头那扇）
  // + 车头圆弧上的分体挡风玻璃（两片，中间一条薄荷窗框）：朝上偏东，45° 俯视下是车顶东头的一条天蓝
  const fx = L / 2 - FRONT_R;
  const fy = ROOF - FRONT_R;
  const ws = (z0: number, z1: number) => arcPatch(fx, fy, FRONT_R + 0.012, 0.42, 1.08, z0, z1, 5);
  add(merge([box(0.5, 0.6, 0.03, 1.38, 1.64, Z1 + 0.005), ws(-0.66, -0.05), ws(0.05, 0.66)]), glass, 'glass');

  // 轮胎、底盘
  const wheels: THREE.BufferGeometry[] = [];
  for (const wx of WHEEL_X)
    for (const sz of [-1, 1])
      wheels.push(
        strip(
          new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.24, 14)
            .rotateX(Math.PI / 2)
            .translate(wx, WHEEL_R, sz * (Z1 - 0.17)),
        ),
      );
  add(merge(wheels), tyre, 'tyres');
  add(merge([box(L - 0.6, BODY_Y - 0.16, D - 0.5, 0, 0.16, 0)]), iron, 'chassis');

  // 前脸两只圆灯（坐在车头两角，朝镜头那只看得见）
  add(
    merge([
      strip(new THREE.SphereGeometry(0.2, 8, 6).translate(L / 2 - 0.05, 1.25, Z1 - 0.14)),
      strip(new THREE.SphereGeometry(0.2, 8, 6).translate(L / 2 - 0.05, 1.25, Z0 + 0.14)),
    ]),
    lamp,
    'lamps',
  );

  // ── 车顶的大咖啡杯招牌 ─────────────────────────────
  const S = { x: -0.35, z: -0.05 };
  const cupY0 = ROOF + 0.2;
  const cupH = 0.66;
  const cupTop = cupY0 + cupH;
  const cupC = new THREE.Vector3(S.x, cupY0 + cupH * 0.55, S.z);
  add(box(0.2, 0.14, 0.2, S.x, ROOF - 0.02, S.z), iron, 'sign-post');
  const saucer = strip(new THREE.CylinderGeometry(0.64, 0.52, 0.08, 18).translate(S.x, cupY0 - 0.04, S.z));
  const cup = blobNormals(
    strip(new THREE.CylinderGeometry(0.5, 0.4, cupH, 18).translate(S.x, cupY0 + cupH / 2, S.z)),
    cupC,
  );
  const handle = strip(new THREE.TorusGeometry(0.2, 0.095, 6, 12).translate(S.x + 0.5, cupY0 + cupH * 0.5, S.z));
  add(merge([saucer, cup, handle]), signM, 'sign-cup');
  const sleeve = blobNormals(
    strip(new THREE.CylinderGeometry(0.474, 0.44, 0.24, 18, 1, true).translate(S.x, cupY0 + cupH * 0.42, S.z)),
    cupC,
  );
  add(sleeve, sleeveM, 'sign-sleeve');
  add(
    strip(new THREE.CircleGeometry(0.41, 18).rotateX(-Math.PI / 2).translate(S.x, cupTop + 0.005, S.z)),
    latte,
    'sign-latte',
  );

  // 热气：三团胖的（⌀ 0.28～0.4），一纹素一纹素地晃
  const puffs = [
    { x: S.x + 0.02, y: cupTop + 0.34, r: 0.25 },
    { x: S.x + 0.27, y: cupTop + 0.72, r: 0.21 },
    { x: S.x + 0.05, y: cupTop + 1.06, r: 0.17 },
  ].map((p, i) => {
    const m = add(strip(new THREE.SphereGeometry(p.r, 8, 6)), steamM, `steam-${i}`);
    m.position.set(p.x, p.y, S.z);
    return { m, ...p };
  });

  // ── 窗台上一排纸杯（存货） ───────────────────────────
  const cupXs = [-0.62, 0.02, -0.92, 0.32, -1.22, 0.62]; // 先没的是两头的
  const cupsM = ctx.mat('clothWhite', face);
  const cups = new THREE.InstancedMesh(strip(new THREE.CylinderGeometry(0.115, 0.09, 0.19, 10)), cupsM, cupXs.length);
  cups.name = 'sill-cups';
  const mtx = new THREE.Matrix4();
  cupXs.forEach((x, i) => {
    cups.setMatrixAt(i, mtx.makeTranslation(x, SILL.y + 0.095, Z1 + 0.14));
  });
  cups.instanceMatrix.needsUpdate = true;
  root.add(cups);

  ctx.mats.prepare(root);
  for (const p of puffs) p.m.castShadow = false;

  const setStock = (k: number) => {
    const kk = Math.min(1, Math.max(0, k));
    cups.count = Math.round(kk * cupXs.length);
    const low = kk < 0.3;
    icons.forEach((m, i) => {
      m.material = low ? grey : iconMats[i];
    });
  };
  setStock(Number(ctx.params.get('stock') ?? 1));

  root.userData.spots = { window: [-0.3, 1.9], vendor: [-0.3, 0.65], back: [-0.8, -1.6] };
  root.userData.floor = FLOOR;
  root.userData.sill = [-0.3, SILL.y, 1.2];
  root.userData.setStock = setStock;
  root.userData.update = (_dt: number, t: number) => {
    puffs.forEach((p, i) => {
      const dx = Math.round(Math.sin(t * 0.9 + i * 1.7) * 1.2) * T;
      const dy = Math.round(Math.sin(t * 1.3 + i * 2.3)) * T;
      p.m.position.set(p.x + dx, p.y + dy, S.z);
    });
  };
  return root;
}
