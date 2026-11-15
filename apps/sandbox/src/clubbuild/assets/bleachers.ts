// bleachers：小看台（2 × 6 格 = 6 × 18 米）。摆在球场长边旁边：rot 0 时座位朝西（−x），玩家按需要转。
// 美术 r1 重画（开罗距离 0.149 米/纹素）：原来 4 级踏面 + 一把把塑料座椅 + 9 幅蓝白条纹棚，侧对镜头读成一根"条纹柱"、强边缘全屏最高。
// 现在是"三条彩色台阶 + 一整片奶油色棚"：
// - 3 级实心台阶（侧板俱乐部蓝 counter，踏面铝灰 steel），每级踏面上一条 0.45 米高的实心座位带（不画单把椅子），
//   一级一个颜色：俱乐部绿（surround）/ 橙（toolOrange）/ 黄（flowerYellow）—— 俯视是三条 ≥ 6 纹素宽的彩色带；
// - 中间一条走道（亮灰白的踏步，aisle）把座位带切成两段；
// - 最上一级后面一道俱乐部蓝的背板；背板上挑出一条奶油色帆布棚（canvas，一块，不分幅，只盖最上一级的后半），前沿一条蓝色垂边。
// - 柱子 0.3 米（2 纹素），不画细栏杆、斜撑。
// 美术 r2：yaw 0 下看台永远是侧面 → 两头各一块 0.25 米厚的锯齿形端墙（按台阶轮廓、高出座位，俱乐部蓝，台阶顶一条陶砖亮唇）：
//   南端那块正对镜头，就是一个清楚的看台剖面；座位带之间只留 1 纹素的深色踏面缝（原来是亮奶油色的踏面 = 强边缘的大头）；
//   有客人时座位上一排排静止的"观众头"（0.32 米的方块，帽子色），满座 / 空座也是经营信息：
//   userData.setOccupancy(k)，k = 0..1（pieces.ts 每帧按"正在这里的客人 / cap"调）。
// 本地原点 = 占地中心；台阶往 +x 升高，座位面朝 −x。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import type { Pal } from '../palette';

type Key = keyof Pal;

/** 几级、每级踏面深、每级高、第一级前沿 x、长度（z）一半 */
const N = 3;
const T = 1.55;
const R = 0.55;
const X0 = -2.75;
const HL = 8.8;
/** 走道半宽（z） */
const AISLE = 0.6;
/** 座位带：高；前沿留 GAP 米的深色踏面缝（≈ 1 纹素） */
const SEAT_H = 0.45;
const GAP = 0.16;
/** 端墙：比座位高出多少、厚 */
const END_UP = SEAT_H + 0.25;
const END_T = 0.25;
/** 观众头的间距、大小、帽子色 */
const HEAD_GAP = 0.62;
const HEAD = 0.34;
const HATS: Key[] = ['clothWhite', 'flowerYellow', 'clothRed', 'straw'];
/** 每级座位带的颜色（俯视三条彩色带） */
const TIER: Key[] = ['surround', 'toolOrange', 'flowerYellow'];

/** 朝镜头 / 朝西的竖直面：光往上偏、档位放宽（太阳在画面后方） */
const FACING: ToonOpts = { lightUp: 0.55, bands: [-0.35, 0.45] };
const PROP: ToonOpts = { lightUp: 0.5, bands: [-0.45, 0.5] };

/** 按材质收几何体（不带索引，只留 position / normal），最后每种材质合并一个网格 */
class Bag {
  m = new Map<string, { key: Key; opts: ToonOpts; geos: THREE.BufferGeometry[]; cast: boolean }>();
  add(key: Key, g: THREE.BufferGeometry, opts: ToonOpts = PROP, tag = '', cast = true) {
    const id = `${key}|${tag}`;
    let e = this.m.get(id);
    if (!e) {
      e = { key, opts, geos: [], cast };
      this.m.set(id, e);
    }
    const n = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal') n.deleteAttribute(a);
    e.geos.push(n);
  }
  build(ctx: AssetCtx, root: THREE.Object3D) {
    for (const [id, e] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), ctx.mat(e.key, e.opts));
      mesh.name = `bleachers:${id}`;
      root.add(mesh);
      ctx.mats.prepare(mesh, { cast: e.cast });
    }
  }
}

