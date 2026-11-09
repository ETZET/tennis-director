// #4 trailer-burger：银色胶囊拖车（Airstream 的剪影）卖汉堡，停在会所拱廊前（世界 (−42.0, −24.7)，rotY 0.22）。
// 尺寸：长 6.4（x：车身 −3.2…2.5 + 东头拖杆到 3.2）× 深 2.4（z）× 车身高 2.6；车顶东头的汉堡招牌顶到 ≈ 3.4。车地板 y 0.7。
// 三角形 ≈ 2.7k（含 5 只存货小汉堡）。
// 车身是参数曲面：横截面 = 上半圆拱（超椭圆 n 2.4）+ 下半方一点（n 5），两头按 (1 − t^2.2)^(1/2.2) 收成圆头圆尾；
// 法线按曲面算 → 车顶亮、肩和腰中档、底下的圆角暗。竖向铝皮接缝 = planks 元素（每 0.62 米一条 1 纹素缝）。
// 南面一扇大翻板窗（x −0.95…1.45、y 1.32…2.5，上沿开到车顶肩上），翻板从窗上沿往外往上撑 26°、0.85 深
// （45° 俯视下只看得到翻板的顶面 → 顶面 = accBurger 亮档，朝天朝太阳；下面一层银）。
// 窗里是暗档的酸黄瓜绿 + 一条暗档不锈钢的后操作台（不黑）；窗下一条不锈钢服务台，台上一排小汉堡（存货）。
// 车顶东头一只立体汉堡招牌（上下面包 bun、生菜 accBurger 波浪边、肉饼 wood；不写字）。
// 一条 accBurger 腰线 + 窗两边的绿框（复古小餐馆）；西半一扇圆角小玻璃窗；东头 A 字拖杆、挂钩、千斤顶；南面一对轮子。
//
// userData（本地坐标，米；物体在场景里转 0.22，用 localToWorld 换算）：
//   spots = { window: [0.25, 2.05], vendor: [0.25, 0.9], back: [−1.9, −1.85] }
//     window = 点餐客人站的地面点（服务台前沿 z 1.5 往外 0.55）；
//     vendor = 摊主在车里站的点（y = floor）。窗口上沿在车顶肩上（z ≈ 0.6），摊主站在窗面后 0.3：头不顶翻板、脸在翻板下沿露出来；
//     back = 北面车门外的地面点（补货；门口一级台阶在 (−1.9, −1.3)）
//   floor = 0.7；sill = [0.25, 1.32, 1.33]（服务台顶面中心）
//   setStock(k)：0..1，服务台上的小汉堡 ceil(5k) 只；k < 0.3 只剩 1 只（k ≤ 0.05 没有）。默认 1（画廊 &stock=0.2）。
// 变体：只有 v0。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

// ── 车身的形状 ─────────────────────────────────────────────
const XB0 = -3.2; // 车身西头（圆尾）
const XB1 = 2.5; // 车身东头（圆头，拖杆这一头）
const XC = (XB0 + XB1) / 2;
const HL = (XB1 - XB0) / 2;
const RE = 1.05; // 两头收圆的长度
const Y0 = 1.42; // 横截面中心高
const A = 1.2; // 半宽
const BU = 1.18; // 上半高（车顶 2.6）
const BL = 0.85; // 下半高（车底 0.57）
const NU = 2.4;
const NL = 5;
const FLOOR = 0.7;
// 翻板窗
const WX0 = -0.95;
const WX1 = 1.45;
const WY0 = 1.32;
const WY1 = 2.5; // 窗上沿开到车顶肩上：摊主的头（顶 ≈ 2.5）不顶翻板
const FLAP_A = (26 * Math.PI) / 180;
const FLAP_D = 0.85;

const sgnpow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 两头收圆的比例 0..1 */
function endScale(x: number): number {
  const t = clamp((Math.abs(x - XC) - (HL - RE)) / RE, 0, 1);
  return (1 - t ** 2.2) ** (1 / 2.2);
}

/** 曲面上的点：x 沿车长，φ 绕横截面（0 = 南面 +z，π/2 = 车顶，π = 北面，−π/2 = 车底） */
function surf(x: number, phi: number, out = new THREE.Vector3()): THREE.Vector3 {
  const s = endScale(x);
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const up = sn >= 0;
  const n = up ? NU : NL;
  const z = A * s * sgnpow(c, 2 / n);
  const y = Y0 + (up ? BU * s : BL * Math.sqrt(s)) * sgnpow(sn, 2 / n);
  return out.set(x, y, z);
}

