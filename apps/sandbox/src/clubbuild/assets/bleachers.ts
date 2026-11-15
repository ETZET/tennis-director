// bleachers：小看台（2 × 6 格 = 6 × 18 米）。摆在球场长边旁边：rot 0 时座位朝西（−x），玩家按需要转。
// 4 级铝看台（实心的台阶身子：踏面 steel（午后的暖光下偏暖灰，读成木 / 铝）、两头的台阶侧板俱乐部蓝）+ 每级一排塑料座椅（大多俱乐部绿，零星几把橙、黄、红、蓝），
// 中间一条走道（亮灰白的踏步），最上一级后面一道护栏；后面四根钢柱挑出一片往前斜的蓝白条纹遮阳棚，只盖住最上一级
// （45° 俯视下棚子会挡住它底下的座位：下面三级整排露着，彩色座位才看得见）。
// 没有现成的看台能用（clubstadium 的看台是按那个场景的世界坐标建的马蹄形），整件新画；颜色全用表里现成的材质。
// 本地原点 = 占地中心；台阶往 +x 升高，座位面朝 −x。三角形 ≈ 3.5k（座椅占大头，每把两个盒子）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import type { Pal } from '../palette';

type Key = keyof Pal;

/** 几级、每级踏面深、每级高、第一级前沿 x、长度（z）一半 */
const N = 4;
const T = 0.95;
const R = 0.42;
const X0 = -2.6;
const HL = 8.8;
/** 走道半宽（z） */
const AISLE = 0.55;
/** 座位：间距、宽、深、座面高（离踏面） */
const SEAT = { pitch: 0.52, w: 0.42, d: 0.4, h: 0.4, backH: 0.38, backT: 0.07 };

/** 朝镜头的竖直面 / 道具：光往上偏、档位放宽（太阳在画面后方） */
const FACING = { lightUp: 0.55, bands: [-0.35, 0.45] as [number, number] };
const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number] };
/** 座椅：小道具不接投影（转到朝镜头时，座位正面落在上一级和棚子的影子里会是一排暗块，看不出颜色） */
const SEAT_M = { ...PROP, noShadowReceive: true };