/** 第 i 级踏面的前沿 x、顶高 */
const tx = (i: number) => X0 + i * T;
const ty = (i: number) => (i + 1) * R;
/** 最上一级的后沿 */
const XB = tx(N);

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'bleachers';
  const B = new Bag();

  // ── 台阶身子：侧面的台阶轮廓挤出 z 方向（两头的侧板俱乐部蓝，踏面 / 立面铝灰）──
  const sh = new THREE.Shape();
  sh.moveTo(X0, 0);
  for (let i = 0; i < N; i++) {
    sh.lineTo(tx(i), ty(i));
    sh.lineTo(tx(i + 1), ty(i));
  }
  sh.lineTo(XB, 0);
  sh.lineTo(X0, 0);
  const body = new THREE.ExtrudeGeometry(sh, { depth: 2 * HL, bevelEnabled: false }).translate(0, 0, -HL);
  for (const a of Object.keys(body.attributes)) if (a !== 'position' && a !== 'normal') body.deleteAttribute(a);
  const bodyMesh = new THREE.Mesh(body, [
    ctx.mat('counter', { ...FACING, noShadowReceive: true, edge: 0.5, convex: 0.3 }),
    // 踏面、立面：深色铁灰（座位带之间露出的只有 1 纹素，是一道暗缝）
    ctx.mat('ironwork', { ...PROP, edge: 0.3, convex: 0.1 }),
  ]);
  bodyMesh.name = 'bleachers:body';
  root.add(bodyMesh);
  ctx.mats.prepare(bodyMesh);

  // ── 座位带：每级一条实心的色带（走道两边各一段），前面一条深色的"椅子下面"影线由描边给 ──
  const seatD = T - GAP;
  for (let i = 0; i < N; i++) {
    const x = tx(i) + GAP + seatD / 2;
    const len = HL - AISLE - END_T;
    for (const s of [-1, 1]) {
      B.add(
        TIER[i],
        box(seatD, SEAT_H, len, x, ty(i), s * (AISLE + len / 2)),
        { ...PROP, edge: 0.45, convex: 0.35, noShadowReceive: true },
        'seat',
      );
    }
  }

  // ── 走道：每级踏面上一块亮灰白 + 两级之间的踏步（从地面上第一级也有一步）──
  for (let i = 0; i < N; i++) {
    const y0 = i === 0 ? 0 : ty(i - 1);
    B.add('aisle', box(T / 2, R / 2 + 0.005, 2 * AISLE, tx(i) - T / 4, y0, 0), PROP, 'step');
    B.add('aisle', box(T + 0.01, 0.03, 2 * AISLE, tx(i) + T / 2, ty(i), 0), PROP, 'step');
  }

  // ── 两头的锯齿形端墙（按台阶轮廓、比座位高 END_UP）+ 每级台阶顶一条陶砖亮唇 ──
  const prof = new THREE.Shape();
  prof.moveTo(X0 - 0.12, 0);
  prof.lineTo(X0 - 0.12, ty(0) + END_UP);
  for (let i = 0; i < N; i++) {
    prof.lineTo(tx(i + 1), ty(i) + END_UP);
    if (i < N - 1) prof.lineTo(tx(i + 1), ty(i + 1) + END_UP);
  }
  prof.lineTo(XB, ty(N - 1) + END_UP);
  prof.lineTo(XB, 0);
  prof.lineTo(X0 - 0.12, 0);
  for (const zc of [HL - END_T / 2, -HL + END_T / 2]) {
    const g = new THREE.ExtrudeGeometry(prof, { depth: END_T, bevelEnabled: false }).translate(0, 0, zc - END_T / 2);
    B.add('counter', g, { ...FACING, noShadowReceive: true, edge: 0.55, convex: 0.3 }, 'end');
    for (let i = 0; i < N; i++) {
      const x0 = i === 0 ? X0 - 0.12 : tx(i);
      B.add('cap', box(tx(i + 1) - x0, 0.12, END_T + 0.06, (x0 + tx(i + 1)) / 2, ty(i) + END_UP, zc), PROP, 'lip');
    }
  }

  // ── 背板：最上一级后沿，俱乐部蓝，高出 1.3 米 ──
  const topY = ty(N - 1);
  B.add('counter', box(0.25, 1.3 + topY, 2 * HL, XB - 0.125, 0, 0), { ...FACING, edge: 0.5, convex: 0.3 }, 'back');

  // ── 遮阳棚：背板上两根 0.3 米的柱（两头）+ 中间一根，挑出一条奶油色帆布（只盖最上一级的后半，往前斜下），前沿一条蓝垂边 ──
  // 棚子盖得宽的话，俯视会把下面两级的彩色座位带整片挡掉（第一版就是这样）
  const backY = topY + 2.6;
  const front = { x: tx(2) + 0.75, y: topY + 2.2 };
  for (const z of [-HL + 0.3, 0, HL - 0.3]) B.add('metal', box(0.3, backY, 0.3, XB - 0.15, 0, z), PROP, 'post');
  const span = new THREE.Vector2(XB - front.x, backY - front.y);
  const ang = Math.atan2(span.y, span.x);
  const roof = new THREE.BoxGeometry(span.length() + 0.3, 0.1, 2 * HL - 0.1)
    .rotateZ(ang)
    .translate((front.x + XB) / 2, (front.y + backY) / 2, 0);
  B.add('canvas', roof, { lightUp: 0.35, edge: 0.45, convex: 0.2 }, 'roof');
  B.add(
    'canvasStripe',
    box(0.08, 0.35, 2 * HL - 0.1, front.x - 0.12, front.y - 0.42, 0),
    { ...FACING, noShadowReceive: true, edge: 0.4, convex: 0 },
    'valance',
    false,
  );

  B.build(ctx, root);

  // ── 观众头：每级座位带上一排（走道两边），按随机的先后入座；每种帽子色一个网格，按入座人数 setDrawRange ──
  const rnd = ctx.rng(`bleachers:heads:${ctx.variant}`);
  const seats: { x: number; y: number; z: number; rank: number; hat: number }[] = [];
  for (let i = 0; i < N; i++) {
    const x = tx(i) + GAP + (T - GAP) * 0.55;
    const y = ty(i) + SEAT_H;
    const len = HL - AISLE - END_T - 0.2;
    const n = Math.floor(len / HEAD_GAP);
    for (const sd of [-1, 1])
      for (let k = 0; k < n; k++)
        seats.push({ x, y, z: sd * (AISLE + 0.3 + k * HEAD_GAP), rank: rnd(), hat: Math.floor(rnd() * HATS.length) });
  }
  seats.sort((a, b) => a.rank - b.rank);
  seats.forEach((s0, i) => {
    s0.rank = i;
  });
  const per = HATS.map(() => [] as { g: THREE.BufferGeometry; rank: number }[]);
  for (const s0 of seats) {
    const g = new THREE.BoxGeometry(HEAD, HEAD, HEAD).translate(s0.x, s0.y + HEAD / 2 + 0.02, s0.z).toNonIndexed();
    g.deleteAttribute('uv');
    per[s0.hat].push({ g, rank: s0.rank });
  }
  const heads: { mesh: THREE.Mesh; ranks: number[] }[] = [];
  HATS.forEach((key, hi) => {
    const list = per[hi];
    if (!list.length) return;
    const mesh = new THREE.Mesh(
      mergeGeometries(list.map((x) => x.g)),
      ctx.mat(key, { lightUp: 0.6, bands: [-0.45, 0.3], noShadowReceive: true, edge: 0.45, convex: 0.2 }),
    );
    mesh.name = `bleachers:heads:${key}`;
    mesh.geometry.setDrawRange(0, 0);
    root.add(mesh);
    ctx.mats.prepare(mesh, { cast: false });
    heads.push({ mesh, ranks: list.map((x) => x.rank) });
  });
  /** k = 0..1：坐满多少（按入座先后显示前 k × 座位数个头） */
  root.userData.setOccupancy = (k: number) => {
    const n = Math.round(THREE.MathUtils.clamp(k, 0, 1) * seats.length);
    for (const h of heads) {
      let c = 0;
      while (c < h.ranks.length && h.ranks[c] < n) c++;
      h.mesh.geometry.setDrawRange(0, c * 36);
    }
  };
  root.userData.setOccupancy(ctx.params.has('occ') ? Number(ctx.params.get('occ')) : 0);
  return root;
}
