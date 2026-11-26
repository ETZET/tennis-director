// shuttle：俱乐部的接驳小巴，停在马路上，长边沿 x（车头朝东 +x），朝镜头那面（+z）是车的右侧：一排车窗、前门、两个胖轮子。
// 尺寸 9.99（111 纹素）× 3.0 × 2.6 米。车顶是画面里最大的一块（俯视 45°），只放一个低矮的空调罩，其余整块安静。
// 侧面自下而上按屏幕行（竖直 1 行 = 0.127 米）排：车底暗影 → 奶白下裙 4 行 → 俱乐部蓝腰线 3 行 → 奶白细线 1 行 →
// 车窗 6 行（12 纹素一扇、2 纹素窗柱）→ 奶白上围 5 行 → 车顶一道斜肩（亮档，接车顶）。
// 轮拱按纹素列 × 屏幕行取整（像素台阶，不是多边形的斜边），拱里是暗的轮罩，轮子半径 0.5（11 纹素宽）+ 银色轮毂。
// 材质：车身 stucco（奶白，朝镜头的侧面落中档）、腰线 counter（俱乐部蓝）、车窗/车门 glass（中档 = 深灰蓝）、
// 轮胎/车底/轮罩 tyre、轮毂/空调罩 carSilver、后视镜 ironwork。一种材质一个网格。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
/** 竖直方向 1 个屏幕行（设计纹素下）对应的米数 */
const ROW = T / Math.SQRT1_2;
const NX = 111;
const L = NX * T;
const D = 2.6;
const ZF = D / 2;
/** 车身底沿（车底离地） */
const Y0 = 0.38;
const yr = (k: number) => Y0 + k * ROW;
const xt = (i: number) => -L / 2 + i * T;
/** 车身各段（屏幕行）：下裙、腰线、细线、车窗、上围 */
const R_BAND = 4;
const R_LINE = 7;
const R_WIN = 8;
const R_TOP = 14;
const R_ROOF = 19;
const ROOF_Y = 3.0;
/** 轮子：中心的纹素列、半径、轮拱半径 */
const WHEELS = [22, 86];
const WR = 0.5;
const ARCH = 0.64;

function box(x0: number, x1: number, y0: number, y1: number, z0 = -ZF, z1 = ZF): THREE.BufferGeometry {
  return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
    .translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    .toNonIndexed();
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error('shuttle: merge failed');
  return g;
}

