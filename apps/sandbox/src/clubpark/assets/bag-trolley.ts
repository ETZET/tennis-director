// 球包推车（酒店行李车的球场版）：深蓝地毯底板 + 青铜框、四个胖轮子；北头一个青铜弓形把手（朝镜头的 ∩），
// 车上躺着两个胖网球拍包（前珊瑚红、后俱乐部蓝，各带一道奶油端带），上面再压一个白包；
// 把手前立着一个白色球包（蓝口），口里露三根拍柄。门童把会员的包放上去、推进大门。
//
// userData（本地坐标）：
//   anchors.handle  推车的人站的位置（把手后面，北边）
//   setBags(n)      车上放几个包（0..4：先红、蓝、白躺包，第 4 个是立着的球包）；卸包、装包的演出用
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { box, cyl, merge, xf } from './valet/kit';

/** 底板：宽（x）、长（z）、板面高 */
const DECK = { w: 0.86, d: 1.3, y: 0.3 };
/** 轮子：半径、宽 */
const WHEEL = { r: 0.14, w: 0.09 };
/** 弓形把手：两根立杆（x ±ax）、立杆顶高、弓的半径、管子半径 */
const ARCH = { ax: 0.36, h: 1.55, tube: 0.045 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'bag-trolley';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    g.add(m);
    return m;
  };
  const hw = DECK.w / 2;
  const hd = DECK.d / 2;
  const za = -hd + 0.08;

  // ── 青铜：底板框、弓形把手、前保险杠 ───────────────────
  const t = ARCH.tube;
  const bronze = [
    // 底板四周的框
    box(DECK.w + 0.06, 0.07, 0.06, 0, DECK.y - 0.08, hd),
    box(DECK.w + 0.06, 0.07, 0.06, 0, DECK.y - 0.08, -hd),
    box(0.06, 0.07, DECK.d, -hw, DECK.y - 0.08, 0),
    box(0.06, 0.07, DECK.d, hw, DECK.y - 0.08, 0),
    // 两根立杆
    cyl(t, ARCH.h - DECK.y, 6, -ARCH.ax, DECK.y, za),
    cyl(t, ARCH.h - DECK.y, 6, ARCH.ax, DECK.y, za),
    // 弓：半个圆环（在 x-y 平面，朝镜头）
    xf(new THREE.TorusGeometry(ARCH.ax, t, 5, 10, Math.PI), { x: 0, y: ARCH.h, z: za }),
    // 弓顶下面的一根横杆（挂衣杆）
    xf(new THREE.CylinderGeometry(t * 0.9, t * 0.9, ARCH.ax * 2, 6), { rz: Math.PI / 2, y: ARCH.h - 0.12, z: za }),
  ];
  add(merge(bronze), ctx.mat('steel', { convex: 0.8 }), 'bronze');

  // ── 底板：深蓝地毯（顶面亮着也是深蓝 = 包下面的深色底）──────────
  add(box(DECK.w, 0.05, DECK.d, 0, DECK.y - 0.05, 0), ctx.mat('signBoard', { noShadowReceive: true }), 'carpet');

  // ── 轮子：四个胖轮子（轴沿 x），轮毂一颗铁点 ─────────────────
  const wheels: THREE.BufferGeometry[] = [];
  for (const x of [-hw + 0.06, hw - 0.06])
    for (const z of [-hd + 0.16, hd - 0.16])
      wheels.push(xf(new THREE.CylinderGeometry(WHEEL.r, WHEEL.r, WHEEL.w, 10), { rz: Math.PI / 2, x, y: WHEEL.r, z }));
  add(merge(wheels), ctx.mat('tyre'), 'wheels');
  // 轮子上面的叉架（铁）
  const forks: THREE.BufferGeometry[] = [];
  for (const x of [-hw + 0.06, hw - 0.06])
    for (const z of [-hd + 0.16, hd - 0.16]) forks.push(box(0.12, DECK.y - 0.08 - WHEEL.r, 0.06, x, WHEEL.r, z));
  add(merge(forks), ctx.mat('ironwork'), 'forks');

  // ── 包 ───────────────────────────────────────────────
  // 躺着的拍包：胶囊（沿 x），两头一道奶油端带
  const lying = (r: number, len: number, x: number, y: number, z: number) =>
    xf(new THREE.CapsuleGeometry(r, len - r * 2, 2, 8), { rz: Math.PI / 2, x, y: y + r, z });
  const ends = (r: number, len: number, x: number, y: number, z: number) =>
    [-1, 1].map((s) =>
      xf(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.06, 8), {
        rz: Math.PI / 2,
        x: x + s * (len / 2 - r - 0.02),
        y: y + r,
        z,
      }),
    );
  // 小道具：不接收投影（推车在岗亭、门柱的影子里，包也要读得出颜色）
  const ROUND = { lightUp: 0.25, bands: [0.05, 0.5] as [number, number], noShadowReceive: true };
  const R = 0.2;
  const L = 0.8;
  const bags: THREE.Object3D[] = [];
  const bag = (geo: THREE.BufferGeometry, key: 'clothBlue' | 'clothRed' | 'clothWhite' | 'counter', name: string) => {
    const m = add(geo, ctx.mat(key, ROUND), name);
    return m;
  };
  const stripe = ctx.mat('canvas', { ...ROUND, noShadowReceive: true });
  // 1. 前排：珊瑚红（离镜头最近，最饱和的暖点）
  const b1 = new THREE.Group();
  b1.add(bag(lying(R, L, 0.0, DECK.y, 0.3), 'clothRed', 'bag-red'));
  b1.add(new THREE.Mesh(merge(ends(R, L, 0.0, DECK.y, 0.3)), stripe));
  // 2. 后排：俱乐部蓝
  const b2 = new THREE.Group();
  b2.add(bag(lying(R, L, 0.02, DECK.y, -0.08), 'counter', 'bag-blue'));
  b2.add(new THREE.Mesh(merge(ends(R, L, 0.02, DECK.y, -0.08)), stripe));
  // 3. 压在两包中间上面：白
  const b3 = new THREE.Group();
  b3.add(bag(lying(0.16, 0.72, -0.03, DECK.y + R * 1.5, 0.11), 'clothWhite', 'bag-white'));
  // 4. 立着的球包：白身、蓝口、口里三根拍柄
  const b4 = new THREE.Group();
  const sx = 0.2;
  const sz = za + 0.2;
  b4.add(bag(merge([cyl(0.15, 0.78, 10, sx, DECK.y, sz, 0.14)]), 'clothWhite', 'bag-stand'));
  b4.add(new THREE.Mesh(merge([cyl(0.155, 0.12, 10, sx, DECK.y + 0.78, sz, 0.15)]), ctx.mat('counter', ROUND)));
  const grips = [
    cyl(0.04, 0.3, 6, sx - 0.06, DECK.y + 0.82, sz + 0.02),
    cyl(0.04, 0.24, 6, sx + 0.05, DECK.y + 0.82, sz - 0.03),
    cyl(0.04, 0.34, 6, sx + 0.01, DECK.y + 0.82, sz + 0.07),
  ];
  b4.add(new THREE.Mesh(merge(grips), ctx.mat('ironwork')));
  // 放的顺序：立着的球包先放（在后面），躺包从下往上
  for (const b of [b4, b2, b1, b3]) {
    g.add(b);
    bags.push(b);
  }

  ctx.mats.prepare(g);

  // 顺序：红、蓝、白、立着的（setBags(n) 取前 n 个）
  const order = [b1, b2, b3, b4];
  g.userData.anchors = { handle: new THREE.Vector3(0, 0, -hd - 0.45) };
  g.userData.setBags = (n: number) => {
    order.forEach((b, i) => {
      b.visible = i < n;
    });
  };
  return g;
}