/** 横截面上高 y 的那一点的 φ（south = true：南面那一侧） */
function phiAt(y: number, south = true): number {
  const yp = y - Y0;
  const up = yp >= 0;
  const b = up ? BU : BL;
  const n = up ? NU : NL;
  const sn = Math.sign(yp) * Math.min(1, Math.abs(yp) / b) ** (n / 2);
  const p = Math.asin(sn);
  return south ? p : Math.PI - p;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
/** 曲面法线（数值求导；圆头的尖点上退回"离中轴的方向"） */
function surfNormal(x: number, phi: number, out = new THREE.Vector3()): THREE.Vector3 {
  const h = 1e-3;
  surf(x + h, phi, _a).sub(surf(x - h, phi, _b));
  surf(x, phi + h, _c).sub(surf(x, phi - h, _d));
  out.crossVectors(_a, _c);
  const p = surf(x, phi, _b);
  const cx = clamp(x, XC - (HL - RE), XC + (HL - RE));
  _d.set(p.x - cx, p.y - Y0, p.z);
  if (out.lengthSq() < 1e-12) return out.copy(_d).normalize();
  out.normalize();
  if (out.dot(_d) < 0) out.negate();
  return out;
}

/** 曲面的一块（xs × phis 的网格），沿法线往外挪 off；skip(i, j) = 不要这一格（窗洞） */
function patch(xs: number[], phis: number[], off: number, skip?: (i: number, j: number) => boolean) {
  const pos: number[] = [];
  const nor: number[] = [];
  const P = (i: number, j: number) => {
    const n = surfNormal(xs[i], phis[j]);
    const p = surf(xs[i], phis[j]).addScaledVector(n, off);
    return { p, n };
  };
  const grid = xs.map((_, i) => phis.map((_, j) => P(i, j)));
  const tri = (a: { p: THREE.Vector3; n: THREE.Vector3 }, b: typeof a, c: typeof a) => {
    // 朝外的绕序：面法线和顶点法线同向
    const fn = _a.subVectors(b.p, a.p).cross(_b.subVectors(c.p, a.p));
    const avg = _c.copy(a.n).add(b.n).add(c.n);
    if (fn.lengthSq() < 1e-14) return;
    const vs = fn.dot(avg) >= 0 ? [a, b, c] : [a, c, b];
    for (const v of vs) {
      pos.push(v.p.x, v.p.y, v.p.z);
      nor.push(v.n.x, v.n.y, v.n.z);
    }
  };
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < phis.length - 1; j++) {
      if (skip?.(i, j)) continue;
      const a = grid[i][j];
      const b = grid[i + 1][j];
      const c = grid[i + 1][j + 1];
      const d = grid[i][j + 1];
      tri(a, b, c);
      tri(a, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** 合并前统一成"非索引 + 只有 position/normal" */
function pn(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
  return o;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  pn(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));

/** 从 a 到 b 的方条（截面 w × w） */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, w, len);
  const m = new THREE.Matrix4().lookAt(b, a, new THREE.Vector3(0, 1, 0));
  g.applyMatrix4(m);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return pn(g);
}

/** 平面四边形（a b c d 逆时针看是正面） */
function quad4(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): THREE.BufferGeometry {
  const n = _a.subVectors(b, a).cross(_b.subVectors(c, a)).normalize();
  const pos = [a, b, c, a, c, d].flatMap((v) => [v.x, v.y, v.z]);
  const nor = new Array(6).fill(0).flatMap(() => [n.x, n.y, n.z]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'trailer-burger';

  // 朝镜头的竖直面在暗档：lightUp + 低 bands 留住中档（车身、腰线、轮、招牌）
  const SIDE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  // 车身：亮档只留车顶（肩膀落中档）→ 亮顶、中腰、暗底三档分开，读成弯的金属而不是一块白泥
  const mBody = ctx.mat('carSilver', {
    ...SIDE,
    bands: [-0.3, 0.52],
    convex: 0.3,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.62], seam: 1, hi: 0 },
  });
  const mSilver = ctx.mat('carSilver', { ...SIDE, convex: 0.3 });
  const mAcc = ctx.mat('accBurger', { ...SIDE, convex: 0.2 });
  const mFlap = ctx.mat('accBurger', {
    noShadowReceive: true,
    convex: 0.2,
    elem: { kind: 'paint', space: 'local', size: [9, 6], density: [0, 0] },
  });
  const mGlass = ctx.mat('glass', { bands: [-2, 3], noShadowReceive: true, convex: 0.2 }); // 一律中档
  // 窗里：一律暗档（bands 推到 2 以上），不接投影 —— 暗绿，不黑
  const mInGreen = ctx.mat('accBurger', { bands: [2, 3], noShadowReceive: true, edge: 0.3, convex: 0 });
  const mInSilver = ctx.mat('carSilver', { bands: [2, 3], noShadowReceive: true, edge: 0.3, convex: 0.2 });
  const mTyre = ctx.mat('tyre', { ...SIDE, convex: 0.2 });
  const mIron = ctx.mat('ironwork', { convex: 0.3 });
  const mBun = ctx.mat('bun', { ...SIDE, convex: 0.3 });
  const mPatty = ctx.mat('wood', { ...SIDE, convex: 0.2 });

  const geos = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const l = geos.get(m) ?? [];
    l.push(pn(g));
    geos.set(m, l);
  };

  // ── 车身曲面（窗洞挖掉）──────────────────────────────────
  const endT = [0, 0.3, 0.52, 0.7, 0.83, 0.92, 0.97, 1];
  const xs = new Set<number>();
  for (const t of endT) {
    xs.add(+(XC - (HL - RE) - t * RE).toFixed(4));
    xs.add(+(XC + (HL - RE) + t * RE).toFixed(4));
  }
  const xMid0 = XC - (HL - RE);
  const xMid1 = XC + (HL - RE);
  for (let x = xMid0; x < xMid1; x += 0.5) xs.add(+x.toFixed(4));
  xs.add(WX0);
  xs.add(WX1);
  const xsArr = [...xs].sort((a, b) => a - b);
  const pBot = phiAt(WY0);
  const pTop = phiAt(WY1);
  const phis = new Set<number>();
  const NP = 30;
  for (let k = 0; k <= NP; k++) phis.add(+(-Math.PI / 2 + (k / NP) * 2 * Math.PI).toFixed(5));
  phis.add(pBot);
  phis.add(pTop);
  const phArr = [...phis].sort((a, b) => a - b);
  add(
    mBody,
    patch(
      xsArr,
      phArr,
      0,
      (i, j) =>
        xsArr[i] >= WX0 - 1e-6 && xsArr[i + 1] <= WX1 + 1e-6 && phArr[j] >= pBot - 1e-6 && phArr[j + 1] <= pTop + 1e-6,
    ),
  );

  // ── 腰线（accBurger，一圈；两头跟着收成尖）+ 窗两边的绿框 ─────────────
  // 贴在车身外面的一层：顶点要包含车身网格在这段里的所有 φ / x（弦平行 → 不会被车身顶点戳穿）
  const OFF = 0.014;
  const inPh = (a: number, b: number) => [a, ...phArr.filter((q) => q > a + 1e-4 && q < b - 1e-4), b];
  const inX = (a: number, b: number) => [a, ...xsArr.filter((q) => q > a + 1e-4 && q < b - 1e-4), b];
  const sLo = phiAt(0.95);
  const sHi = phiAt(1.2);
  add(mAcc, patch(xsArr, inPh(sLo, sHi), OFF));
  add(mAcc, patch(xsArr, inPh(Math.PI - sHi, Math.PI - sLo), OFF));
  const tPh = inPh(pBot, phiAt(WY1 + 0.06));
  add(mAcc, patch(inX(WX0 - 0.13, WX0), tPh, OFF));
  add(mAcc, patch(inX(WX1, WX1 + 0.13), tPh, OFF));

  // ── 西半一扇小玻璃窗（圆角窗的意思：四角各切掉一格）──────────────
  {
    // 中间一块 + 上下各一条短一纹素的（四角缺一格 = 圆角）
    const g0 = phiAt(1.66);
    const g1 = phiAt(1.75);
    const g2 = phiAt(2.03);
    const g3 = phiAt(2.12);
    add(mGlass, patch(inX(-2.5, -1.61), inPh(g1, g2), OFF));
    add(mGlass, patch(inX(-2.41, -1.7), inPh(g0, g1), OFF));
    add(mGlass, patch(inX(-2.41, -1.7), inPh(g2, g3), OFF));
  }

  // ── 窗里（暗档的绿；不黑）─────────────────────────────────
  const zIn = -0.95;
  const zOut = 1.1;
  add(mInGreen, quad4(V(WX0, FLOOR, zIn), V(WX0, FLOOR, zOut), V(WX1, FLOOR, zOut), V(WX1, FLOOR, zIn))); // 地板（朝上）
  // 后墙顶 = 车顶内侧在 z = zIn 的高度（再低 5 厘米，不戳出车顶）
  const pN = Math.acos(-((-zIn / A) ** (NU / 2)));
  const yBack = surf(0, pN).y - 0.05;
  add(mInGreen, quad4(V(WX0, FLOOR, zIn), V(WX1, FLOOR, zIn), V(WX1, yBack, zIn), V(WX0, yBack, zIn))); // 后墙（朝南）
  // 两侧墙：横截面（内缩 4%）从窗下沿绕过车顶到后墙，扇形三角化（凸多边形）
  {
    const prof: [number, number][] = [
      [zIn, FLOOR],
      [zOut, FLOOR],
      [zOut, WY0],
    ];
    for (let k = 0; k <= 12; k++) {
      const q = surf(0, pBot + ((pN - pBot) * k) / 12);
      prof.push([q.z * 0.96, Y0 + (q.y - Y0) * 0.96]);
    }
    prof.push([zIn, yBack]);
    const cz = prof.reduce((a, q) => a + q[0], 0) / prof.length;
    const cy = prof.reduce((a, q) => a + q[1], 0) / prof.length;
    for (const [x, sx] of [
      [WX0, 1],
      [WX1, -1],
    ] as const) {
      const pos: number[] = [];
      const nor: number[] = [];
      for (let k = 0; k < prof.length; k++) {
        const a = prof[k];
        const b = prof[(k + 1) % prof.length];
        // 正面朝 +x（西墙）或 −x（东墙）
        const tri = sx > 0 ? [[cz, cy], b, a] : [[cz, cy], a, b];
        for (const [z, y] of tri) {
          pos.push(x, y, z);
          nor.push(sx, 0, 0);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      add(mInGreen, g);
    }
  }
  // 后面一条操作台（扒炉）：暗档的不锈钢
  add(mInSilver, box(WX1 - WX0 - 0.1, 0.3, 0.55, (WX0 + WX1) / 2, FLOOR, zIn + 0.28));

  // ── 服务台 + 翻板 ────────────────────────────────────────
  const zSkin = surf(0, pBot).z; // ≈ 1.2
  const cz0 = zSkin - 0.05;
  const cz1 = zSkin + 0.3;
  const cTop = WY0 + 0.0;
  add(mSilver, box(WX1 - WX0 + 0.3, 0.08, cz1 - cz0, (WX0 + WX1) / 2, cTop - 0.08, (cz0 + cz1) / 2));
  // 台下两只三角撑（1 纹素宽）
  for (const x of [WX0 + 0.15, WX1 - 0.15])
    add(mSilver, beam(V(x, cTop - 0.42, zSkin - 0.02), V(x, cTop - 0.06, cz1 - 0.06), 0.08));
  // 翻板：铰链在窗上沿，往外往上撑 FLAP_A；顶面绿（亮档），下面一层银
  {
    const hz = surf(0, pTop).z;
    const hy = WY1;
    const w = WX1 - WX0 + 0.2;
    const cx = (WX0 + WX1) / 2;
    const top = new THREE.BoxGeometry(w, 0.035, FLAP_D).translate(0, 0.0175, FLAP_D / 2);
    const bot = new THREE.BoxGeometry(w, 0.04, FLAP_D).translate(0, -0.02, FLAP_D / 2);
    for (const g of [top, bot]) g.rotateX(-FLAP_A).translate(cx, hy + 0.02, hz);
    add(mFlap, top);
    add(mSilver, bot);
    // 两根撑杆：窗边框 → 翻板外沿下面
    const ez = hz + FLAP_D * Math.cos(FLAP_A) * 0.8;
    const ey = hy + FLAP_D * Math.sin(FLAP_A) * 0.8;
    for (const x of [WX0 - 0.06, WX1 + 0.06])
      add(mSilver, beam(V(x, 1.75, surf(0, phiAt(1.75)).z + 0.03), V(x, ey - 0.02, ez), 0.08));
  }

  // ── 车顶的汉堡招牌（车顶东头（西半在场景里被会所塔楼挡住）；翻板不接投影）────────────────
  {
    const bx = 1.75;
    const by = Y0 + BU - 0.04;
    add(mSilver, box(0.56, 0.1, 0.44, bx, by - 0.02, 0));
    const R = 0.5;
    const yb = by + 0.08;
    add(mBun, new THREE.CylinderGeometry(R, R - 0.06, 0.2, 18).translate(bx, yb + 0.1, 0)); // 下面包
    add(mPatty, new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.2, 18).translate(bx, yb + 0.3, 0)); // 肉饼
    // 生菜：一圈波浪边的薄片，比肉饼宽出 0.08
    {
      const g = new THREE.CylinderGeometry(R + 0.1, R + 0.06, 0.08, 24);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const r = Math.hypot(x, z);
        if (r < 1e-4) continue;
        const a = Math.atan2(z, x);
        const k = 1 + 0.06 * Math.cos(a * 8);
        p.setXYZ(i, x * k, p.getY(i), z * k);
      }
      g.computeVertexNormals();
      add(mAcc, g.translate(bx, yb + 0.44, 0));
    }
    // 上面包：半个扁球
    add(
      mBun,
      new THREE.SphereGeometry(R + 0.02, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(1, 0.72, 1)
        .translate(bx, yb + 0.48, 0),
    );
  }

  // ── 轮子（南面一对；北面那对藏在车身和车影里，不画）──────────────────
  for (const x of [XC - 0.4, XC + 0.4]) {
    add(mTyre, new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14).rotateX(Math.PI / 2).translate(x, 0.34, 1.0));
    add(mSilver, new THREE.CylinderGeometry(0.15, 0.15, 0.24, 8).rotateX(Math.PI / 2).translate(x, 0.34, 1.0));
  }

  // ── 东头：A 字拖杆、千斤顶 ─────────────────────────
  {
    const cpl = V(3.15, 0.5, 0);
    for (const z of [-0.5, 0.5]) add(mIron, beam(V(XB1 - 0.25, 0.62, z), cpl, 0.12));
    add(mIron, box(0.22, 0.1, 0.18, 3.12, 0.46, 0)); // 挂钩头
    add(mIron, box(0.11, 0.62, 0.11, 2.88, 0.02, 0)); // 千斤顶
    add(mIron, box(0.27, 0.04, 0.27, 2.88, 0, 0)); // 底板
    add(mIron, box(0.09, 0.09, 0.27, 2.88, 0.62, 0.1)); // 摇把
  }

  // ── 北面车门外的台阶（补货从这里上）─────────────────────────
  add(mSilver, box(0.62, 0.36, 0.36, -1.9, 0, -1.3));

  for (const [m, list] of geos) root.add(new THREE.Mesh(mergeGeometries(list), m));

  // ── 服务台上的小汉堡（存货，instanced）──────────────────────────
  const N_STOCK = 5;
  const mini = mergeGeometries([
    pn(new THREE.CylinderGeometry(0.14, 0.12, 0.07, 8, 1, true).translate(0, 0.035, 0)),
    pn(new THREE.SphereGeometry(0.145, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.07, 0)),
  ]);
  const stock = new THREE.InstancedMesh(mini, mBun, N_STOCK);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < N_STOCK; i++) {
    const x = WX0 + 0.3 + i * ((WX1 - WX0 - 0.6) / (N_STOCK - 1));
    mtx.makeTranslation(x, cTop, zSkin + 0.1);
    stock.setMatrixAt(i, mtx);
  }
  root.add(stock);

  const setStock = (k: number) => {
    const kk = clamp(k, 0, 1);
    stock.count = kk < 0.3 ? (kk > 0.05 ? 1 : 0) : Math.ceil(kk * N_STOCK);
    stock.visible = stock.count > 0;
  };
  setStock(ctx.params.has('stock') ? Number(ctx.params.get('stock')) : 1); // 画廊里 &stock=0.2 看缺货

  const cx = +((WX0 + WX1) / 2).toFixed(2);
  root.userData.spots = {
    window: [cx, +(cz1 + 0.55).toFixed(2)],
    vendor: [cx, +(zSkin - 0.3).toFixed(2)],
    back: [-1.9, -1.85],
  };
  root.userData.floor = FLOOR;
  root.userData.sill = [cx, cTop, +((cz0 + cz1) / 2).toFixed(2)];
  root.userData.setStock = setStock;

  ctx.mats.prepare(root);
  return root;
}