/** 朝镜头的竖面（太阳在画面后方）：光往上偏、档位阈值往下挪 → 侧面中档、车顶亮档、不全黑 */
const FACE = { lightUp: 0.5, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'shuttle';
  const cream: THREE.BufferGeometry[] = [];
  const blue: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const well: THREE.BufferGeometry[] = [];
  const top: THREE.BufferGeometry[] = [];
  const silver: THREE.BufferGeometry[] = [];
  const iron: THREE.BufferGeometry[] = [];

  // ── 下裙 + 腰线：轮拱处按纹素列切，拱顶按屏幕行取整 ──
  /** 第 i 列（纹素）的拱底在第几行（0 = 没有拱） */
  const archRow = (i: number): number => {
    const xm = xt(i + 0.5);
    for (const w of WHEELS) {
      const dx = xm - xt(w);
      if (Math.abs(dx) < ARCH) {
        const h = WR + Math.sqrt(ARCH * ARCH - dx * dx);
        return Math.max(0, Math.ceil((h - Y0) / ROW - 0.15));
      }
    }
    return 0;
  };
  const DOOR = [99, 108];
  let run = 0;
  for (let i = 0; i <= NX; i++) {
    const a = i < NX ? archRow(i) : -1;
    const prev = i > 0 ? archRow(i - 1) : -1;
    if (i === NX || a !== prev || i === DOOR[0] || i === DOOR[1]) {
      // 合并相同拱高的一段列
      if (i > run) {
        const k = archRow(run);
        const inDoor = run >= DOOR[0] && run < DOOR[1];
        if (!inDoor) {
          if (k < R_BAND) cream.push(box(xt(run), xt(i), yr(k), yr(R_BAND)));
          blue.push(box(xt(run), xt(i), yr(Math.max(k, R_BAND)), yr(R_LINE)));
        }
      }
      run = i;
    }
  }
  // 奶白细线（门那段也有：门的横档）+ 上围
  cream.push(box(xt(0), xt(NX), yr(R_LINE), yr(R_WIN)));
  cream.push(box(xt(0), xt(NX), yr(R_TOP), yr(R_ROOF)));

  // ── 车窗一排：车尾 5 纹素，6 扇 12 纹素的窗 + 2 纹素窗柱，再一扇 8 纹素的小窗，前门，车头 3 纹素 ──
  const wins: [number, number][] = [];
  for (let k = 0; k < 6; k++) wins.push([5 + k * 14, 17 + k * 14]);
  wins.push([89, 97]);
  let x = 0;
  for (const [a, b] of wins) {
    cream.push(box(xt(x), xt(a), yr(R_WIN), yr(R_TOP)));
    glass.push(box(xt(a), xt(b), yr(R_WIN), yr(R_TOP)));
    x = b;
  }
  cream.push(box(xt(x), xt(DOOR[0]), yr(R_WIN), yr(R_TOP)));
  cream.push(box(xt(DOOR[1]), xt(NX), yr(R_WIN), yr(R_TOP)));
  // 前门：两扇玻璃（各 4 纹素）夹 1 纹素门缝，最下一行是踏步（暗）；门的横档就是上面那条奶白细线
  const dm = DOOR[0] + 4;
  well.push(box(xt(DOOR[0]), xt(DOOR[1]), yr(0), yr(1)));
  for (const [r0, r1] of [
    [1, R_LINE],
    [R_WIN, R_TOP],
  ]) {
    glass.push(box(xt(DOOR[0]), xt(dm), yr(r0), yr(r1)));
    cream.push(box(xt(dm), xt(dm + 1), yr(r0), yr(r1)));
    glass.push(box(xt(dm + 1), xt(DOOR[1]), yr(r0), yr(r1)));
  }

  // ── 车顶：一道斜肩（前后各 0.18 米）+ 平顶；空调罩一块低矮的银灰 ──
  const yTop = yr(R_ROOF);
  const shoulder = 0.18;
  const sh = new THREE.Shape();
  sh.moveTo(-ZF, 0);
  sh.lineTo(ZF, 0);
  sh.lineTo(ZF - shoulder, ROOF_Y - yTop);
  sh.lineTo(-ZF + shoulder, ROOF_Y - yTop);
  sh.closePath();
  // 形状在 (u, v) = (z, y)，沿 +z 挤出 L，再转到沿 x
  const roof = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, steps: 1 });
  roof.rotateY(Math.PI / 2).translate(-L / 2, yTop, 0);
  roof.clearGroups();
  top.push(roof);
  const pod = box(xt(30), xt(48), ROOF_Y, ROOF_Y + 2 * ROW, -0.72, 0.54);

  // ── 车底暗影 + 轮罩 + 轮子 ──
  well.push(box(xt(3), xt(NX - 3), 0.14, Y0, -ZF + 0.18, ZF - 0.18));
  for (const w of WHEELS) {
    const cx = xt(w);
    well.push(box(cx - ARCH, cx + ARCH, 0.12, yr(R_BAND + 2), -ZF + 0.12, ZF - 0.08));
    const tyre = new THREE.CylinderGeometry(WR, WR, 0.32, 16).rotateX(Math.PI / 2).translate(cx, WR, ZF - 0.22);
    dark.push(tyre);
    const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10).rotateX(Math.PI / 2).translate(cx, WR, ZF - 0.04);
    silver.push(hub);
    // 背面那只轮子（俯视看不见，转个向时不缺）
    dark.push(new THREE.CylinderGeometry(WR, WR, 0.32, 16).rotateX(Math.PI / 2).translate(cx, WR, -ZF + 0.22));
  }

  // ── 后视镜：车头侧面伸出的一小块（1 纹素宽、3 行高） ──
  iron.push(box(xt(NX - 1), xt(NX + 1), yr(R_WIN + 1), yr(R_WIN + 4), ZF, ZF + T * 2));

  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (geos.length) g.add(new THREE.Mesh(merge(geos), mat));
  };
  add(cream, ctx.mat('stucco', FACE));
  add(blue, ctx.mat('counter', FACE));
  add(glass, ctx.mat('glass', { ...FACE, edge: 0.3, convex: 0.2 }));
  // 车顶：接投影（路边的树影会落上来）
  // 车顶不加元素：试过 paint 的晒旧斑，一整块台阶边的浅斑在 45° 下像一块影子；车顶就是一整块安静的亮面
  add(top, ctx.mat('stucco', { lightUp: 0.5, bands: [-0.45, 0.3] }));
  // 轮胎的正面落亮档（L 84），轮罩落暗档（L 34）：两块黑分得开，轮子才是一个圆
  add(dark, ctx.mat('tyre', { ...FACE, bands: [-0.9, -0.55], convex: 0.15 }));
  add(well, ctx.mat('tyre', { ...FACE, bands: [0.5, 0.9], convex: 0 }));
  add(silver, ctx.mat('carSilver', { ...FACE, noShadowReceive: true }));
  // 空调罩不投影：它的影子落在车顶前沿的斜肩上，毛边抖动成一排像字的小黑点
  const podMesh = new THREE.Mesh(pod, ctx.mat('carSilver', { ...FACE, noShadowReceive: true }));
  g.add(podMesh);
  add(iron, ctx.mat('ironwork', { ...FACE, noShadowReceive: true }));
  ctx.mats.prepare(g);
  podMesh.castShadow = false;
  return g;
}