/** 按材质收几何体（不带索引，只留 position / normal），最后每种材质合并一个网格 */
class Bag {
  m = new Map<string, { key: Key; opts: object; geos: THREE.BufferGeometry[]; cast: boolean }>();
  add(key: Key, g: THREE.BufferGeometry, opts: object = PROP, tag = '', cast = true) {
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
  const rnd = ctx.rng(`bleachers:${ctx.variant}`);
  const B = new Bag();

  // ── 台阶身子：侧面的台阶轮廓挤出 z 方向（一个网格两个材质：两头的侧板俱乐部蓝，踏面 / 立面铝灰）──
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
    ctx.mat('steel', { ...PROP, edge: 0.4, convex: 0.3, elem: { kind: 'paint', size: [14, 6], density: [0, 0.03] } }),
  ]);
  bodyMesh.name = 'bleachers:body';
  root.add(bodyMesh);
  ctx.mats.prepare(bodyMesh);

  // ── 走道：每级踏面上一块亮灰白 + 两级之间半级的踏步（从地面上第一级也有一步）──
  for (let i = 0; i < N; i++) {
    const y0 = i === 0 ? 0 : ty(i - 1);
    B.add('aisle', box(T / 2, R / 2 + 0.005, 2 * AISLE, tx(i) - T / 4, y0, 0), PROP, 'step');
    B.add('aisle', box(T + 0.01, 0.02, 2 * AISLE, tx(i) + T / 2, ty(i), 0), PROP, 'step');
  }

  // ── 座椅：每级一排，走道两边各一段；大多俱乐部绿，零星彩色（两三把连着）──
  const accents: Key[] = ['accCushion', 'flowerYellow', 'clothRed', 'counter'];
  for (let i = 0; i < N; i++) {
    const y = ty(i);
    const xs = tx(i) + 0.42; // 座面中心
    let run = 0;
    let runKey: Key = 'seat';
    for (const side of [-1, 1]) {
      const n = Math.floor((HL - AISLE - 0.15) / SEAT.pitch);
      for (let k = 0; k < n; k++) {
        const z = side * (AISLE + 0.12 + SEAT.pitch * (k + 0.5));
        if (run <= 0) {
          runKey = rnd() < 0.3 ? accents[Math.floor(rnd() * accents.length)] : 'seat';
          run = runKey === 'seat' ? 2 + Math.floor(rnd() * 5) : 1 + Math.floor(rnd() * 3);
        }
        run--;
        // 座面（实心一块到踏面：塑料座的底座）+ 靠背（座面后沿）
        B.add(runKey, box(SEAT.d, SEAT.h, SEAT.w, xs, y, z), SEAT_M, 'seat');
        B.add(
          runKey,
          box(SEAT.backT, SEAT.backH, SEAT.w, xs + SEAT.d / 2 - SEAT.backT / 2, y + SEAT.h, z),
          SEAT_M,
          'seat',
        );
      }
    }
  }

  // ── 护栏：最上一级后沿，柱 + 两道横杆 ──
  const topY = ty(N - 1);
  const rx = XB - 0.06;
  for (let k = 0; k <= 6; k++) B.add('metal', box(0.08, 1.0, 0.08, rx, topY, -HL + 0.1 + (k * (2 * HL - 0.2)) / 6));
  for (const h of [0.5, 0.96]) B.add('metal', box(0.07, 0.07, 2 * HL - 0.1, rx, topY + h, 0));
  // 两头的扶手（侧板上面一道）
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(X0 + 0.1, R + 0.9, s * (HL - 0.05));
    const b = new THREE.Vector3(XB - 0.1, topY + 0.96, s * (HL - 0.05));
    B.add('metal', rod(a, b, 0.07));
  }

  // ── 遮阳棚：四根钢柱（看台背后）挑出一片往前（−x）斜下的条纹棚，只盖住最上一级 ──
  const PX = 2.55;
  const front = { x: tx(3) + 0.05, y: 3.6 };
  const backE = { x: 2.8, y: 4.1 };
  for (const z of [-HL + 0.4, -2.9, 2.9, HL - 0.4]) {
    B.add('metal', box(0.2, backE.y, 0.2, PX, 0, z), PROP, 'post');
    // 挑梁：柱顶往前斜下到棚前沿
    B.add(
      'metal',
      rod(new THREE.Vector3(PX, backE.y, z), new THREE.Vector3(front.x, front.y - 0.08, z), 0.12),
      PROP,
      'post',
    );
    // 斜撑：柱子半腰到挑梁中段
    B.add(
      'metal',
      rod(
        new THREE.Vector3(PX, backE.y - 1.4, z),
        new THREE.Vector3((PX + front.x) / 2, (backE.y + front.y) / 2 - 0.05, z),
        0.08,
      ),
      PROP,
      'post',
    );
  }
  // 棚面：沿 z 每幅 ≈ 1.9 米，白 / 俱乐部蓝轮着（奶白的 canvas 和沙地一个颜色，换成更白的 clothWhite）（一幅一个盒子，薄 0.06）
  const span = new THREE.Vector2(backE.x - front.x, backE.y - front.y);
  const ang = Math.atan2(span.y, span.x);
  const len = span.length();
  const nPanel = 9;
  const pw = (2 * HL - 0.2) / nPanel;
  for (let k = 0; k < nPanel; k++) {
    const z = -HL + 0.1 + pw * (k + 0.5);
    const g = new THREE.BoxGeometry(len, 0.06, pw)
      .rotateZ(ang)
      .translate((front.x + backE.x) / 2, (front.y + backE.y) / 2, z);
    B.add(k % 2 ? 'canvasStripe' : 'clothWhite', g, { lightUp: 0.35, edge: 0.4, convex: 0.2 }, 'roof');
  }
  // 棚前沿一道垂边（奶白，一行亮）
  B.add(
    'canvas',
    box(0.04, 0.22, 2 * HL - 0.2, front.x - 0.02, front.y - 0.24, 0),
    { ...FACING, edge: 0.3, convex: 0 },
    'valance',
    false,
  );

  B.build(ctx, root);
  return root;
}

/** 两点之间的一根方杆（粗 t） */
function rod(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, d.length(), t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}
