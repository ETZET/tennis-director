// bleachers：小看台（2 × 6 格 = 6 × 18 米）。摆在球场长边旁边：rot 0 时座位朝西（−x），玩家按需要转。
// 美术 r1 重画（开罗距离 0.149 米/纹素）：原来 4 级踏面 + 一把把塑料座椅 + 9 幅蓝白条纹棚，侧对镜头读成一根"条纹柱"、强边缘全屏最高。
// 现在是"三条彩色台阶 + 一整片奶油色棚"：
// - 3 级实心台阶（侧板俱乐部蓝 counter，踏面铝灰 steel），每级踏面上一条 0.45 米高的实心座位带（不画单把椅子），
//   一级一个颜色：俱乐部绿（surround）/ 橙（toolOrange）/ 黄（flowerYellow）—— 俯视是三条 ≥ 6 纹素宽的彩色带；
// - 中间一条走道（亮灰白的踏步，aisle）把座位带切成两段；
// - 最上一级后面一道俱乐部蓝的背板；背板上挑出一条奶油色帆布棚（canvas，一块，不分幅，只盖最上一级的后半），前沿一条蓝色垂边。
// - 柱子 0.3 米（2 纹素），不画细栏杆、斜撑。
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
/** 座位带：深、高 */
const SEAT_D = 0.95;
const SEAT_H = 0.45;
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
    ctx.mat('steel', { ...PROP, edge: 0.4, convex: 0.3 }),
  ]);
  bodyMesh.name = 'bleachers:body';
  root.add(bodyMesh);
  ctx.mats.prepare(bodyMesh);

  // ── 座位带：每级一条实心的色带（走道两边各一段），前面一条深色的"椅子下面"影线由描边给 ──
  for (let i = 0; i < N; i++) {
    const x = tx(i) + 0.25 + SEAT_D / 2;
    const len = HL - AISLE - 0.25;
    for (const s of [-1, 1]) {
      B.add(
        TIER[i],
        box(SEAT_D, SEAT_H, len, x, ty(i), s * (AISLE + len / 2)),
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
  return root;
}
